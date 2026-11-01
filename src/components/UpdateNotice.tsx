import { useEffect, useState } from 'react';
import { kvGet, kvSubscribe } from '../storage/kv';
import { applyDownloadedUpdate, checkForUpdate, checkNow, currentVersion, dismissUpdate, pendingUpdate, type CheckResult, type UpdateState } from '../update/check';
import { Button, cx } from './ui';

/**
 * "Check for updates": says you're up to date, or shows what's new. A newer
 * zip release also brings back the banner at the top (even if you'd dismissed
 * it), which has the download and the steps.
 */
export function CheckForUpdates({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const check = async () => {
    setBusy(true);
    try {
      setResult(await checkNow());
    } finally {
      setBusy(false);
    }
  };

  const message = !result
    ? null
    : result.status === 'latest'
      ? `You’re up to date (${result.version}).`
      : result.status === 'available'
        ? `TubeStat ${result.latest} is out. You have ${result.version}.`
        : result.status === 'store-ready'
          ? `TubeStat ${result.latest ?? 'update'} is downloaded and ready.`
          : result.message;

  return (
    <div className={className}>
      {compact ? (
        <button onClick={check} disabled={busy} className="text-faint underline-offset-4 hover:text-paper hover:underline disabled:opacity-60">
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
      ) : (
        <Button onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check for updates'}</Button>
      )}
      {message ? (
        <p className={cx(compact ? 'mt-1' : 'mt-2 text-[13px]', result?.status === 'error' ? 'text-play' : 'text-dim')} role="status">
          {message}{' '}
          {result?.status === 'available' ? (
            <a href={result.downloadUrl} target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">Download</a>
          ) : result?.status === 'store-ready' ? (
            <button onClick={applyDownloadedUpdate} className="text-paper underline underline-offset-4">Restart TubeStat to finish</button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** The newer release waiting to be installed, if any. Kicks off a (throttled) check on mount. */
export function useUpdate(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const read = () => kvGet<UpdateState>('update').then((s) => setState(pendingUpdate(s)));
    read();
    checkForUpdate().then(read);
    return kvSubscribe((keys) => keys.includes('update') && read());
  }, []);
  return state;
}

/**
 * "A new version is out" with the download and the three steps to apply it.
 * Unzipping over the same folder keeps the extension's ID, and with it all your data.
 */
export function UpdateNotice({ compact = false, className }: { compact?: boolean; className?: string }) {
  const update = useUpdate();
  const [open, setOpen] = useState(false);
  if (!update?.latest) return null;
  const latest = update.latest;

  return (
    <div className={cx('border-line bg-raise text-[13px]', compact ? 'rounded-lg border p-3' : 'border-b px-6 py-2.5 md:px-14', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-dim">
          <span className="text-paper">TubeStat {latest} is out.</span> {compact ? `You have ${currentVersion()}.` : `You have ${currentVersion()}. Updating keeps all your data.`}
        </span>
        <span className="flex items-center gap-1">
          <a href={update.downloadUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(true)} className="rounded-md bg-paper px-2.5 py-1 font-medium text-ink hover:bg-white">
            Download
          </a>
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-md px-2 py-1 text-paper underline-offset-4 hover:underline">
            How to update
          </button>
          <button onClick={() => dismissUpdate(latest)} aria-label={`Dismiss TubeStat ${latest}`} className="rounded-md px-2 py-1 text-dim hover:text-paper">
            {compact ? '✕' : 'Not now'}
          </button>
        </span>
      </div>
      {open ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 leading-relaxed text-dim">
          <li>Unzip the download <span className="text-paper">into the same folder</span> you loaded TubeStat from, replacing the old files. A different folder would start with empty data.</li>
          <li>Open <span className="text-paper">chrome://extensions</span>.</li>
          <li>Press the reload icon on TubeStat’s card. <a href={update.releaseUrl} target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">What’s new</a></li>
        </ol>
      ) : null}
    </div>
  );
}
