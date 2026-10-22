/**
 * Replay Map: which parts of a video you've actually played, and how often.
 *
 * Every video's timeline is split into BUCKETS equal slices. Each slice keeps
 * the seconds of the video's own timeline you've played inside it, summed
 * across every viewing, so dividing by the slice's length gives "passes":
 * 0 = never seen, 1 = watched once, 2+ = came back to it. Measured in media
 * time, so 2× playback still counts one pass, and seeking never fills a gap.
 */

export const BUCKETS = 120;
export const HEAT_PREFIX = 'h:';

export interface ReplayHeat {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  /** Video length in seconds. */
  duration: number;
  /** Seconds of timeline played per slice, across all viewings. */
  b: number[];
  /** Where you last were, in seconds. */
  pos: number;
  updatedAt: number;
}

/** A content script's unsent progress for one video. */
export interface HeatDelta {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  duration: number;
  /** slice index → seconds played */
  add: Record<number, number>;
  pos: number;
}

export const heatKey = (videoId: string) => `${HEAT_PREFIX}${videoId}`;

export const bucketOf = (t: number, duration: number) => Math.min(BUCKETS - 1, Math.max(0, Math.floor((t / duration) * BUCKETS)));

export function emptyHeat(d: Omit<HeatDelta, 'add' | 'pos'>): ReplayHeat {
  return { videoId: d.videoId, title: d.title, channelId: d.channelId, channelName: d.channelName, duration: d.duration, b: new Array(BUCKETS).fill(0), pos: 0, updatedAt: 0 };
}

export function applyDelta(prev: ReplayHeat | undefined, d: HeatDelta, now = Date.now()): ReplayHeat {
  const h = prev && prev.b?.length === BUCKETS ? { ...prev, b: [...prev.b] } : emptyHeat(d);
  for (const [i, s] of Object.entries(d.add)) {
    const k = Number(i);
    if (k >= 0 && k < BUCKETS && Number.isFinite(s) && s > 0) h.b[k] = Math.round((h.b[k] + s) * 10) / 10;
  }
  if (d.title) h.title = d.title;
  if (d.channelId) h.channelId = d.channelId;
  if (d.channelName) h.channelName = d.channelName;
  if (d.duration) h.duration = d.duration;
  h.pos = d.pos;
  h.updatedAt = now;
  return h;
}

/** Passes over each slice (0, 0.4, 1, 2.7, …). */
export function passes(h: ReplayHeat): number[] {
  const width = h.duration / BUCKETS;
  return h.b.map((s) => (width > 0 ? s / width : 0));
}

/** How a slice reads: unseen, seen once, or replayed (2×, 3×+). */
export function level(p: number): 0 | 1 | 2 | 3 {
  if (p < 0.5) return 0;
  if (p < 1.6) return 1;
  if (p < 2.6) return 2;
  return 3;
}

export function coverage(h: ReplayHeat): number {
  return passes(h).filter((p) => level(p) > 0).length / BUCKETS;
}

export interface Moment {
  videoId: string;
  /** Seconds. */
  start: number;
  end: number;
  /** Most passes over any slice in the moment, rounded. */
  peak: number;
}

/** Stretches you've played at least twice, hottest first. */
export function replayedMoments(h: ReplayHeat): Moment[] {
  const p = passes(h);
  const width = h.duration / BUCKETS;
  const out: Moment[] = [];
  let i = 0;
  while (i < BUCKETS) {
    if (level(p[i]) < 2) {
      i++;
      continue;
    }
    let j = i;
    let peak = 0;
    while (j < BUCKETS && level(p[j]) >= 2) peak = Math.max(peak, p[j++]);
    out.push({ videoId: h.videoId, start: Math.round(i * width), end: Math.round(j * width), peak: Math.round(peak) });
    i = j;
  }
  return out.sort((a, b) => b.peak - a.peak || b.end - b.start - (a.end - a.start));
}

/** Start of the first unseen stretch after `from` (wrapping to the start), in seconds. */
export function nextUnseen(h: ReplayHeat, from: number): number | null {
  const p = passes(h);
  const width = h.duration / BUCKETS;
  const startAt = bucketOf(from, h.duration) + 1;
  for (let k = 0; k < BUCKETS; k++) {
    const i = (startAt + k) % BUCKETS;
    // Skip lone slivers at the very end (credits, end cards).
    if (level(p[i]) === 0 && i < BUCKETS - 2) return Math.round(i * width);
  }
  return null;
}

export const LEVEL_COLORS = ['transparent', 'rgba(242,240,235,0.62)', '#f5d90a', '#e0429a'] as const;

/** The map as a CSS gradient, so it scales to any width without a canvas. */
export function heatGradient(h: ReplayHeat, colors: readonly string[] = LEVEL_COLORS): string {
  const p = passes(h);
  const stops: string[] = [];
  let i = 0;
  while (i < BUCKETS) {
    const l = level(p[i]);
    let j = i;
    while (j < BUCKETS && level(p[j]) === l) j++;
    const a = ((i / BUCKETS) * 100).toFixed(3);
    const b = ((j / BUCKETS) * 100).toFixed(3);
    stops.push(`${colors[l]} ${a}%`, `${colors[l]} ${b}%`);
    i = j;
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}
