import { kvGetAll, kvGet, kvSet } from './kv';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type Channel,
  type Database,
  type FriendGroup,
  type Meta,
  type Settings,
  type Subscription,
  type Watch,
} from './schema';

/**
 * Storage layout (chrome.storage.local, unlimitedStorage):
 *   meta            Meta
 *   settings        Settings
 *   channels        Record<channelId, Channel>
 *   subscriptions   Record<channelId, Subscription>
 *   groups          FriendGroup[]
 *   memberId        string
 *   w:YYYY-MM       Record<watchId, Watch>   — watches sharded by month so
 *                                              writes stay small as history grows
 */

export const WATCH_SHARD_PREFIX = 'w:';

export function shardKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${WATCH_SHARD_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function newMeta(): Meta {
  return {
    schemaVersion: SCHEMA_VERSION,
    installedAt: Date.now(),
    activeDays: [],
    lastSubscriptionSync: null,
    lastApiSync: null,
    takeoutImportedAt: null,
  };
}

export function randomId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function loadDatabase(): Promise<Database> {
  const all = await kvGetAll();
  const watches: Watch[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(WATCH_SHARD_PREFIX) && value && typeof value === 'object') {
      watches.push(...Object.values(value as Record<string, Watch>));
    }
  }
  watches.sort((a, b) => a.timestamp - b.timestamp);
  return {
    meta: { ...newMeta(), ...((all.meta as Meta) ?? {}) },
    settings: { ...DEFAULT_SETTINGS, ...((all.settings as Settings) ?? {}) },
    watches,
    channels: (all.channels as Record<string, Channel>) ?? {},
    subscriptions: (all.subscriptions as Record<string, Subscription>) ?? {},
    groups: (all.groups as FriendGroup[]) ?? [],
    memberId: (all.memberId as string) ?? '',
  };
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await kvGet<Settings>('settings')) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await kvSet({ settings: next });
  return next;
}

export async function saveGroups(groups: FriendGroup[]): Promise<void> {
  await kvSet({ groups });
}

export async function ensureMemberId(): Promise<string> {
  const existing = await kvGet<string>('memberId');
  if (existing) return existing;
  const id = randomId();
  await kvSet({ memberId: id });
  return id;
}

/** Everything, as a portable JSON document the user can keep or re-import. */
export async function exportAll(): Promise<string> {
  const all = await kvGetAll();
  return JSON.stringify({ app: 'tubestat', exportedAt: new Date().toISOString(), data: all }, null, 2);
}
