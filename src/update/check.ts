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

export async function checkForUpdate({ force = false } = {}): Promise<UpdateState | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
  if (!(await getSettings()).checkUpdates || (await selfUpdates())) return null;
  const prev = await kvGet<UpdateState>('update');
  if (!force && prev && Date.now() - prev.checkedAt < CHECK_EVERY_MS) return prev;

  const next: UpdateState = {
    checkedAt: Date.now(),
    latest: prev?.latest ?? null,
    downloadUrl: prev?.downloadUrl ?? `${RELEASES_PAGE}/download/${ZIP_NAME}`,
    releaseUrl: prev?.releaseUrl ?? RELEASES_PAGE,
    dismissed: prev?.dismissed ?? null,
  };
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store' });
    if (res.ok) {
      const release = (await res.json()) as { tag_name?: string; html_url?: string; assets?: Array<{ name?: string; browser_download_url?: string }> };
      const version = release.tag_name?.replace(/^v/i, '');
      if (version && /^\d+(\.\d+)*$/.test(version)) {
        next.latest = version;
        next.releaseUrl = release.html_url ?? RELEASES_PAGE;
        const zip = release.assets?.find((x) => x.name === ZIP_NAME) ?? release.assets?.find((x) => x.name?.endsWith('.zip'));
        next.downloadUrl = zip?.browser_download_url ?? next.releaseUrl;
      }
    }
  } catch {
    /* offline or rate-limited; try again next time */
  }
  await kvSet({ update: next });
  return next;
}

export async function dismissUpdate(version: string): Promise<void> {
  const prev = await kvGet<UpdateState>('update');
  if (prev) await kvSet({ update: { ...prev, dismissed: version } });
}
