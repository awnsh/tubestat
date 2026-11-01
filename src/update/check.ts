/**
 * Update check for copies installed from the GitHub zip.
 *
 * Chrome updates Web Store installs by itself, but never updates an unpacked
 * extension. For those, TubeStat asks GitHub at most twice a day whether a newer
 * release exists and remembers the answer under the `update` key, which the
 * popup and dashboard read to show a notice. The request carries nothing about
 * you or your viewing: it's a plain GET of the public "latest release" page.
 */
import { kvGet, kvSet } from '../storage/kv';
import { getSettings } from '../storage/db';

export const RELEASES_API = 'https://api.github.com/repos/awnsh/tubestat/releases/latest';
export const RELEASES_PAGE = 'https://github.com/awnsh/tubestat/releases/latest';
const ZIP_NAME = 'tubestat-extension.zip';
const CHECK_EVERY_MS = 12 * 60 * 60_000;

export interface UpdateState {
  checkedAt: number;
  /** Latest released version, e.g. "1.2.0", or null if the check failed. */
  latest: string | null;
  /** Direct download for the release zip, or the release page. */
  downloadUrl: string;
  releaseUrl: string;
  /** Version the user chose to stop hearing about. */
  dismissed: string | null;
}

/** "1.10.0" > "1.9.3". Non-numeric parts count as 0. */
export function newerThan(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

export function currentVersion(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '0.0.0';
}

/** Web Store installs ("normal") are updated by Chrome; only other installs need checking. */
async function selfUpdates(): Promise<boolean> {
  try {
    return (await chrome.management.getSelf()).installType === 'normal';
  } catch {
    return false;
  }
}

/** The update to tell the user about, if any. */
export function pendingUpdate(state: UpdateState | null | undefined): UpdateState | null {
  if (!state?.latest || state.latest === state.dismissed) return null;
  return newerThan(state.latest, currentVersion()) ? state : null;
}

/** Asks GitHub for the latest release and saves the answer. `reached` is false when GitHub couldn't be asked. */
async function fetchLatest(prev: UpdateState | undefined, dismissed: string | null): Promise<{ state: UpdateState; reached: boolean }> {
  const state: UpdateState = {
    checkedAt: Date.now(),
    latest: prev?.latest ?? null,
    downloadUrl: prev?.downloadUrl ?? `${RELEASES_PAGE}/download/${ZIP_NAME}`,
    releaseUrl: prev?.releaseUrl ?? RELEASES_PAGE,
    dismissed,
  };
  let reached = false;
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store' });
    if (res.ok) {
      const release = (await res.json()) as { tag_name?: string; html_url?: string; assets?: Array<{ name?: string; browser_download_url?: string }> };
      const version = release.tag_name?.replace(/^v/i, '');
      if (version && /^\d+(\.\d+)*$/.test(version)) {
        reached = true;
        state.latest = version;
        state.releaseUrl = release.html_url ?? RELEASES_PAGE;
        const zip = release.assets?.find((x) => x.name === ZIP_NAME) ?? release.assets?.find((x) => x.name?.endsWith('.zip'));
        state.downloadUrl = zip?.browser_download_url ?? state.releaseUrl;
      }
    }
  } catch {
    /* offline or rate-limited */
  }
  await kvSet({ update: state });
  return { state, reached };
}

export async function checkForUpdate({ force = false } = {}): Promise<UpdateState | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
  if (!(await getSettings()).checkUpdates || (await selfUpdates())) return null;
  const prev = await kvGet<UpdateState>('update');
  if (!force && prev && Date.now() - prev.checkedAt < CHECK_EVERY_MS) return prev;
  return (await fetchLatest(prev, prev?.dismissed ?? null)).state;
}

export type CheckResult =
  | { status: 'latest'; version: string }
  | { status: 'available'; version: string; latest: string; downloadUrl: string; releaseUrl: string }
  /** Web Store copy: Chrome has downloaded a newer version, applied on reload. */
  | { status: 'store-ready'; version: string; latest: string | null }
  | { status: 'error'; version: string; message: string };

/**
 * "Check for updates" pressed by you: runs even with the automatic check off,
 * and brings back a notice you'd dismissed. Web Store copies ask Chrome instead.
 */
export async function checkNow(): Promise<CheckResult> {
  const version = currentVersion();
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return { status: 'error', version, message: 'Open TubeStat from the extension to check for updates.' };

  if (await selfUpdates()) {
    try {
      const r = await chrome.runtime.requestUpdateCheck();
      if (r.status === 'update_available') return { status: 'store-ready', version, latest: r.version ?? null };
      if (r.status === 'no_update') return { status: 'latest', version };
      return { status: 'error', version, message: 'Chrome checked for updates very recently. Try again in a few minutes.' };
    } catch (e) {
      return { status: 'error', version, message: (e as Error).message };
    }
  }

  const { state, reached } = await fetchLatest(await kvGet<UpdateState>('update'), null);
  if (!reached || !state.latest) return { status: 'error', version, message: 'Couldn’t reach GitHub. Check your connection and try again.' };
  return newerThan(state.latest, version)
    ? { status: 'available', version, latest: state.latest, downloadUrl: state.downloadUrl, releaseUrl: state.releaseUrl }
    : { status: 'latest', version };
}

/** Applies an update Chrome has already downloaded (Web Store copies). Closes and reopens TubeStat's pages. */
export function applyDownloadedUpdate(): void {
  chrome.runtime.reload();
}

export async function dismissUpdate(version: string): Promise<void> {
  const prev = await kvGet<UpdateState>('update');
  if (prev) await kvSet({ update: { ...prev, dismissed: version } });
}
