/**
 * Signing in with Google.
 *
 * One sign-in gives TubeStat three narrow permissions:
 *   - youtube.readonly  read your subscriptions, with the date you subscribed
 *   - drive.appdata     a private app folder in your own Google Drive, where
 *                       your stats are kept so every device you sign in on
 *                       shares them (only TubeStat can see that folder)
 *   - openid email      which account you signed in with, to show it
 *
 * Tokens are short-lived and kept in memory only; nothing about your Google
 * account is stored except its email address and name.
 *
 * TubeStat signs in through its own OAuth client. Its redirect is a fixed relay
 * page on the website (docs/oauth.html), because every unpacked copy has a
 * different extension ID and Google needs redirect URIs listed in advance. The
 * relay forwards the answer to https://<id>.chromiumapp.org/, which Chrome
 * hands back to the copy that asked. A developer can use their own client ID
 * instead, which redirects to this copy's chromiumapp.org address directly.
 */

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
];

/**
 * TubeStat's own OAuth client ("Web application" type, in the developer's Google
 * Cloud project). Not a secret: it only identifies the app on Google's sign-in
 * page. Empty until that project exists; sign-in then needs a client ID in Profile.
 */
export const BUILT_IN_CLIENT_ID = '';
const RELAY_REDIRECT = 'https://awnsh.github.io/tubestat/oauth.html';

export const hasBuiltInClient = () => BUILT_IN_CLIENT_ID.endsWith('.apps.googleusercontent.com');

/** Same value chrome.identity.getRedirectURL() returns, available before the permission is granted. */
export function redirectUri(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.id ? `https://${chrome.runtime.id}.chromiumapp.org/` : '(open inside the extension)';
}

const PERMISSIONS: chrome.permissions.Permissions = { permissions: ['identity'], origins: ['https://www.googleapis.com/*'] };

/**
 * The account connection's permissions are optional, so most people never grant
 * them. Must be called directly from a click, before any await.
 */
export function requestApiPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return Promise.resolve(false);
  return chrome.permissions.request(PERMISSIONS);
}

export async function hasApiPermissions(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return false;
  return chrome.permissions.contains(PERMISSIONS);
}

/**
 * Gets a short-lived token. With `interactive: false` it succeeds only when
 * Google can answer without showing anything (you're signed in to Google and
 * already allowed TubeStat), which is how background syncs work.
 * `clientId` empty means TubeStat's own client.
 */
export async function authorize(clientId = '', { interactive = true } = {}): Promise<string> {
  if (!chrome.identity?.launchWebAuthFlow) throw new Error('TubeStat needs permission to connect to your Google account. Press Sign in again and choose Allow.');
  const own = clientId.trim();
  const builtIn = !own;
  if (builtIn && !hasBuiltInClient()) throw new Error('Sign-in isn’t set up in this copy of TubeStat yet.');
  const nonce = crypto.getRandomValues(new Uint32Array(2)).join('');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', builtIn ? BUILT_IN_CLIENT_ID : own);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', builtIn ? RELAY_REDIRECT : chrome.identity.getRedirectURL());
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('include_granted_scopes', 'true');
  // The relay page reads which copy of TubeStat to return to from `state`.
  url.searchParams.set('state', `${chrome.runtime.id}.${nonce}`);
  if (!interactive) url.searchParams.set('prompt', 'none');
  const result = await chrome.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive,
    // Background sign-ins pass through the relay page, which needs a moment to run.
    abortOnLoadForNonInteractive: false,
    timeoutMsForNonInteractive: 10_000,
  } as chrome.identity.WebAuthFlowDetails);
  const answer = result ? new URLSearchParams(new URL(result).hash.slice(1)) : null;
  if (answer?.get('state') !== `${chrome.runtime.id}.${nonce}`) throw new Error('Google’s answer didn’t match this request. Try again.');
  const error = answer.get('error');
  if (error === 'access_denied') throw new Error('You chose not to allow access. Nothing was changed.');
  const token = answer.get('access_token');
  if (!token) throw new Error(error ? `Google said: ${error}` : 'Google did not return an access token.');
  const granted = answer.get('scope') ?? '';
  if (!granted.includes('drive.appdata') || !granted.includes('youtube.readonly')) {
    throw new Error('TubeStat needs both boxes ticked on Google’s screen: your YouTube subscriptions and its app folder in Google Drive. Sign in again and leave them ticked.');
  }
  return token;
}

export interface GoogleUser {
  email: string;
  name: string | null;
  picture: string | null;
}

export async function whoAmI(token: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Couldn’t read your Google account (${res.status}).`);
  const u = await res.json();
  return { email: u.email ?? '', name: u.name ?? null, picture: u.picture ?? null };
}

/** Tells Google to drop TubeStat's access. Fire and forget: signing out locally doesn't depend on it. */
export function revoke(token: string): void {
  fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`, { mode: 'no-cors' }).catch(() => undefined);
}
