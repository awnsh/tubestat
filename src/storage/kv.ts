/**
 * Thin key-value layer over chrome.storage.local.
 * Falls back to localStorage when the dashboard is opened outside the
 * extension (e.g. `npm run dev`), so the UI can be developed in a normal tab.
 */

type Listener = (changedKeys: string[]) => void;

const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;
const LS_PREFIX = 'tubestat:';

export const isExtension = hasChromeStorage;

export async function kvGetAll(): Promise<Record<string, unknown>> {
  if (hasChromeStorage) return chrome.storage.local.get(null);
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(LS_PREFIX)) out[k.slice(LS_PREFIX.length)] = JSON.parse(localStorage.getItem(k)!);
  }
  return out;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (hasChromeStorage) return (await chrome.storage.local.get(key))[key] as T | undefined;
  const raw = localStorage.getItem(LS_PREFIX + key);
  return raw == null ? undefined : (JSON.parse(raw) as T);
}

export async function kvGetMany(keys: string[]): Promise<Record<string, unknown>> {
  if (hasChromeStorage) return chrome.storage.local.get(keys);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const raw = localStorage.getItem(LS_PREFIX + k);
    if (raw != null) out[k] = JSON.parse(raw);
  }
  return out;
}

const localListeners = new Set<Listener>();

export async function kvSet(items: Record<string, unknown>): Promise<void> {
  if (hasChromeStorage) return chrome.storage.local.set(items);
  for (const [k, v] of Object.entries(items)) localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
  localListeners.forEach((l) => l(Object.keys(items)));
}

export async function kvClear(): Promise<void> {
  if (hasChromeStorage) return chrome.storage.local.clear();
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(LS_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  localListeners.forEach((l) => l(keys.map((k) => k.slice(LS_PREFIX.length))));
}

export function kvSubscribe(listener: Listener): () => void {
  if (hasChromeStorage) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local') listener(Object.keys(changes));
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

export async function kvBytesInUse(): Promise<number | null> {
  if (hasChromeStorage && chrome.storage.local.getBytesInUse) return chrome.storage.local.getBytesInUse(null);
  return null;
}
