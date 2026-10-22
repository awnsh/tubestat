/**
 * Replay Map inside YouTube's player (isolated content script).
 *
 * Records which slices of the timeline you play, draws your personal map as a
 * thin strip on the seek bar, and offers a small chip to resume where you left
 * off or jump to the next part you haven't seen. Reading the page and setting
 * video.currentTime is all it does; it never touches YouTube's own controls.
 */
import type { PlayerSample } from '../youtube/bridge-protocol';
import { applyDelta, bucketOf, clock, coverage, emptyHeat, heatGradient, heatKey, nextUnseen, type HeatDelta, type ReplayHeat } from './heat';

/** Longest forward step between samples still treated as playback, not a seek. */
const MAX_STEP = 5;
const SEND_EVERY_MS = 10_000;
const CHIP_MS = 14_000;
const STRIP_ID = 'tubestat-replay-strip';
const CHIP_ID = 'tubestat-replay-chip';

interface Current {
  videoId: string;
  heat: ReplayHeat;
  loaded: boolean;
  pending: HeatDelta | null;
  lastTime: number | null;
  lastSentAt: number;
  chipShown: boolean;
}

export class ReplayMap {
  private cur: Current | null = null;
  private enabled = true;
  private lastGradient = '';

  constructor(private send: (delta: HeatDelta) => void) {}

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.removeUi();
  }

  tick(s: PlayerSample | null, now: number) {
    if (!s || s.isShort || s.isLive || s.ad || !s.channelId) {
      if (this.cur) this.cur.lastTime = null;
      return;
    }
    const duration = s.lengthSeconds || Math.round(s.duration);
    if (!duration) return;

    if (this.cur?.videoId !== s.videoId) this.start(s, duration);
    const c = this.cur!;
    c.heat.duration = duration;

    const t = s.currentTime;
    if (!s.paused && !s.ended && c.lastTime != null) {
      const step = t - c.lastTime;
      if (step > 0 && step <= MAX_STEP) this.add(c, s, duration, c.lastTime, t);
    }
    c.lastTime = s.paused || s.ended ? null : t;
    if (c.pending) c.pending.pos = t;

    if (c.loaded && c.pending && now - c.lastSentAt >= SEND_EVERY_MS) this.flush(now);
    if (this.enabled) this.render(c, t);
  }

  flush(now = Date.now()) {
    const c = this.cur;
    if (!c?.loaded || !c.pending || !Object.keys(c.pending.add).length) return;
    this.send(c.pending);
    c.pending = null;
    c.lastSentAt = now;
  }

  private start(s: PlayerSample, duration: number) {
    this.flush();
    this.removeUi();
    const meta = { videoId: s.videoId, title: s.title, channelId: s.channelId, channelName: s.channelName, duration };
    const c: Current = { videoId: s.videoId, heat: emptyHeat(meta), loaded: false, pending: null, lastTime: null, lastSentAt: Date.now(), chipShown: false };
    this.cur = c;
    chrome.storage.local
      .get(heatKey(s.videoId))
      .then((r) => {
        if (this.cur !== c) return;
        const stored = r[heatKey(s.videoId)] as ReplayHeat | undefined;
        // Fold anything played while the read was in flight on top of what was stored.
        if (stored) c.heat = c.pending ? applyDelta(stored, c.pending) : stored;
        c.loaded = true;
      })
      .catch(() => {
        c.loaded = true;
      });
  }

  /** Spread one step of playback [from, to) across the slices it crossed. */
  private add(c: Current, s: PlayerSample, duration: number, from: number, to: number) {
    const width = duration / c.heat.b.length;
    c.pending ??= { videoId: c.videoId, title: s.title, channelId: s.channelId, channelName: s.channelName, duration, add: {}, pos: to };
    let a = from;
    while (a < to) {
      const i = bucketOf(a, duration);
      const sliceEnd = Math.min(to, (i + 1) * width);
      const secs = Math.max(0, sliceEnd - a);
      c.pending.add[i] = (c.pending.add[i] ?? 0) + secs;
      c.heat.b[i] += secs;
      if (sliceEnd <= a) break;
      a = sliceEnd;
    }
  }

  /* ---------- UI ---------- */

  private render(c: Current, t: number) {
    const player = document.getElementById('movie_player');
    const bar = player?.querySelector('.ytp-progress-bar') as HTMLElement | null;
    if (!player || !bar) return;

    let strip = document.getElementById(STRIP_ID);
    if (!strip || strip.parentElement !== bar) {
      strip?.remove();
      strip = document.createElement('div');
      strip.id = STRIP_ID;
      strip.setAttribute('aria-hidden', 'true');
      Object.assign(strip.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        bottom: 'calc(100% + 3px)',
        height: '3px',
        borderRadius: '2px',
        pointerEvents: 'none',
        zIndex: '40',
        background: 'rgba(242,240,235,0.08)',
        transition: 'opacity 200ms',
      } satisfies Partial<CSSStyleDeclaration>);
      bar.appendChild(strip);
      this.lastGradient = '';
    }
    const gradient = heatGradient(c.heat);
    if (gradient !== this.lastGradient) {
      strip.style.backgroundImage = gradient;
      this.lastGradient = gradient;
    }

    if (c.loaded && !c.chipShown) {
      c.chipShown = true;
      this.maybeChip(player, c, t);
    }
  }

  private maybeChip(player: HTMLElement, c: Current, t: number) {
    const h = c.heat;
    const cov = coverage(h);
    if (cov < 0.03 || t > 20) return;
    const resumeAt = h.pos > 30 && h.pos < h.duration - 30 ? h.pos : null;
    const unseen = cov < 0.95 ? nextUnseen(h, Math.max(t, 1)) : null;
    const jumpTo = unseen != null && (resumeAt == null || Math.abs(unseen - resumeAt) > 15) ? unseen : null;
    if (resumeAt == null && jumpTo == null && cov < 0.95) return;

    const host = document.createElement('div');
    host.id = CHIP_ID;
    Object.assign(host.style, { position: 'absolute', left: '12px', bottom: '64px', zIndex: '60' });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .chip { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 10px; border-radius: 999px;
          background: rgba(17,17,19,0.88); color: #f2f0eb; font: 500 12.5px/1 Roboto, system-ui, sans-serif;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4); backdrop-filter: blur(8px);
          animation: in 380ms cubic-bezier(0.34,1.56,0.64,1) both; }
        .chip.out { animation: out 220ms ease-in both; }
        @keyframes in { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
        @keyframes out { to { opacity: 0; transform: translateY(6px); } }
        .bars { display: flex; gap: 1.5px; margin-right: 6px; }
        .bars i { width: 3px; height: 12px; border-radius: 1px; }
        .label { color: #9b9994; margin-right: 4px; white-space: nowrap; }
        button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 999px; background: rgba(242,240,235,0.1); white-space: nowrap; }
        button:hover { background: rgba(242,240,235,0.2); }
        button:focus-visible { outline: 2px solid #f2f0eb; }
        .x { padding: 6px 8px; background: none; color: #9b9994; }
      </style>
      <div class="chip" role="group" aria-label="TubeStat Replay Map">
        <span class="bars"><i style="background:#f5d90a"></i><i style="background:#2cd4e0"></i><i style="background:#e0429a"></i></span>
        <span class="label">${cov >= 0.95 ? 'You’ve seen all of this' : `${Math.round(cov * 100)}% seen`}</span>
        ${resumeAt != null ? `<button data-to="${resumeAt}">Resume ${clock(resumeAt)}</button>` : ''}
        ${jumpTo != null ? `<button data-to="${jumpTo}">Next unseen ${clock(jumpTo)}</button>` : ''}
        <button class="x" aria-label="Dismiss">✕</button>
      </div>`;

    const close = () => {
      const chip = root.querySelector('.chip');
      chip?.classList.add('out');
      setTimeout(() => host.remove(), 220);
    };
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const to = Number((b as HTMLElement).dataset.to);
        const video = player.querySelector('video');
        if (video && Number.isFinite(to)) video.currentTime = to;
        close();
      }),
    );
    // Clicks on the chip must not reach the player (which would pause/play).
    host.addEventListener('click', (e) => e.stopPropagation());
    document.getElementById(CHIP_ID)?.remove();
    player.appendChild(host);
    setTimeout(close, CHIP_MS);
  }

  private removeUi() {
    document.getElementById(STRIP_ID)?.remove();
    document.getElementById(CHIP_ID)?.remove();
    this.lastGradient = '';
  }
}
