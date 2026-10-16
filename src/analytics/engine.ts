/**
 * Core aggregates computed from raw watch records. Nothing here is stored —
 * every number is derived fresh from what was actually recorded, so fixing a
 * bug in a calculation fixes it for all past data too.
 */
import type { Channel, Database, Watch } from '../storage/schema';
import { classifyAll, type Category, type Classification } from './categories';
import { addDays, dayKey, monthKey, startOfDay, type Range } from './periods';

export interface Summary {
  watchSeconds: number;
  videos: number;
  creators: number;
  shorts: number;
  longform: number;
  /** Long-form videos with completion data, and how many were finished. */
  startedLong: number;
  completedLong: number;
  activeDays: number;
  /** Imported viewings whose watch time is unknown. */
  unknownTimeVideos: number;
}

export interface CreatorStat {
  channelId: string;
  channelName: string;
  avatar: string | null;
  watchSeconds: number;
  videos: number;
  sessions: number;
  firstSeen: number;
  lastSeen: number;
}

export interface CategoryShare {
  category: Category;
  seconds: number;
  videos: number;
  share: number;
}

export interface Session {
  start: number;
  end: number;
  watchSeconds: number;
  videos: number;
  channelIds: string[];
}

export interface VideoStat {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  watchSeconds: number;
  views: number;
}

export type CreatorMetric = 'time' | 'videos' | 'sessions';

const inRange = (w: Watch, r: Range) => w.timestamp >= r.start && w.timestamp < r.end;
const secs = (w: Watch) => w.watchedSeconds ?? 0;

export class Analytics {
  readonly watches: Watch[];
  readonly channels: Record<string, Channel>;
  readonly classes: Map<string, Classification>;
  readonly sessions: Session[];
  readonly sessionGapMs: number;
  readonly firstDataAt: number | null;

  constructor(readonly db: Database) {
    this.watches = db.watches;
    this.channels = db.channels;
    this.sessionGapMs = db.settings.sessionGapMinutes * 60_000;
    this.classes = classifyAll(this.watches);
    this.sessions = this.buildSessions();
    this.firstDataAt = this.watches.length ? this.watches[0].timestamp : null;
  }

  get hasData() {
    return this.watches.length > 0;
  }

  get hasTrackedData() {
    return this.watches.some((w) => w.source === 'tracked');
  }

  categoryOf(w: Watch): Category {
    return this.classes.get(w.id)?.category ?? 'Other';
  }

  in(r: Range): Watch[] {
    return this.watches.filter((w) => inRange(w, r));
  }

  summary(r: Range, list = this.in(r)): Summary {
    const creators = new Set<string>();
    const days = new Set<string>();
    const s: Summary = { watchSeconds: 0, videos: 0, creators: 0, shorts: 0, longform: 0, startedLong: 0, completedLong: 0, activeDays: 0, unknownTimeVideos: 0 };
    for (const w of list) {
      s.watchSeconds += secs(w);
      s.videos++;
      creators.add(w.channelId);
      days.add(dayKey(w.timestamp));
      if (w.isShort) s.shorts++;
      else s.longform++;
      if (w.watchedSeconds == null) s.unknownTimeVideos++;
      if (!w.isShort && !w.isLive && w.percentageWatched != null) {
        s.startedLong++;
        if (w.completed) s.completedLong++;
      }
    }
    s.creators = creators.size;
    s.activeDays = days.size;
    return s;
  }

  topCreators(r: Range, metric: CreatorMetric = 'time', limit = 50): CreatorStat[] {
    const map = new Map<string, CreatorStat>();
    for (const w of this.in(r)) {
      let c = map.get(w.channelId);
      if (!c) {
        const ch = this.channels[w.channelId];
        c = {
          channelId: w.channelId,
          channelName: ch?.channelName || w.channelName,
          avatar: ch?.avatar ?? null,
          watchSeconds: 0,
          videos: 0,
          sessions: 0,
          firstSeen: w.timestamp,
          lastSeen: w.timestamp,
        };
        map.set(w.channelId, c);
      }
      c.watchSeconds += secs(w);
      c.videos++;
      c.lastSeen = Math.max(c.lastSeen, w.timestamp);
    }
    for (const s of this.sessions) {
      if (s.start < r.start || s.start >= r.end) continue;
      for (const id of s.channelIds) {
        const c = map.get(id);
        if (c) c.sessions++;
      }
    }
    const key: Record<CreatorMetric, (c: CreatorStat) => number> = {
      time: (c) => c.watchSeconds * 1e4 + c.videos,
      videos: (c) => c.videos * 1e6 + c.watchSeconds,
      sessions: (c) => c.sessions * 1e6 + c.watchSeconds,
    };
    return [...map.values()].sort((a, b) => key[metric](b) - key[metric](a)).slice(0, limit);
  }

  /** Shares by watch time; falls back to video counts when time is unknown (imports). */
  categoryShares(r: Range, list = this.in(r)): { items: CategoryShare[]; byVideos: boolean } {
    const map = new Map<Category, CategoryShare>();
    let totalSecs = 0;
    for (const w of list) {
      const cat = this.categoryOf(w);
      const c = map.get(cat) ?? { category: cat, seconds: 0, videos: 0, share: 0 };
      c.seconds += secs(w);
      c.videos++;
      totalSecs += secs(w);
      map.set(cat, c);
    }
    const byVideos = totalSecs < 60;
    const total = byVideos ? list.length : totalSecs;
    const items = [...map.values()]
      .map((c) => ({ ...c, share: total ? (byVideos ? c.videos : c.seconds) / total : 0 }))
      .sort((a, b) => b.share - a.share);
    return { items, byVideos };
  }

  private buildSessions(): Session[] {
    const out: Session[] = [];
    let cur: (Session & { ids: Set<string> }) | null = null;
    for (const w of this.watches) {
      if (w.source !== 'tracked' || !w.watchedSeconds) continue;
      if (!cur || w.timestamp - cur.end > this.sessionGapMs) {
        if (cur) out.push({ ...cur, channelIds: [...cur.ids] });
        cur = { start: w.timestamp, end: w.endedAt, watchSeconds: 0, videos: 0, channelIds: [], ids: new Set() };
      }
      cur.end = Math.max(cur.end, w.endedAt);
      cur.watchSeconds += w.watchedSeconds;
      cur.videos++;
      cur.ids.add(w.channelId);
    }
    if (cur) out.push({ start: cur.start, end: cur.end, watchSeconds: cur.watchSeconds, videos: cur.videos, channelIds: [...cur.ids] });
    return out;
  }

  sessionsIn(r: Range): Session[] {
    return this.sessions.filter((s) => s.start >= r.start && s.start < r.end);
  }

  longestSession(r: Range): Session | null {
    let best: Session | null = null;
    for (const s of this.sessionsIn(r)) if (!best || s.watchSeconds > best.watchSeconds) best = s;
    return best;
  }

  /** Seconds watched per local hour of day (0–23). */
  hourly(r: Range): number[] {
    const hours = new Array(24).fill(0);
    for (const w of this.in(r)) {
      if (!w.watchedSeconds) continue;
      // Spread each viewing across the hours it actually spanned.
      let t = w.timestamp;
      let remaining = w.watchedSeconds;
      const wall = Math.max(1, (w.endedAt - w.timestamp) / 1000);
      const ratio = Math.min(1, w.watchedSeconds / wall);
      while (remaining > 0.5) {
        const d = new Date(t);
        const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
        const chunk = Math.min(remaining, ((nextHour - t) / 1000) * ratio || remaining);
        hours[d.getHours()] += chunk;
        remaining -= chunk;
        t = nextHour;
      }
    }
    return hours;
  }

  daily(r: Range): Array<{ day: number; seconds: number; videos: number }> {
    const days: Array<{ day: number; seconds: number; videos: number }> = [];
    const index = new Map<string, number>();
    for (let t = startOfDay(r.start); t < r.end; t = addDays(t, 1)) {
      index.set(dayKey(t), days.length);
      days.push({ day: t, seconds: 0, videos: 0 });
    }
    for (const w of this.in(r)) {
      const i = index.get(dayKey(w.timestamp));
      if (i == null) continue;
      days[i].seconds += secs(w);
      days[i].videos++;
    }
    return days;
  }

  monthly(r: Range): Array<{ key: string; start: number; seconds: number; videos: number }> {
    const map = new Map<string, { key: string; start: number; seconds: number; videos: number }>();
    for (let t = r.start; t < r.end; ) {
      const d = new Date(t);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      map.set(monthKey(start), { key: monthKey(start), start, seconds: 0, videos: 0 });
      t = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    }
    for (const w of this.in(r)) {
      const m = map.get(monthKey(w.timestamp));
      if (!m) continue;
      m.seconds += secs(w);
      m.videos++;
    }
    return [...map.values()];
  }

  topVideos(r: Range, limit = 5): VideoStat[] {
    const map = new Map<string, VideoStat>();
    for (const w of this.in(r)) {
      const v = map.get(w.videoId) ?? { videoId: w.videoId, title: w.title, channelId: w.channelId, channelName: w.channelName, thumbnail: w.thumbnail, watchSeconds: 0, views: 0 };
      v.watchSeconds += secs(w);
      v.views++;
      if (!v.title && w.title) v.title = w.title;
      map.set(w.videoId, v);
    }
    return [...map.values()].sort((a, b) => b.watchSeconds - a.watchSeconds || b.views - a.views).slice(0, limit);
  }

  /** Channels you watched for the first time inside `r`. */
  newCreators(r: Range): CreatorStat[] {
    const first = new Map<string, number>();
    for (const w of this.watches) if (!first.has(w.channelId)) first.set(w.channelId, w.timestamp);
    const ids = new Set([...first].filter(([, t]) => t >= r.start && t < r.end).map(([id]) => id));
    return this.topCreators(r, 'time', 500).filter((c) => ids.has(c.channelId));
  }

  /** A day counts toward a streak if you watched anything that day. */
  streaks(now = Date.now()): { current: number; longest: number; longestEnd: number | null } {
    const days = new Set(this.watches.map((w) => dayKey(w.timestamp)));
    const sorted = [...days].sort();
    let longest = 0;
    let longestEnd: number | null = null;
    let run = 0;
    let prev: number | null = null;
    for (const k of sorted) {
      const [y, m, d] = k.split('-').map(Number);
      const t = new Date(y, m - 1, d).getTime();
      run = prev != null && dayKey(addDays(prev, 1)) === k ? run + 1 : 1;
      if (run > longest) {
        longest = run;
        longestEnd = t;
      }
      prev = t;
    }
    // Today still counts as "in progress": a streak ending yesterday is alive.
    let current = 0;
    let t = startOfDay(now);
    if (!days.has(dayKey(t))) t = addDays(t, -1);
    while (days.has(dayKey(t))) {
      current++;
      t = addDays(t, -1);
    }
    return { current, longest, longestEnd };
  }

  creatorWatches(channelId: string): Watch[] {
    return this.watches.filter((w) => w.channelId === channelId);
  }
}

export interface Milestone {
  id: string;
  label: string;
  reachedAt: number | null;
  progress: number;
}

const HOUR_MARKS = [10, 50, 100, 250, 500, 1000, 2500];
const VIDEO_MARKS = [100, 500, 1000, 5000, 10000];
const CREATOR_MARKS = [25, 100, 250, 500];

/** The next unreached and all reached milestones, each with the date it was hit. */
export function milestones(a: Analytics): Milestone[] {
  let secsSoFar = 0;
  let videos = 0;
  const creators = new Set<string>();
  const reached = new Map<string, number>();
  const check = (id: string, value: number, mark: number, t: number) => {
    if (value >= mark && !reached.has(id)) reached.set(id, t);
  };
  for (const w of a.watches) {
    secsSoFar += w.watchedSeconds ?? 0;
    videos++;
    creators.add(w.channelId);
    for (const h of HOUR_MARKS) check(`h${h}`, secsSoFar / 3600, h, w.timestamp);
    for (const v of VIDEO_MARKS) check(`v${v}`, videos, v, w.timestamp);
    for (const c of CREATOR_MARKS) check(`c${c}`, creators.size, c, w.timestamp);
  }
  const out: Milestone[] = [];
  const add = (marks: number[], prefix: string, value: number, label: (n: number) => string) => {
    // The most recent milestone reached and the next one ahead.
    const hit = marks.filter((m) => reached.has(`${prefix}${m}`));
    const next = marks.find((m) => !reached.has(`${prefix}${m}`));
    for (const m of [hit[hit.length - 1], next]) {
      if (m == null) continue;
      out.push({ id: `${prefix}${m}`, label: label(m), reachedAt: reached.get(`${prefix}${m}`) ?? null, progress: Math.min(1, value / m) });
    }
  };
  add(HOUR_MARKS, 'h', secsSoFar / 3600, (n) => `${n.toLocaleString()} hours watched`);
  add(VIDEO_MARKS, 'v', videos, (n) => `${n.toLocaleString()} videos`);
  add(CREATOR_MARKS, 'c', creators.size, (n) => `${n} creators`);
  return out;
}
