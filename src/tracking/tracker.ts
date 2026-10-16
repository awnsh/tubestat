/**
 * Turns once-a-second player samples into Watch records.
 *
 * Watch time is real elapsed time while the video is actually playing —
 * pauses, buffering-stalls longer than a few seconds, and ads are excluded.
 * Completion is the share of the video's timeline you covered, so skipping
 * to the end doesn't count as finishing it.
 */
import type { PlayerSample } from '../youtube/bridge-protocol';
import { thumbnailFor } from '../youtube/parse';
import type { Watch } from '../storage/schema';

export interface TrackerOptions {
  minWatchSeconds: number;
  /** A paused video left longer than this starts a new viewing when resumed. */
  resumeGapMs: number;
  saveIntervalMs: number;
  trackShorts: boolean;
}

/** Longest gap between samples we still count as continuous playback. */
const MAX_TICK_MS = 5000;
const COMPLETE_AT = 90;

interface Active {
  watch: Watch;
  covered: Set<number>;
  lastPlayingAt: number | null;
  lastSavedAt: number;
  dirty: boolean;
}

function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class WatchTracker {
  private active: Active | null = null;
  constructor(private opts: TrackerOptions) {}

  setOptions(opts: Partial<TrackerOptions>) {
    this.opts = { ...this.opts, ...opts };
  }

  get current(): Watch | null {
    return this.active?.watch ?? null;
  }

  /** Feed one sample; returns records that should be persisted now. */
  tick(s: PlayerSample | null, now: number): Watch[] {
    const out: Watch[] = [];
    const a = this.active;

    if (!s || (s.isShort && !this.opts.trackShorts)) {
      if (a) a.lastPlayingAt = null;
      this.maybeSave(out, now, false);
      return out;
    }

    const stale = a && a.watch.videoId === s.videoId && now - a.watch.endedAt > this.opts.resumeGapMs && !this.isPlaying(s);
    if (!a || a.watch.videoId !== s.videoId || stale) {
      this.flush(out);
      this.active = this.start(s, now);
    }

    const cur = this.active!;
    this.enrich(cur.watch, s);

    if (this.isPlaying(s)) {
      if (cur.lastPlayingAt != null) {
        const delta = now - cur.lastPlayingAt;
        if (delta > 0 && delta <= MAX_TICK_MS) {
          cur.watch.watchedSeconds = (cur.watch.watchedSeconds ?? 0) + delta / 1000;
          cur.dirty = true;
        }
      }
      cur.lastPlayingAt = now;
      cur.covered.add(Math.floor(s.currentTime));
      cur.watch.endedAt = now;
    } else {
      cur.lastPlayingAt = null;
    }

    this.updateCompletion(cur, s);
    this.maybeSave(out, now, false);
    return out;
  }

  /** Persist whatever is pending (tab hidden, page unloading, video changed). */
  flush(out: Watch[] = []): Watch[] {
    this.maybeSave(out, Date.now(), true);
    return out;
  }

  private isPlaying(s: PlayerSample) {
    return !s.paused && !s.ended && !s.ad;
  }

  private start(s: PlayerSample, now: number): Active {
    return {
      watch: {
        id: newId(),
        videoId: s.videoId,
        title: s.title,
        channelId: s.channelId,
        channelName: s.channelName,
        thumbnail: thumbnailFor(s.videoId),
        duration: s.lengthSeconds || 0,
        watchedSeconds: 0,
        percentageWatched: s.isLive ? null : 0,
        timestamp: now,
        endedAt: now,
        completed: false,
        isShort: s.isShort,
        isLive: s.isLive,
        ytCategory: s.category,
        source: 'tracked',
      },
      covered: new Set(),
      lastPlayingAt: null,
      lastSavedAt: 0,
      dirty: false,
    };
  }

  /** Metadata can arrive a beat after playback starts; fill gaps as it does. */
  private enrich(w: Watch, s: PlayerSample) {
    if (!w.title && s.title) w.title = s.title;
    if (!w.channelId && s.channelId) w.channelId = s.channelId;
    if (!w.channelName && s.channelName) w.channelName = s.channelName;
    if (!w.ytCategory && s.category) w.ytCategory = s.category;
    if (!w.duration) w.duration = s.lengthSeconds || (s.isLive ? 0 : Math.round(s.duration));
    if (s.isLive) w.isLive = true;
  }

  private updateCompletion(a: Active, s: PlayerSample) {
    const w = a.watch;
    if (w.isLive || !w.duration) return;
    // Loops (Shorts) and replays can't push coverage past the video's length.
    const pct = Math.min(100, (a.covered.size / Math.max(1, Math.floor(w.duration))) * 100);
    const rounded = Math.round(pct * 10) / 10;
    if (rounded !== w.percentageWatched) {
      w.percentageWatched = rounded;
      a.dirty = true;
    }
    const done = pct >= COMPLETE_AT || (s.ended && pct >= 50);
    if (done && !w.completed) {
      w.completed = true;
      a.dirty = true;
    }
  }

  private maybeSave(out: Watch[], now: number, force: boolean) {
    const a = this.active;
    if (!a || !a.dirty) return;
    const w = a.watch;
    if (!w.channelId || (w.watchedSeconds ?? 0) < this.opts.minWatchSeconds) return;
    if (!force && now - a.lastSavedAt < this.opts.saveIntervalMs) return;
    w.watchedSeconds = Math.round((w.watchedSeconds ?? 0) * 10) / 10;
    out.push({ ...w });
    a.lastSavedAt = now;
    a.dirty = false;
  }
}
