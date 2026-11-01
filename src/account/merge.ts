/**
 * How two devices' TubeStat data become one.
 *
 * Every viewing has its own id, so watches simply combine; the same viewing
 * seen twice keeps whichever copy got further. Channels and subscriptions keep
 * the newest details but never lose history (subscriber snapshots, the earliest
 * first-seen, a subscription date). Nothing is ever deleted by a merge.
 */
import type { Channel, FriendGroup, Subscription, Watch } from '../storage/schema';
import type { ReplayHeat } from '../replay/heat';

const DAY_MS = 86_400_000;

/** JSON with object keys sorted, so equal data gives equal text (and hash) on every device. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const further = (a: Watch, b: Watch) => (b.endedAt > a.endedAt || (b.endedAt === a.endedAt && (b.watchedSeconds ?? 0) > (a.watchedSeconds ?? 0)) ? b : a);

export function mergeWatches(local: Record<string, Watch>, remote: Record<string, Watch>): Record<string, Watch> {
  const out = { ...local };
  for (const [id, w] of Object.entries(remote)) out[id] = out[id] ? further(out[id], w) : w;
  return out;
}

/**
 * One device may have tracked a video that another only read from the YouTube
 * history page. The tracked viewing is the real one; drop the history copy.
 */
export function dropHistoryDuplicates(shards: Record<string, Record<string, Watch>>): Set<string> {
  const real = new Map<string, number[]>();
  for (const shard of Object.values(shards)) {
    for (const w of Object.values(shard)) {
      if (w.source === 'history') continue;
      if (!real.has(w.videoId)) real.set(w.videoId, []);
      real.get(w.videoId)!.push(w.timestamp);
    }
  }
  const touched = new Set<string>();
  for (const [key, shard] of Object.entries(shards)) {
    for (const w of Object.values(shard)) {
      if (w.source !== 'history') continue;
      // History entries sit at noon of their day; anything within that day ±1 counts as the same viewing.
      if (real.get(w.videoId)?.some((t) => Math.abs(t - w.timestamp) < 1.5 * DAY_MS)) {
        delete shard[w.id];
        touched.add(key);
      }
    }
  }
  return touched;
}

export function mergeChannels(local: Record<string, Channel>, remote: Record<string, Channel>): Record<string, Channel> {
  const out = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const l = out[id];
    if (!l) {
      out[id] = r;
      continue;
    }
    const newer = (r.updatedAt ?? 0) > (l.updatedAt ?? 0) ? r : l;
    const older = newer === r ? l : r;
    // One snapshot per day; the later reading of a day wins.
    const byDay = new Map<string, Channel['subscriberHistory'][number]>();
    for (const s of [...(older.subscriberHistory ?? []), ...(newer.subscriberHistory ?? [])]) {
      const day = new Date(s.t).toDateString();
      const prev = byDay.get(day);
      if (!prev || s.t >= prev.t) byDay.set(day, s);
    }
    out[id] = {
      ...older,
      ...newer,
      handle: newer.handle ?? older.handle,
      avatar: newer.avatar ?? older.avatar,
      subscriberCount: newer.subscriberCount ?? older.subscriberCount,
      createdAt: newer.createdAt ?? older.createdAt,
      firstSeen: Math.min(l.firstSeen, r.firstSeen),
      subscriberHistory: [...byDay.values()].sort((a, b) => a.t - b.t),
    };
  }
  return out;
}

const DATE_RANK = { observed: 3, api: 2 } as Record<string, number>;

export function mergeSubscriptions(local: Record<string, Subscription>, remote: Record<string, Subscription>): Record<string, Subscription> {
  const out = { ...local };
  for (const [id, r] of Object.entries(remote)) {
    const l = out[id];
    if (!l) {
      out[id] = r;
      continue;
    }
    const newer = r.lastObserved > l.lastObserved ? r : l;
    // A date captured live beats one from the API, which beats none.
    const dated = (DATE_RANK[r.subscriptionDateSource ?? ''] ?? 0) > (DATE_RANK[l.subscriptionDateSource ?? ''] ?? 0) ? r : l;
    // A count seen live beats an archive estimate; an estimate only counts if it was for the date kept.
    const counted = [dated, dated === r ? l : r].find(
      (s) => s.subscriberCountAtSubscription != null && (s.countAtSubscriptionSource !== 'archive' ? s === dated : s.subscriptionDate === dated.subscriptionDate),
    );
    out[id] = {
      ...newer,
      subscriptionDate: dated.subscriptionDate,
      subscriptionDateSource: dated.subscriptionDateSource,
      subscriberCountAtSubscription: counted?.subscriberCountAtSubscription ?? null,
      countAtSubscriptionSource: counted?.countAtSubscriptionSource ?? null,
      archive: counted?.archive ?? null,
      archiveCheckedAt: Math.max(l.archiveCheckedAt ?? 0, r.archiveCheckedAt ?? 0) || null,
      firstObserved: Math.min(l.firstObserved, r.firstObserved),
    };
  }
  return out;
}

export function mergeGroups(local: FriendGroup[], remote: FriendGroup[]): FriendGroup[] {
  const byId = new Map(local.map((g) => [g.id, g]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l) {
      byId.set(r.id, r);
      continue;
    }
    const members = new Map(l.members.map((m) => [m.memberId, m]));
    for (const m of r.members) {
      const have = members.get(m.memberId);
      if (!have || m.updatedAt > have.updatedAt) members.set(m.memberId, m);
    }
    byId.set(r.id, { ...l, members: [...members.values()] });
  }
  return [...byId.values()];
}

/** Replay Maps don't say which device added what, so the most recently updated map wins. */
export function mergeReplays(local: Record<string, ReplayHeat>, remote: Record<string, ReplayHeat>): Record<string, ReplayHeat> {
  const out = { ...local };
  for (const [id, r] of Object.entries(remote)) if (!out[id] || r.updatedAt > out[id].updatedAt) out[id] = r;
  return out;
}

/** The running totals on each channel, recomputed from the merged watches. */
export function recountChannels(channels: Record<string, Channel>, watches: Iterable<Watch>): void {
  const totals = new Map<string, { secs: number; videos: number; first: number }>();
  for (const w of watches) {
    if (!w.channelId) continue;
    const t = totals.get(w.channelId) ?? { secs: 0, videos: 0, first: w.timestamp };
    t.secs += w.watchedSeconds ?? 0;
    t.videos++;
    t.first = Math.min(t.first, w.timestamp);
    totals.set(w.channelId, t);
  }
  for (const ch of Object.values(channels)) {
    const t = totals.get(ch.channelId);
    ch.totalWatchTime = t?.secs ?? 0;
    ch.videosWatched = t?.videos ?? 0;
    if (t) ch.firstSeen = Math.min(ch.firstSeen, t.first);
  }
}
