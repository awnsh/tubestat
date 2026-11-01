/**
 * Optional YouTube Data API connection.
 *
 * YouTube's web pages never say *when* you subscribed to a channel. The Data
 * API does (subscriptions.list → snippet.publishedAt), along with exact channel
 * creation dates. Connecting is opt-in, read-only (youtube.readonly), and the
 * access token is kept in memory only for the duration of the sync.
 *
 * By default it signs in through TubeStat's own OAuth client, so connecting is
 * one button. That client's redirect is a fixed relay page on the website
 * (docs/oauth.html), because every unpacked copy has a different extension ID
 * and Google needs redirect URIs listed in advance. The relay forwards the
 * answer to https://<id>.chromiumapp.org/, which Chrome hands back to the copy
 * that asked. Anyone can still use their own client ID instead.
 */
import type { ApiSyncPayload } from '../storage/schema';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';

/**
 * TubeStat's own OAuth client ("Web application" type, in the developer's Google
 * Cloud project). Not a secret: it only identifies the app on Google's sign-in
 * page. Empty until that project exists; the UI then asks for a client ID.
 */
export const BUILT_IN_CLIENT_ID = '';
const RELAY_REDIRECT = 'https://awnsh.github.io/tubestat/oauth.html';

export const hasBuiltInClient = () => BUILT_IN_CLIENT_ID.endsWith('.apps.googleusercontent.com');

/** Same value chrome.identity.getRedirectURL() returns, available before the permission is granted. */
export function redirectUri(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.id ? `https://${chrome.runtime.id}.chromiumapp.org/` : '(open inside the extension)';
}

/** True once the account connection's optional permissions have been granted. */
export async function hasApiPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return false;
  return chrome.permissions.contains({ permissions: ['identity'], origins: ['https://www.googleapis.com/*'] });
}

/**
 * The account connection's permissions are optional, so most people never grant
 * them. Must be called directly from a click, before any await.
 */
export function requestApiPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return Promise.resolve(false);
  return chrome.permissions.request({ permissions: ['identity'], origins: ['https://www.googleapis.com/*'] });
}

/**
 * Gets a short-lived read-only token. With `interactive: false` it succeeds only
 * when Google can answer without showing anything (you're signed in and already
 * allowed TubeStat), which is how the weekly background re-sync works.
 * `clientId` empty means TubeStat's own client.
 */
export async function authorize(clientId = '', { interactive = true } = {}): Promise<string> {
  if (!chrome.identity?.launchWebAuthFlow) throw new Error('TubeStat needs permission to connect to your Google account. Press Connect again and choose Allow.');
  const own = clientId.trim();
  const builtIn = !own;
  if (builtIn && !hasBuiltInClient()) throw new Error('Enter an OAuth client ID first.');
  const nonce = crypto.getRandomValues(new Uint32Array(2)).join('');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', builtIn ? BUILT_IN_CLIENT_ID : own);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', builtIn ? RELAY_REDIRECT : chrome.identity.getRedirectURL());
  url.searchParams.set('scope', SCOPE);
  // The relay page reads which copy of TubeStat to return to from `state`.
  url.searchParams.set('state', `${chrome.runtime.id}.${nonce}`);
  if (!interactive) url.searchParams.set('prompt', 'none');
  const result = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive });
  const answer = result ? new URLSearchParams(new URL(result).hash.slice(1)) : null;
  if (answer?.get('state') !== `${chrome.runtime.id}.${nonce}`) throw new Error('Google’s answer didn’t match this request. Press Connect again.');
  const error = answer.get('error');
  if (error === 'access_denied') throw new Error('You chose not to allow access. Nothing was changed.');
  const token = answer.get('access_token');
  if (!token) throw new Error(error ? `Google said: ${error}` : 'Google did not return an access token.');
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

const RESYNC_EVERY_MS = 7 * 86_400_000;
let resyncTried = false;

/**
 * Once you've connected, refreshes subscription dates about weekly without
 * asking again. Runs only from the dashboard, only if the last sync is a week
 * old, and gives up silently if Google would need to show you anything.
 */
export async function resyncQuietly(opts: { lastSync: number | null; clientId: string; watchedChannelIds: string[]; apply: (p: ApiSyncPayload) => Promise<unknown> }): Promise<void> {
  if (resyncTried || !opts.lastSync || Date.now() - opts.lastSync < RESYNC_EVERY_MS) return;
  resyncTried = true;
  if (!opts.clientId && !hasBuiltInClient()) return;
  if (!(await hasApiPermissions())) return;
  try {
    const token = await authorize(opts.clientId, { interactive: false });
    await opts.apply(await fetchApiSync(token, opts.watchedChannelIds));
  } catch {
    /* signed out, or access was removed; the Connect button still works */
  }
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
