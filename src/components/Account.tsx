import { useEffect, useState } from 'react';
import { kvGet, kvSubscribe, isExtension } from '../storage/kv';
import { dispatch } from '../lib/dispatch';
import { formatSpan } from '../lib/format';
import { authorize, hasBuiltInClient, requestApiPermissions, revoke, whoAmI } from '../account/google';
import type { Account } from '../account/sync';
import { Avatar, Button, cx } from './ui';

/** The signed-in Google account, or null. Updates live when a sync finishes. */
export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    const read = () => kvGet<Account | null>('account').then((a) => setAccount(a ?? null));
    read();
    return kvSubscribe((keys) => keys.includes('account') && read());
  }, []);
  return account;
}

type Status = { ok: boolean; text: string } | null;

/**
 * Signs in (or reuses the sign-in) and hands the token to the background worker
 * for one full sync. Must start from a click: the permission prompt needs it.
 */
export async function signInAndSync(clientId: string, setStatus: (s: Status) => void, { newSignIn = true } = {}) {
  const permission = requestApiPermissions();
  if (!(await permission)) throw new Error('TubeStat needs permission to talk to Google. Nothing was changed.');
  setStatus({ ok: true, text: 'Waiting for Google…' });
  const token = await authorize(clientId);
  const user = newSignIn ? await whoAmI(token) : undefined;
  setStatus({ ok: true, text: 'Syncing your stats and subscriptions…' });
  const r = await dispatch<{ subscriptions: number; downloaded: number; uploaded: number }>({ type: 'account:sync', token, user, clientId });
  const merged = r.downloaded ? ` Brought in data from your other devices.` : '';
  setStatus({ ok: true, text: `Synced. ${r.subscriptions.toLocaleString()} subscriptions with dates.${merged}` });
}

export function AccountSection({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const account = useAccount();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const available = isExtension && (hasBuiltInClient() || !!clientId);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const signOut = (deleteCloud: boolean) =>
    run(async () => {
      let token: string | undefined;
      if (deleteCloud) {
        setStatus({ ok: true, text: 'Waiting for Google…' });
        token = await authorize(account?.clientId ?? clientId);
      }
      await dispatch({ type: 'account:signOut', token });
      if (token) revoke(token);
      setLeaving(false);
      setStatus({ ok: true, text: deleteCloud ? 'Signed out, and your stats were deleted from your Google account. They’re still on this device.' : 'Signed out. Your stats are still on this device and in your Google account.' });
    });

  if (!account) {
    return (
      <div>
        <p className="statement text-[22px]">Keep your stats in your Google account.</p>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-dim">
          Sign in once and TubeStat keeps your history in a private folder in your own Google Drive that only TubeStat can open. Sign in on another computer and everything comes with you. The same sign-in reads <em>when</em> you subscribed to each channel, which YouTube only shares through your account. TubeStat has no server: your data goes from your browser to your Google account and nowhere else.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button variant="primary" disabled={disabled || busy || !available} onClick={() => run(() => signInAndSync(clientId, setStatus))}>
            <GoogleG />
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </Button>
        </div>
        {!available && isExtension ? <p className="mt-2 text-[13px] text-dim">Sign-in isn’t set up in this copy of TubeStat yet.</p> : null}
        {status ? <p className={cx('mt-3 text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={account.picture} name={account.name || account.email} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{account.name || account.email}</p>
          <p className="truncate text-[13px] text-dim">
            {account.email} · {account.lastSync ? `synced ${formatSpan(Date.now() - account.lastSync)} ago`.replace('today ago', 'just now') : 'not synced yet'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button disabled={disabled || busy} onClick={() => run(() => signInAndSync(account.clientId, setStatus, { newSignIn: !!account.lastError }))}>
            {busy ? 'Syncing…' : account.lastError ? 'Sign in again' : 'Sync now'}
          </Button>
          <Button disabled={disabled || busy} onClick={() => setLeaving(true)}>Sign out</Button>
        </div>
      </div>
      {account.lastError && !status ? <p className="mt-3 text-[13px] text-play" role="status">{account.lastError}</p> : null}
      <p className="mt-3 max-w-2xl text-[13px] text-dim">Syncs in the background about every half hour, and reads your subscription dates about once a week.</p>
      {leaving ? (
        <div className="mt-4 max-w-2xl rounded-lg border border-line-strong p-4">
          <p className="text-[14px]">Sign out of {account.email}?</p>
          <p className="mt-1 text-[13px] text-dim">This device stops syncing. Everything already here stays here.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => signOut(false)}>Sign out, keep my stats in Google</Button>
            <Button variant="danger" disabled={busy} onClick={() => signOut(true)}>Sign out and delete them from Google</Button>
            <Button disabled={busy} onClick={() => setLeaving(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {status ? <p className={cx('mt-3 text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="16" height="16" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
