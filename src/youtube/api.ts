/**
 * Optional YouTube Data API connection.
 *
 * YouTube's web pages never say *when* you subscribed to a channel. The Data
 * API does (subscriptions.list → snippet.publishedAt), along with exact channel
 * creation dates. Connecting is opt-in, read-only (youtube.readonly), uses the
 * user's own Google Cloud OAuth client, and the access token is kept in memory
 * only for the duration of the sync.
 */
import type { ApiSyncPayload } from '../storage/schema';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';

/** Same value chrome.identity.getRedirectURL() returns, available before the permission is granted. */
export function redirectUri(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.id ? `https://${chrome.runtime.id}.chromiumapp.org/` : '(open inside the extension)';
}

/**
 * The account connection's permissions are optional, so most people never grant
 * them. Must be called directly from a click, before any await.
 */
export function requestApiPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return Promise.resolve(false);
  return chrome.permissions.request({ permissions: ['identity'], origins: ['https://www.googleapis.com/*'] });
}

export async function authorize(clientId: string): Promise<string> {
  if (!chrome.identity?.launchWebAuthFlow) throw new Error('TubeStat needs permission to connect to your Google account. Press Connect again and choose Allow.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId.trim());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('prompt', 'consent');
  const result = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  const token = result && new URLSearchParams(new URL(result).hash.slice(1)).get('access_token');
  if (!token) throw new Error('Google did not return an access token.');
  return token;
}

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
