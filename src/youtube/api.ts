/**
 * YouTube Data API calls.
 *
 * YouTube's web pages never say *when* you subscribed to a channel. The Data
 * API does (subscriptions.list → snippet.publishedAt), along with exact channel
 * creation dates. The token comes from signing in with Google (account/google.ts)
 * and is only ever used for these read-only calls.
 */
import type { ApiSyncPayload } from '../storage/schema';

const API = 'https://www.googleapis.com/youtube/v3';

async function get(path: string, params: Record<string, string>, token: string): Promise<any> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `YouTube API error ${res.status}`);
  }
  return res.json();
}

const thumb = (t: any): string | null => t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? null;

/**
 * Reads your subscriptions (with dates) and stats for those channels plus any
 * extra channels you've watched. `extraChannelIds` is capped to keep quota low.
 */
export async function fetchApiSync(token: string, extraChannelIds: string[], onProgress?: (msg: string) => void): Promise<ApiSyncPayload> {
  const subscriptions: ApiSyncPayload['subscriptions'] = [];
  let pageToken = '';
  do {
    const page = await get('subscriptions', { part: 'snippet', mine: 'true', maxResults: '50', order: 'alphabetical', ...(pageToken ? { pageToken } : {}) }, token);
    for (const item of page.items ?? []) {
      const s = item.snippet;
      subscriptions.push({
        channelId: s.resourceId.channelId,
        channelName: s.title,
        avatar: thumb(s.thumbnails),
        subscribedAt: Date.parse(s.publishedAt),
      });
    }
    onProgress?.(`Read ${subscriptions.length} subscriptions`);
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  const ids = [...new Set([...subscriptions.map((s) => s.channelId), ...extraChannelIds.slice(0, 500)])];
  const channels: ApiSyncPayload['channels'] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const page = await get('channels', { part: 'snippet,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' }, token);
    for (const c of page.items ?? []) {
      channels.push({
        channelId: c.id,
        channelName: c.snippet.title,
        handle: c.snippet.customUrl ? (c.snippet.customUrl.startsWith('@') ? c.snippet.customUrl : `@${c.snippet.customUrl}`) : null,
        avatar: thumb(c.snippet.thumbnails),
        subscriberCount: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? NaN) || null,
        createdAt: c.snippet.publishedAt ? Date.parse(c.snippet.publishedAt) : null,
      });
    }
    onProgress?.(`Read details for ${Math.min(i + 50, ids.length)} of ${ids.length} channels`);
  }
  return { subscriptions, channels };
}
