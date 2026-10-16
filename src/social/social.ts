/**
 * Friend groups and leaderboards.
 *
 * TubeStat has no server, so groups work by exchanging "stat codes": a short
 * string holding only weekly aggregates (hours, video count, creator count,
 * streaks). No titles, channels, or history are ever in a code. Each person
 * pastes their friends' codes into a group on their own device.
 *
 * `GroupTransport` is the seam for a future sync backend: implement it to
 * publish your code and pull members' latest codes automatically.
 */
import type { FriendGroup, GroupMember, ShareableStats } from '../storage/schema';
import type { Analytics } from '../analytics/engine';
import { isoWeek, rangeFor } from '../analytics/periods';
import { randomId } from '../storage/db';

export interface GroupTransport {
  publish(groupId: string, stats: ShareableStats): Promise<void>;
  pull(groupId: string): Promise<ShareableStats[]>;
}

const PREFIX = 'TUBESTAT1.';

export function buildStats(a: Analytics, memberId: string, name: string, now = Date.now()): ShareableStats {
  const week = rangeFor('week', now);
  const s = a.summary(week);
  const streaks = a.streaks(now);
  const totalSecs = a.watches.reduce((x, w) => x + (w.watchedSeconds ?? 0), 0);
  return {
    v: 1,
    memberId,
    name: name || 'You',
    week: isoWeek(now),
    weekWatchSeconds: Math.round(s.watchSeconds),
    weekVideos: s.videos,
    weekCreators: s.creators,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    totalHours: Math.round(totalSecs / 360) / 10,
    generatedAt: now,
  };
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeStats(stats: ShareableStats): string {
  return PREFIX + b64urlEncode(JSON.stringify(stats));
}

export function decodeStats(code: string): ShareableStats {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('That isn’t a TubeStat code. Codes start with TUBESTAT1.');
  let data: any;
  try {
    data = JSON.parse(b64urlDecode(trimmed.slice(PREFIX.length)));
  } catch {
    throw new Error('That code is incomplete. Ask your friend to copy it again.');
  }
  const numbers = ['weekWatchSeconds', 'weekVideos', 'weekCreators', 'currentStreak', 'longestStreak', 'totalHours', 'generatedAt'];
  if (data?.v !== 1 || typeof data.memberId !== 'string' || typeof data.name !== 'string' || numbers.some((k) => typeof data[k] !== 'number')) {
    throw new Error('That code is from an unsupported version of TubeStat.');
  }
  // Keep only known fields; clamp the name.
  return {
    v: 1,
    memberId: data.memberId.slice(0, 64),
    name: data.name.slice(0, 40),
    week: String(data.week ?? ''),
    weekWatchSeconds: data.weekWatchSeconds,
    weekVideos: data.weekVideos,
    weekCreators: data.weekCreators,
    currentStreak: data.currentStreak,
    longestStreak: data.longestStreak,
    totalHours: data.totalHours,
    generatedAt: data.generatedAt,
  };
}

export function createGroup(name: string, me: ShareableStats): FriendGroup {
  return {
    id: randomId(),
    name: name.trim() || 'Friends',
    createdAt: Date.now(),
    members: [{ memberId: me.memberId, name: me.name, isYou: true, card: me, updatedAt: Date.now() }],
  };
}

export function upsertMember(group: FriendGroup, stats: ShareableStats): FriendGroup {
  const existing = group.members.find((m) => m.memberId === stats.memberId);
  const member: GroupMember = { memberId: stats.memberId, name: stats.name, isYou: existing?.isYou ?? false, card: stats, updatedAt: Date.now() };
  return {
    ...group,
    members: existing ? group.members.map((m) => (m.memberId === stats.memberId ? member : m)) : [...group.members, member],
  };
}

export function refreshSelf(group: FriendGroup, me: ShareableStats): FriendGroup {
  return { ...group, members: group.members.map((m) => (m.isYou ? { ...m, name: me.name, card: me, updatedAt: Date.now() } : m)) };
}

export type BoardMetric = 'time' | 'videos' | 'streak' | 'diversity';

export const BOARD_METRICS: Array<{ id: BoardMetric; label: string }> = [
  { id: 'time', label: 'Watch time' },
  { id: 'videos', label: 'Videos' },
  { id: 'streak', label: 'Longest streak' },
  { id: 'diversity', label: 'Creator diversity' },
];

export function metricValue(stats: ShareableStats, metric: BoardMetric): number {
  switch (metric) {
    case 'time':
      return stats.weekWatchSeconds;
    case 'videos':
      return stats.weekVideos;
    case 'streak':
      return stats.longestStreak;
    case 'diversity':
      return stats.weekCreators;
  }
}

/** Members ranked by metric. Stats from a different week than yours are flagged stale. */
export function leaderboard(group: FriendGroup, metric: BoardMetric, currentWeek: string) {
  return group.members
    .filter((m) => m.card)
    .map((m) => ({ member: m, value: metricValue(m.card!, metric), stale: metric !== 'streak' && m.card!.week !== currentWeek }))
    .sort((x, y) => Number(x.stale) - Number(y.stale) || y.value - x.value);
}
