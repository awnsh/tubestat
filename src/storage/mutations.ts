/**
 * All writes to watch, channel and subscription data go through here.
 * In the extension these run only inside the background service worker,
 * which serialises them, so concurrent tabs can never clobber each other.
 */
import { kvClear, kvGet, kvGetMany, kvSet } from './kv';
import { newMeta, shardKey } from './db';
import { applyDelta, heatKey, type HeatDelta, type ReplayHeat } from '../replay/heat';
import type { ApiSyncPayload, Channel, DataSource, Meta, Subscription, TrackerMessage, Watch } from './schema';
import type { HistoryItem } from '../youtube/bridge-protocol';
import { thumbnailFor } from '../youtube/parse';

let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function loadCore() {
  const got = await kvGetMany(['meta', 'channels', 'subscriptions']);
  return {
    meta: { ...newMeta(), ...((got.meta as Meta) ?? {}) },
    channels: (got.channels as Record<string, Channel>) ?? {},
    subscriptions: (got.subscriptions as Record<string, Subscription>) ?? {},
  };
}

function blankChannel(channelId: string, channelName: string, firstSeen: number): Channel {
  return {
    channelId,
    channelName,
    handle: null,
    avatar: null,
    url: `https://www.youtube.com/channel/${channelId}`,
    subscriberCount: null,
    firstSeen,
    totalWatchTime: 0,
    videosWatched: 0,
    createdAt: null,
    subscriberHistory: [],
    lastSeenSubscribed: null,
    lastSeenSubscribedAt: null,
    updatedAt: Date.now(),
  };
}

function ensureChannel(channels: Record<string, Channel>, id: string, name: string, firstSeen = Date.now()): Channel {
  let ch = channels[id];
  if (!ch) {
    ch = blankChannel(id, name, firstSeen);
    channels[id] = ch;
  }
  // Rows written by older versions may lack newer fields.
  ch.subscriberHistory ??= [];
  ch.lastSeenSubscribed ??= null;
  ch.lastSeenSubscribedAt ??= null;
  if (name && (!ch.channelName || ch.channelName === ch.channelId)) ch.channelName = name;
  return ch;
}

function applyIdentity(ch: Channel, info: { channelName?: string; handle?: string | null; avatar?: string | null }) {
  if (info.channelName) ch.channelName = info.channelName;
  if (info.handle) {
    ch.handle = info.handle;
    ch.url = `https://www.youtube.com/${info.handle}`;
  }
  if (info.avatar) ch.avatar = info.avatar;
}

/** Keeps at most one snapshot per calendar day (the latest wins). */
function recordSubscriberCount(ch: Channel, count: number | null, source: DataSource, t = Date.now()) {
  if (count == null || !Number.isFinite(count)) return;
  ch.subscriberCount = count;
  const last = ch.subscriberHistory[ch.subscriberHistory.length - 1];
  if (last && dayKey(last.t) === dayKey(t)) {
    last.count = count;
    last.t = t;
    last.source = source;
  } else {
    ch.subscriberHistory.push({ t, count, source });
  }
}

function blankSubscription(channelId: string, now: number): Subscription {
  return {
    channelId,
    subscriptionDate: null,
    subscriptionDateSource: null,
    subscriberCountAtSubscription: null,
    currentSubscriberCount: null,
    firstObserved: now,
    lastObserved: now,
    active: true,
  };
}

export function upsertWatch(watch: Watch) {
  return locked(async () => {
    const key = shardKey(watch.timestamp);
    const [{ meta, channels }, shard] = await Promise.all([loadCore(), kvGet<Record<string, Watch>>(key)]);
    const month = shard ?? {};
    const prev = month[watch.id];
    month[watch.id] = watch;

    const ch = ensureChannel(channels, watch.channelId, watch.channelName, watch.timestamp);
    ch.firstSeen = Math.min(ch.firstSeen, watch.timestamp);
    ch.totalWatchTime += Math.max(0, (watch.watchedSeconds ?? 0) - (prev?.watchedSeconds ?? 0));
    if (!prev) ch.videosWatched += 1;
    ch.updatedAt = Date.now();

    const today = dayKey(watch.endedAt);
    if (!meta.activeDays.includes(today)) meta.activeDays.push(today);

    await kvSet({ [key]: month, channels, meta });
  });
}

export function addHeat(delta: HeatDelta) {
  return locked(async () => {
    const key = heatKey(delta.videoId);
    await kvSet({ [key]: applyDelta(await kvGet<ReplayHeat>(key), delta) });
  });
}

export function channelSeen(msg: Extract<TrackerMessage, { type: 'channel:seen' }>) {
  return locked(async () => {
    const { channels, subscriptions } = await loadCore();
    const now = Date.now();
    const info = msg.channel;
    const ch = ensureChannel(channels, info.channelId, info.channelName);
    applyIdentity(ch, info);
    recordSubscriberCount(ch, info.subscriberCount, 'page', now);

    let sub = subscriptions[info.channelId];
    if (msg.subscribed === true) {
      if (!sub || !sub.active) {
        const sawUnsubscribed = ch.lastSeenSubscribed === false;
        sub = sub ? { ...sub, active: true } : blankSubscription(info.channelId, now);
        // We saw the button flip from "Subscribe" to "Subscribed": this is the real date.
        if (sawUnsubscribed) {
          sub.subscriptionDate = now;
          sub.subscriptionDateSource = 'observed';
          sub.subscriberCountAtSubscription = info.subscriberCount;
        }
        subscriptions[info.channelId] = sub;
      }
      sub.lastObserved = now;
      sub.currentSubscriberCount = info.subscriberCount ?? sub.currentSubscriberCount;
    } else if (msg.subscribed === false && sub?.active) {
      sub.active = false;
      sub.lastObserved = now;
    }
    if (msg.subscribed != null) {
      ch.lastSeenSubscribed = msg.subscribed;
      ch.lastSeenSubscribedAt = now;
    }
    ch.updatedAt = now;
    await kvSet({ channels, subscriptions });
  });
}

export function syncSubscriptions(msg: Extract<TrackerMessage, { type: 'subscriptions:sync' }>) {
  return locked(async () => {
    const { meta, channels, subscriptions } = await loadCore();
    const now = Date.now();
    const seen = new Set<string>();
    for (const info of msg.channels) {
      seen.add(info.channelId);
      const ch = ensureChannel(channels, info.channelId, info.channelName);
      applyIdentity(ch, info);
      recordSubscriberCount(ch, info.subscriberCount, 'page', now);
      ch.lastSeenSubscribed = true;
      ch.lastSeenSubscribedAt = now;
      const sub = subscriptions[info.channelId] ?? blankSubscription(info.channelId, now);
      sub.active = true;
      sub.lastObserved = now;
      sub.currentSubscriberCount = info.subscriberCount ?? sub.currentSubscriberCount;
      subscriptions[info.channelId] = sub;
    }
    if (msg.complete) {
      for (const sub of Object.values(subscriptions)) if (!seen.has(sub.channelId)) sub.active = false;
    }
    meta.lastSubscriptionSync = now;
    await kvSet({ channels, subscriptions, meta });
  });
}

export function applyApiSync(payload: ApiSyncPayload) {
  return locked(async () => {
    const { meta, channels, subscriptions } = await loadCore();
    const now = Date.now();
    for (const c of payload.channels) {
      const ch = ensureChannel(channels, c.channelId, c.channelName);
      applyIdentity(ch, c);
      if (c.createdAt) ch.createdAt = c.createdAt;
      recordSubscriberCount(ch, c.subscriberCount, 'api', now);
      ch.updatedAt = now;
    }
    const seen = new Set<string>();
    for (const s of payload.subscriptions) {
      seen.add(s.channelId);
      const ch = ensureChannel(channels, s.channelId, s.channelName);
      if (s.avatar && !ch.avatar) ch.avatar = s.avatar;
      ch.lastSeenSubscribed = true;
      const sub = subscriptions[s.channelId] ?? blankSubscription(s.channelId, now);
      // A date captured live is equally real and also carries the subscriber count; keep it.
      if (sub.subscriptionDateSource !== 'observed') {
        sub.subscriptionDate = s.subscribedAt;
        sub.subscriptionDateSource = 'api';
      }
      sub.active = true;
      sub.lastObserved = now;
      sub.currentSubscriberCount = ch.subscriberCount;
      subscriptions[s.channelId] = sub;
    }
    for (const sub of Object.values(subscriptions)) if (!seen.has(sub.channelId)) sub.active = false;
    meta.lastApiSync = now;
    meta.lastSubscriptionSync = now;
    await kvSet({ channels, subscriptions, meta });
  });
}

/**
 * Adds Google Takeout history. Imported viewings have no watch time, and any
 * entry within 15 minutes of a viewing the extension tracked itself is skipped.
 */
export function importTakeout(watches: Watch[], channelNames: Array<{ channelId: string; channelName: string }>) {
  return locked(async () => {
    const { meta, channels } = await loadCore();
    const byShard = new Map<string, Watch[]>();
    for (const w of watches) {
      const k = shardKey(w.timestamp);
      if (!byShard.has(k)) byShard.set(k, []);
      byShard.get(k)!.push(w);
    }
    const existing = await kvGetMany([...byShard.keys()]);
    const writes: Record<string, unknown> = {};
    let added = 0;
    for (const [k, list] of byShard) {
      const shard = { ...((existing[k] as Record<string, Watch>) ?? {}) };
      const tracked = Object.values(shard).filter((w) => w.source === 'tracked');
      const fromHistory = new Set(Object.values(shard).filter((w) => w.source === 'history').map((w) => `${w.videoId}:${dayKey(w.timestamp)}`));
      for (const w of list) {
        if (shard[w.id]) continue;
        if (tracked.some((t) => t.videoId === w.videoId && Math.abs(t.timestamp - w.timestamp) < 15 * 60_000)) continue;
        if (fromHistory.has(`${w.videoId}:${dayKey(w.timestamp)}`)) continue;
        shard[w.id] = w;
        added++;
        const ch = ensureChannel(channels, w.channelId, w.channelName, w.timestamp);
        ch.firstSeen = Math.min(ch.firstSeen, w.timestamp);
        ch.videosWatched += 1;
      }
      writes[k] = shard;
    }
    for (const { channelId, channelName } of channelNames) ensureChannel(channels, channelId, channelName);
    meta.takeoutImportedAt = Date.now();
    await kvSet({ ...writes, channels, meta });
    return added;
  });
}

const DAY_MS = 86_400_000;

/**
 * Adds entries read from youtube.com/feed/history: what you watched on your
 * phone, TV or another browser. YouTube says which day, not what time, so each
 * is placed at noon (or now, for today). Watch time is estimated from how far
 * the red resume bar reaches, and is null when there's no bar or no length.
 * Anything TubeStat already tracked here within a day either side is skipped,
 * so desktop viewing is never counted twice.
 */
export function importHistory(items: HistoryItem[]) {
  return locked(async () => {
    const { meta, channels } = await loadCore();
    const now = Date.now();
    const byHandle = new Map(Object.values(channels).filter((c) => c.handle).map((c) => [c.handle!.toLowerCase(), c.channelId]));
    const keys = new Set<string>();
    for (const i of items) for (const t of [i.day - DAY_MS, i.day, i.day + DAY_MS]) keys.add(shardKey(t));
    const shards = await kvGetMany([...keys]);
    const writes: Record<string, Record<string, Watch>> = {};
    const shard = (k: string) => (writes[k] ??= { ...((shards[k] as Record<string, Watch>) ?? {}) });
    let added = 0;

    for (const item of items) {
      const near = [item.day - DAY_MS, item.day, item.day + DAY_MS].flatMap((t) => Object.values(shard(shardKey(t))));
      const lo = item.day - DAY_MS;
      const hi = item.day + 2 * DAY_MS;
      if (near.some((w) => w.videoId === item.videoId && w.source !== 'history' && w.timestamp >= lo && w.timestamp < hi)) continue;

      const channelId = item.channelId || (item.handle ? byHandle.get(item.handle.toLowerCase()) : undefined) || '';
      const timestamp = Math.min(item.day + DAY_MS / 2, now);
      const id = `history:${item.videoId}:${dayKey(item.day)}`;
      const month = shard(shardKey(timestamp));
      const prev = month[id];
      const watchedSeconds = item.percent != null && item.duration ? Math.round((item.duration * item.percent) / 100) : null;
      // A later look at the page can show more progress, or the channel; keep the best of both.
      const next: Watch = {
        id,
        videoId: item.videoId,
        title: item.title || prev?.title || '',
        channelId: channelId || prev?.channelId || '',
        channelName: item.channelName || prev?.channelName || '',
        thumbnail: thumbnailFor(item.videoId),
        duration: item.duration || prev?.duration || 0,
        watchedSeconds: watchedSeconds == null ? prev?.watchedSeconds ?? null : Math.max(watchedSeconds, prev?.watchedSeconds ?? 0),
        percentageWatched: item.percent ?? prev?.percentageWatched ?? null,
        timestamp: prev?.timestamp ?? timestamp,
        endedAt: prev?.endedAt ?? timestamp,
        completed: (item.percent ?? prev?.percentageWatched ?? 0) >= 90,
        isShort: item.isShort,
        isLive: false,
        ytCategory: prev?.ytCategory ?? null,
        source: 'history',
      };
      if (prev && JSON.stringify(prev) === JSON.stringify(next)) continue;
      month[id] = next;
      if (!prev) added++;

      if (next.channelId) {
        const ch = ensureChannel(channels, next.channelId, next.channelName, next.timestamp);
        ch.firstSeen = Math.min(ch.firstSeen, next.timestamp);
        ch.totalWatchTime += Math.max(0, (next.watchedSeconds ?? 0) - (prev?.channelId === next.channelId ? prev.watchedSeconds ?? 0 : 0));
        if (!prev || prev.channelId !== next.channelId) ch.videosWatched += 1;
        ch.updatedAt = now;
      }
    }
    meta.lastHistorySync = now;
    await kvSet({ ...writes, channels, meta });
    return added;
  });
}

export function deleteAllData() {
  return locked(async () => {
    await kvClear();
    await kvSet({ meta: newMeta() });
  });
}

export async function handleMessage(msg: TrackerMessage): Promise<unknown> {
  switch (msg.type) {
    case 'watch:upsert':
      return upsertWatch(msg.watch);
    case 'heat:add':
      return addHeat(msg.delta);
    case 'channel:seen':
      return channelSeen(msg);
    case 'subscriptions:sync':
      return syncSubscriptions(msg);
    case 'takeout:import':
      return importTakeout(msg.watches, msg.channels);
    case 'history:import':
      return importHistory(msg.items);
    case 'api:apply':
      return applyApiSync(msg.payload);
    case 'data:deleteAll':
      return deleteAllData();
    case 'tracker:ping':
      return { ok: true };
  }
}
