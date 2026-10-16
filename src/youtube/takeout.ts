/**
 * Google Takeout import (YouTube → history → watch-history.json).
 *
 * Takeout is the only real source of what you watched before installing.
 * It records that you opened a video and when — not how long you watched —
 * so imported viewings count toward videos and creators, never watch time.
 */
import type { Watch } from '../storage/schema';
import { thumbnailFor } from './parse';

interface TakeoutEntry {
  title?: string;
  titleUrl?: string;
  subtitles?: Array<{ name?: string; url?: string }>;
  time?: string;
  details?: Array<{ name?: string }>;
}

export interface TakeoutResult {
  watches: Watch[];
  channels: Array<{ channelId: string; channelName: string }>;
  skipped: number;
  range: [number, number] | null;
}

export function parseTakeout(json: string): TakeoutResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file isn’t valid JSON. In Takeout, choose JSON as the history format.');
  }
  if (!Array.isArray(data)) throw new Error('This doesn’t look like watch-history.json from Google Takeout.');

  const watches: Watch[] = [];
  const channels = new Map<string, string>();
  let skipped = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const e of data as TakeoutEntry[]) {
    const isAd = e.details?.some((d) => /ads/i.test(d.name ?? ''));
    const vid = e.titleUrl?.match(/[?&]v=([\w-]{6,})/)?.[1];
    const channelId = e.subtitles?.[0]?.url?.match(/\/channel\/(UC[\w-]+)/)?.[1];
    const time = e.time ? Date.parse(e.time) : NaN;
    if (isAd || !vid || !channelId || !Number.isFinite(time)) {
      skipped++;
      continue;
    }
    const channelName = e.subtitles?.[0]?.name ?? '';
    channels.set(channelId, channelName);
    min = Math.min(min, time);
    max = Math.max(max, time);
    watches.push({
      id: `takeout:${vid}:${time}`,
      videoId: vid,
      title: (e.title ?? '').replace(/^Watched\s+/, ''),
      channelId,
      channelName,
      thumbnail: thumbnailFor(vid),
      duration: 0,
      watchedSeconds: null,
      percentageWatched: null,
      timestamp: time,
      endedAt: time,
      completed: false,
      // Takeout lists Shorts as regular watch URLs, so they can't be told apart.
      isShort: false,
      isLive: false,
      ytCategory: null,
      source: 'takeout',
    });
  }
  return {
    watches,
    channels: [...channels].map(([channelId, channelName]) => ({ channelId, channelName })),
    skipped,
    range: watches.length ? [min, max] : null,
  };
}
