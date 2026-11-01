/**
 * Keeps this device and your Google account in step.
 *
 * Your Drive app folder holds one file per month of watches (w-YYYY-MM.json),
 * one for Replay Maps, and core.json for channels, subscriptions, groups and a
 * few totals. A sync downloads only files another device changed since last
 * time, merges them in (account/merge.ts), then uploads only files whose
 * merged contents differ from what's in Drive. Runs in the background worker.
 */
import { kvGet, kvGetAll, kvSet } from '../storage/kv';
import { WATCH_SHARD_PREFIX, newMeta } from '../storage/db';
import { applyApiSync, withLock } from '../storage/mutations';
import { HEAT_PREFIX, type ReplayHeat } from '../replay/heat';
import { DEFAULT_SETTINGS, type Channel, type FriendGroup, type Meta, type Settings, type Subscription, type Watch } from '../storage/schema';
import { fetchApiSync } from '../youtube/api';
import { authorize, hasApiPermissions, hasBuiltInClient, type GoogleUser } from './google';
import { deleteFile, downloadJson, listFiles, uploadJson } from './drive';
import { dropHistoryDuplicates, mergeChannels, mergeGroups, mergeReplays, mergeSubscriptions, mergeWatches, recountChannels, stableStringify } from './merge';

export interface Account extends GoogleUser {
  /** Empty when signed in through TubeStat's own client. */
  clientId: string;
  connectedAt: number;
  lastSync: number | null;
  lastSubscriptionsSync: number | null;
  /** Set when a background sync couldn't run, e.g. you signed out of Google. */
  lastError: string | null;
}

/** What's known to be in Drive, per file name. */
type SyncState = Record<string, { id: string; modifiedTime: string; hash: string }>;

interface CoreFile {
  v: 1;
  channels: Record<string, Channel>;
  subscriptions: Record<string, Subscription>;
  groups: FriendGroup[];
  memberId: string;
  displayName: string;
  meta: Pick<Meta, 'installedAt' | 'activeDays' | 'takeoutImportedAt' | 'lastApiSync' | 'lastSubscriptionSync' | 'lastHistorySync'>;
}

const CORE = 'core.json';
const REPLAYS = 'replays.json';
const shardFile = (key: string) => `w-${key.slice(WATCH_SHARD_PREFIX.length)}.json`;
const shardKeyOf = (file: string) => `${WATCH_SHARD_PREFIX}${file.slice(2, -5)}`;
const isShardFile = (name: string) => /^w-\d{4}-\d{2}\.json$/.test(name);

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const maxOrNull = (a: number | null | undefined, b: number | null | undefined) => (a == null ? b ?? null : b == null ? a : Math.max(a, b));

/** Merges downloaded files into local storage, inside the write lock. Returns every file as it should now be in Drive. */
async function mergeIntoLocal(fetched: Record<string, unknown>): Promise<Record<string, unknown>> {
  return withLock(async () => {
    const all = await kvGetAll();
    const writes: Record<string, unknown> = {};

    const shards: Record<string, Record<string, Watch>> = {};
    for (const [key, value] of Object.entries(all)) if (key.startsWith(WATCH_SHARD_PREFIX) && value) shards[key] = value as Record<string, Watch>;
    for (const [name, value] of Object.entries(fetched)) {
      if (!isShardFile(name)) continue;
      const key = shardKeyOf(name);
      shards[key] = mergeWatches(shards[key] ?? {}, value as Record<string, Watch>);
      writes[key] = shards[key];
    }
    for (const key of dropHistoryDuplicates(shards)) writes[key] = shards[key];

    let channels = (all.channels as Record<string, Channel>) ?? {};
    let subscriptions = (all.subscriptions as Record<string, Subscription>) ?? {};
    let groups = (all.groups as FriendGroup[]) ?? [];
    let memberId = (all.memberId as string) ?? '';
    const meta: Meta = { ...newMeta(), ...((all.meta as Meta) ?? {}) };
    const settings: Settings = { ...DEFAULT_SETTINGS, ...((all.settings as Settings) ?? {}) };
    const core = fetched[CORE] as CoreFile | undefined;
    if (core) {
      channels = mergeChannels(channels, core.channels ?? {});
      subscriptions = mergeSubscriptions(subscriptions, core.subscriptions ?? {});
      groups = mergeGroups(groups, core.groups ?? []);
      // One identity on friends' leaderboards, whichever device made it first.
      memberId = core.memberId || memberId;
      meta.installedAt = Math.min(meta.installedAt, core.meta?.installedAt ?? meta.installedAt);
      meta.activeDays = [...new Set([...meta.activeDays, ...(core.meta?.activeDays ?? [])])].sort();
      meta.takeoutImportedAt = maxOrNull(meta.takeoutImportedAt, core.meta?.takeoutImportedAt);
      meta.lastApiSync = maxOrNull(meta.lastApiSync, core.meta?.lastApiSync);
      meta.lastSubscriptionSync = maxOrNull(meta.lastSubscriptionSync, core.meta?.lastSubscriptionSync);
      meta.lastHistorySync = maxOrNull(meta.lastHistorySync, core.meta?.lastHistorySync);
      if (!settings.displayName && core.displayName) {
        settings.displayName = core.displayName;
        writes.settings = settings;
      }
      Object.assign(writes, { subscriptions, groups, memberId, meta });
    }
    if (Object.keys(writes).length) {
      recountChannels(channels, Object.values(shards).flatMap((s) => Object.values(s)));
      writes.channels = channels;
    }

    let replays: Record<string, ReplayHeat> = {};
    for (const [key, value] of Object.entries(all)) if (key.startsWith(HEAT_PREFIX) && value) replays[key.slice(HEAT_PREFIX.length)] = value as ReplayHeat;
    if (fetched[REPLAYS]) {
      const merged = mergeReplays(replays, fetched[REPLAYS] as Record<string, ReplayHeat>);
      for (const [id, heat] of Object.entries(merged)) if (heat !== replays[id]) writes[`${HEAT_PREFIX}${id}`] = heat;
      replays = merged;
    }

    if (Object.keys(writes).length) await kvSet(writes);

    const files: Record<string, unknown> = {
      [CORE]: {
        v: 1,
        channels,
        subscriptions,
        groups,
        memberId,
        displayName: settings.displayName,
        meta: {
          installedAt: meta.installedAt,
          activeDays: meta.activeDays,
          takeoutImportedAt: meta.takeoutImportedAt,
          lastApiSync: meta.lastApiSync,
          lastSubscriptionSync: meta.lastSubscriptionSync,
          lastHistorySync: meta.lastHistorySync,
        },
      } satisfies CoreFile,
      [REPLAYS]: replays,
    };
    for (const [key, shard] of Object.entries(shards)) files[shardFile(key)] = shard;
    return files;
  });
}

/** Two-way sync with the Drive app folder. Returns how many files went each way. */
export async function syncData(token: string): Promise<{ downloaded: number; uploaded: number }> {
  const state: SyncState = (await kvGet<SyncState>('syncState')) ?? {};
  const remote = await listFiles(token);
  const fetched: Record<string, unknown> = {};
  for (const f of remote) {
    const known = state[f.name];
    if (known && known.id === f.id && known.modifiedTime === f.modifiedTime) continue;
    const content = await downloadJson<unknown>(token, f.id);
    fetched[f.name] = content;
    state[f.name] = { id: f.id, modifiedTime: f.modifiedTime, hash: await sha(stableStringify(content)) };
  }
  // A file deleted from Drive (e.g. from another device's "delete everything") is forgotten here, then re-uploaded.
  for (const name of Object.keys(state)) if (!remote.some((f) => f.name === name)) delete state[name];

  const files = await mergeIntoLocal(fetched);
  let uploaded = 0;
  for (const [name, content] of Object.entries(files)) {
    const text = stableStringify(content);
    const hash = await sha(text);
    if (state[name]?.hash === hash) continue;
    const saved = await uploadJson(token, name, text, state[name]?.id);
    state[name] = { id: saved.id, modifiedTime: saved.modifiedTime, hash };
    uploaded++;
  }
  await kvSet({ syncState: state });
  return { downloaded: Object.keys(fetched).length, uploaded };
}

async function readSubscriptions(token: string): Promise<number> {
  const channels = (await kvGet<Record<string, Channel>>('channels')) ?? {};
  const payload = await fetchApiSync(token, Object.keys(channels));
  await applyApiSync(payload);
  return payload.subscriptions.length;
}

async function patchAccount(patch: Partial<Account>): Promise<void> {
  const account = await kvGet<Account>('account');
  if (account) await kvSet({ account: { ...account, ...patch } });
}

let running: Promise<unknown> | null = null;
/** One sync at a time, however many tabs ask. */
function once<T>(fn: () => Promise<T>): Promise<T> {
  if (running) return running as Promise<T>;
  const run = fn().finally(() => (running = null));
  running = run;
  return run;
}

/** Everything a sign-in or "Sync now" does, with a token the page just got from Google. */
export function syncAll(token: string, user?: GoogleUser, clientId = ''): Promise<{ subscriptions: number; downloaded: number; uploaded: number }> {
  return once(async () => {
    const now = Date.now();
    if (user) {
      const prev = await kvGet<Account>('account');
      // Signing in with a different Google account starts a fresh link to its Drive folder.
      if (prev && prev.email !== user.email) await kvSet({ syncState: {} });
      await kvSet({ account: { ...user, clientId, connectedAt: prev?.email === user.email ? prev.connectedAt : now, lastSync: prev?.lastSync ?? null, lastSubscriptionsSync: prev?.lastSubscriptionsSync ?? null, lastError: null } satisfies Account });
    }
    const subscriptions = await readSubscriptions(token);
    const { downloaded, uploaded } = await syncData(token);
    await patchAccount({ lastSync: Date.now(), lastSubscriptionsSync: Date.now(), lastError: null });
    return { subscriptions, downloaded, uploaded };
  });
}

const DATA_EVERY_MS = 30 * 60_000;
const SUBSCRIPTIONS_EVERY_MS = 7 * 86_400_000;

/**
 * Background sync: about every half hour while the worker is awake, and the
 * subscription dates about weekly. Never shows anything; if Google needs you
 * to sign in again, it records that for the Profile page and stops trying.
 */
export async function syncInBackground(): Promise<void> {
  const account = await kvGet<Account>('account');
  if (!account || account.lastError || (account.lastSync && Date.now() - account.lastSync < DATA_EVERY_MS)) return;
  if ((!account.clientId && !hasBuiltInClient()) || !(await hasApiPermissions())) return;
  await once(async () => {
    try {
      const token = await authorize(account.clientId, { interactive: false });
      if (!account.lastSubscriptionsSync || Date.now() - account.lastSubscriptionsSync > SUBSCRIPTIONS_EVERY_MS) {
        await readSubscriptions(token);
        await patchAccount({ lastSubscriptionsSync: Date.now() });
      }
      await syncData(token);
      await patchAccount({ lastSync: Date.now(), lastError: null });
    } catch (e) {
      const msg = (e as Error).message ?? '';
      // Network trouble just waits for next time; a sign-in problem needs you.
      if (!/fetch|network/i.test(msg)) await patchAccount({ lastError: 'Sign in again to keep your stats syncing.' });
    }
  });
}

/** Stops syncing on this device. The copy in your Google account stays unless `token` is given, which deletes it too. */
export async function signOut(token?: string): Promise<void> {
  if (token) for (const f of await listFiles(token)) await deleteFile(token, f.id);
  await kvSet({ account: null, syncState: {} });
}
