/**
 * All writes to watch, channel and subscription data go through here.
 * In the extension these run only inside the background service worker,
 * which serialises them, so concurrent tabs can never clobber each other.
 */
import { kvClear, kvGet, kvGetMany, kvSet } from './kv';
import { newMeta, shardKey } from './db';
import type { ApiSyncPayload, Channel, DataSource, Meta, Subscription, TrackerMessage, Watch } from './schema';

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
      for (const w of list) {
        if (shard[w.id]) continue;
        if (tracked.some((t) => t.videoId === w.videoId && Math.abs(t.timestamp - w.timestamp) < 15 * 60_000)) continue;
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
    case 'channel:seen':
      return channelSeen(msg);
    case 'subscriptions:sync':
      return syncSubscriptions(msg);
    case 'takeout:import':
      return importTakeout(msg.watches, msg.channels);
    case 'api:apply':
      return applyApiSync(msg.payload);
    case 'data:deleteAll':
      return deleteAllData();
    case 'tracker:ping':
      return { ok: true };
  }
}
