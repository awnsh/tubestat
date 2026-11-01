/**
 * The app folder in your Google Drive (drive.appdata). It's hidden from your
 * Drive file list, and no other app can read it. Files are gzipped JSON.
 */

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface RemoteFile {
  id: string;
  name: string;
  modifiedTime: string;
}

async function call(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Google Drive error ${res.status}`);
  }
  return res;
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export async function listFiles(token: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let pageToken = '';
  do {
    const url = new URL(FILES);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('fields', 'nextPageToken,files(id,name,modifiedTime)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await (await call(url.toString(), token)).json();
    out.push(...(page.files ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

export async function downloadJson<T>(token: string, id: string): Promise<T> {
  const res = await call(`${FILES}/${id}?alt=media`, token);
  return JSON.parse(await gunzip(await res.blob())) as T;
}

/** Creates the file, or replaces its contents when `id` is given. Returns the new modifiedTime. */
export async function uploadJson(token: string, name: string, text: string, id?: string): Promise<RemoteFile> {
  const body = await gzip(text);
  if (id) {
    const res = await call(`${UPLOAD}/${id}?uploadType=media&fields=id,name,modifiedTime`, token, { method: 'PATCH', headers: { 'Content-Type': 'application/gzip' }, body });
    return res.json();
  }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/gzip' })], { type: 'application/json' }));
  form.append('file', body);
  const res = await call(`${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime`, token, { method: 'POST', body: form });
  return res.json();
}

export async function deleteFile(token: string, id: string): Promise<void> {
  await call(`${FILES}/${id}`, token, { method: 'DELETE' });
}
