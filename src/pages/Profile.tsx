import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { exportAll, saveSettings } from '../storage/db';
import { isExtension, kvBytesInUse } from '../storage/kv';
import type { Settings, Subscription } from '../storage/schema';
import { hasArchivePermission, removeArchivePermission, requestArchivePermission, type ArchiveProgress } from '../youtube/archive-jobs';
import { dispatch } from '../lib/dispatch';
import { parseTakeout } from '../youtube/takeout';
import { authorize, hasBuiltInClient, redirectUri } from '../account/google';
import { AccountSection, useAccount } from '../components/Account';
import { formatDate, formatDuration, formatSpan } from '../lib/format';
import { rangeFor } from '../analytics/periods';
import { PageTitle } from '../components/Shell';
import { Button, Provenance, Section, cx } from '../components/ui';
import { currentVersion } from '../update/check';

export function Profile() {
  const { analytics: a, db, sample, setSample, reload } = useData();
  const all = rangeFor('all', Date.now(), a.firstDataAt ?? Date.now());
  const s = useMemo(() => a.summary(all), [a]);
  const subs = Object.values(db.subscriptions).filter((x) => x.active);
  const account = useAccount();
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    kvBytesInUse().then(setBytes);
  }, [db]);

  const update = async (patch: Partial<Settings>) => {
    if (sample) return;
    await saveSettings(patch);
    reload();
  };

  return (
    <>
      <PageTitle title={db.settings.displayName || 'Your profile'} sub={sample ? 'Sample profile' : `Recording since ${formatDate(db.meta.installedAt)}`} />

      <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <Big label="watched in total" value={formatDuration(s.watchSeconds)} />
        <Big label="videos" value={s.videos.toLocaleString()} />
        <Big label="creators" value={s.creators.toLocaleString()} />
        <Big label="subscriptions known" value={subs.length.toLocaleString()} />
      </dl>

      <div id="account" className="scroll-mt-8">
        <Section title="Your account" className="mt-16">
          <AccountSection clientId={db.settings.googleClientId} disabled={sample} />
        </Section>
      </div>

      <Section title="You" className="mt-16">
        <label htmlFor="display-name" className="text-[13px] text-dim">Name shown to friends on leaderboards</label>
        <input
          id="display-name"
          key={db.settings.displayName}
          defaultValue={db.settings.displayName}
          disabled={sample}
          onBlur={(e) => e.target.value !== db.settings.displayName && update({ displayName: e.target.value.trim().slice(0, 40) })}
          placeholder="Your first name"
          className="mt-2 block w-full max-w-sm rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[15px] placeholder:text-faint focus:border-paper/40 focus:outline-none disabled:opacity-40"
        />
      </Section>

      <Section title="Tracking" className="mt-16">
        <div className="max-w-2xl divide-y divide-line">
          <Toggle label="Record my YouTube viewing" detail="When off, nothing new is recorded. Everything already recorded stays." on={db.settings.trackingEnabled} disabled={sample} onChange={(v) => update({ trackingEnabled: v })} />
          <Toggle label="Include Shorts" detail="Shorts are recorded separately from long-form videos, so you can always tell them apart." on={db.settings.trackShorts} disabled={sample} onChange={(v) => update({ trackShorts: v })} />
          <Toggle label="Replay Map on YouTube" detail="Shows which parts of a video you’ve already seen or replayed, right on the seek bar, with a chip to resume or jump to what you haven’t seen." on={db.settings.replayMap} disabled={sample} onChange={(v) => update({ replayMap: v })} />
          <Toggle label="Tell me when there’s a new version" detail={`You have TubeStat ${currentVersion()}. Twice a day TubeStat asks GitHub for the latest release number, and shows a notice if there’s a newer one. Copies from the Chrome Web Store are updated by Chrome and skip this.`} on={db.settings.checkUpdates} disabled={sample} onChange={(v) => update({ checkUpdates: v })} />
        </div>
      </Section>

      <Section title="Add more history" className="mt-16">
        <div className="max-w-2xl space-y-12">
          <OtherDevicesSource lastSync={db.meta.lastHistorySync} count={s.otherDeviceVideos} on={db.settings.syncHistoryPage} disabled={sample} onChange={(v) => update({ syncHistoryPage: v })} />
          <SubscriptionsSource lastSync={db.meta.lastSubscriptionSync} count={subs.length} />
          <SubscriptionDates disabled={sample} signedIn={!!account} clientId={db.settings.googleClientId} lastSync={db.meta.lastApiSync} onSaveClientId={(id) => update({ googleClientId: id })} />
          <PastCounts disabled={sample} subscriptions={Object.values(db.subscriptions)} />
          <TakeoutSource disabled={sample} importedAt={db.meta.takeoutImportedAt} />
        </div>
      </Section>

      <Section title="Privacy" className="mt-16">
        <div className="max-w-2xl space-y-6 text-[15px] leading-relaxed">
          <Privacy q="What TubeStat records">
            For each video you play on youtube.com in this browser, and each one listed when you open your YouTube history page: its ID, title, channel, length, YouTube’s category for it, whether it’s a Short, when you watched, how long it actually played, and how much of it you covered. For channels you visit: name, handle, avatar, and public subscriber count. For your subscriptions: which channels, and a date if YouTube provides one. Nothing else: no searches, comments, recommendations, or other sites.
          </Privacy>
          <Privacy q="Where it’s stored">
            In Chrome’s extension storage on this device. If you sign in with Google, also in a private app folder in your own Google Drive, which only TubeStat can open and which doesn’t appear in your Drive files. TubeStat has no server of its own.
          </Privacy>
          <Privacy q="Does anything leave your device?">
            Not unless you sign in. Signed out, TubeStat only makes network requests to load YouTube thumbnails and avatars and to ask GitHub for the latest version number (unless you turn that off above). Signed in, your stats also go to your own Google Drive app folder, and TubeStat reads your subscriptions from YouTube, read-only. If you turn on Internet Archive estimates, web.archive.org is sent the IDs of channels you subscribe to, one at a time, and nothing else. Google sign-in tokens are kept in memory and never saved; only your account’s email and name are.
          </Privacy>
          <Privacy q="What friends see">
            Only what’s in your stat code, and only if you send it: your name, this week’s watch time, video count, creator count, and streaks. Never titles, channels, or history.
          </Privacy>
          <Privacy q="Deleting your data">
            Use “Delete everything” below, which also deletes the copy in your Google account if you’re signed in. Removing the extension erases this device’s copy only. You can also remove TubeStat’s access in your Google account settings.
          </Privacy>
        </div>
      </Section>

      <Section title="Your data" className="mt-16" aside={bytes != null ? `${(bytes / 1024 / 1024).toFixed(2)} MB on this device` : undefined}>
        <div className="flex max-w-2xl flex-wrap gap-3">
          <Button
            disabled={sample}
            onClick={async () => {
              const blob = new Blob([await exportAll()], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const el = document.createElement('a');
              el.href = url;
              el.download = `tubestat-export-${new Date().toISOString().slice(0, 10)}.json`;
              el.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export everything (JSON)
          </Button>
          <ImportBackup disabled={sample} onDone={reload} />
          <Button onClick={() => setSample(!sample)}>{sample ? 'Hide sample data' : 'Preview with sample data'}</Button>
        </div>
        <p className="mt-3 max-w-2xl text-[13px] text-dim">
          Moving to a new copy of TubeStat? Export here, then use “Import a TubeStat export” in the new copy. Importing adds to what’s already there and never overwrites it.
        </p>
        <DeleteAll disabled={sample} onDone={reload} accountClientId={account ? account.clientId : null} />
      </Section>
    </>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="hero-num text-[32px]">{value}</dd>
      <dt className="mt-2 text-[13px] text-dim">{label}</dt>
    </div>
  );
}

function Toggle({ label, detail, on, onChange, disabled }: { label: string; detail: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <p className="text-[15px]">{label}</p>
        <p className="mt-1 text-[13px] text-dim">{detail}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cx('relative mt-1 h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40', on ? 'bg-play' : 'bg-raise-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}
      >
        <span className={cx('absolute top-1 h-4 w-4 rounded-full bg-paper transition-all', on ? 'left-5' : 'left-1')} />
      </button>
    </div>
  );
}

function Privacy({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-paper">{q}</h3>
      <p className="mt-1 text-dim">{children}</p>
    </div>
  );
}

function SourceHeader({ title, status }: { title: string; status: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-[16px] text-paper">{title}</h3>
      <span className="text-[13px] text-dim">{status}</span>
    </div>
  );
}

function OtherDevicesSource({ lastSync, count, on, disabled, onChange }: { lastSync: number | null; count: number; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <SourceHeader title="Your phone and other devices" status={lastSync ? `${count.toLocaleString()} videos, read ${formatSpan(Date.now() - lastSync)} ago`.replace('today ago', 'today') : 'Not read yet'} />
      <p className="text-[14px] leading-relaxed text-dim">
        TubeStat can’t see the YouTube app on your phone, but your YouTube history can: it lists what you watched on every device signed in to your account. Open it on this computer and scroll back as far as you want to bring in. TubeStat adds each video on the day YouTube lists it, skips anything it already recorded here, and estimates watch time from how far the red bar under the thumbnail reaches. Shorts count as videos, but YouTube doesn’t show how long you watched them, so they don’t add hours.
      </p>
      <a href="https://www.youtube.com/feed/history" target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg border border-line-strong px-4 py-2 text-[14px] hover:bg-raise-2">
        Open YouTube history
      </a>
      <div className="mt-2 max-w-2xl">
        <Toggle label="Read my YouTube history page when I open it" detail="Only when you visit youtube.com/feed/history yourself. YouTube history has to be turned on in your Google account." on={on} disabled={disabled} onChange={onChange} />
      </div>
    </div>
  );
}

function SubscriptionsSource({ lastSync, count }: { lastSync: number | null; count: number }) {
  return (
    <div>
      <SourceHeader title="Your subscriptions" status={lastSync ? `${count} channels, updated ${formatSpan(Date.now() - lastSync)} ago`.replace('today ago', 'today') : 'Not read yet'} />
      <p className="text-[14px] leading-relaxed text-dim">
        Open your subscriptions page on YouTube and scroll to the bottom once. TubeStat reads the list and starts recording each creator’s subscriber count, so you can watch them grow from here on. YouTube doesn’t show subscription dates on this page.
      </p>
      <a href="https://www.youtube.com/feed/channels" target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg border border-line-strong px-4 py-2 text-[14px] hover:bg-raise-2">
        Open subscriptions page
      </a>
    </div>
  );
}

function SubscriptionDates({ signedIn, lastSync, clientId, onSaveClientId, disabled }: { signedIn: boolean; lastSync: number | null; clientId: string; onSaveClientId: (id: string) => Promise<void>; disabled?: boolean }) {
  const [dev, setDev] = useState(!!clientId);
  const [id, setId] = useState(clientId);
  return (
    <div>
      <SourceHeader title="Subscription dates from your YouTube account" status={lastSync ? `Last read ${formatDate(lastSync)}` : signedIn ? 'Reading…' : 'Needs sign-in'} />
      <p className="text-[14px] leading-relaxed text-dim">
        YouTube only tells your own account <em>when</em> you subscribed. {signedIn ? 'Because you’re signed in with Google, TubeStat reads those dates, and each channel’s creation date, about once a week.' : 'Sign in with Google at the top of this page and TubeStat reads those dates, and each channel’s creation date, about once a week.'} They power “Subscribed for” and OG status for subscriptions older than TubeStat. Read-only: TubeStat can’t change anything on your YouTube account.
      </p>
      {!signedIn ? (
        <Button className="mt-4" disabled={disabled} onClick={() => document.getElementById('account')?.scrollIntoView({ behavior: 'smooth' })}>
          Go to sign-in
        </Button>
      ) : null}
      {!hasBuiltInClient() || dev ? (
        <details className="mt-5 text-[13px] text-dim" open={dev}>
          <summary className="cursor-pointer text-faint hover:text-paper">For developers: use your own OAuth client</summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-relaxed">
            <li>In Google Cloud Console, enable “YouTube Data API v3” and “Google Drive API”.</li>
            <li>Create an OAuth client ID of type “Web application”, with this redirect URI: <code className="break-all rounded bg-raise-2 px-1.5 py-0.5 text-paper">{redirectUri()}</code></li>
            <li>Save the client ID here, then use Sign in with Google above.</li>
          </ol>
          <div className="mt-3 flex max-w-xl gap-2">
            <label htmlFor="client-id" className="sr-only">OAuth client ID</label>
            <input id="client-id" disabled={disabled} value={id} onChange={(e) => setId(e.target.value)} placeholder="…apps.googleusercontent.com" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[13px] placeholder:text-faint focus:border-paper/40 focus:outline-none disabled:opacity-40" />
            <Button disabled={disabled || (!!id.trim() && !id.trim().endsWith('.apps.googleusercontent.com')) || id.trim() === clientId} onClick={() => onSaveClientId(id.trim()).then(() => setDev(!!id.trim()))}>
              Save
            </Button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TakeoutSource({ importedAt, disabled }: { importedAt: number | null; disabled?: boolean }) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    setStatus({ ok: true, text: 'Reading your history…' });
    try {
      const result = parseTakeout(await file.text());
      if (!result.watches.length) throw new Error('No videos found in that file.');
      const added = await dispatch<number>({ type: 'takeout:import', watches: result.watches, channels: result.channels });
      setStatus({
        ok: true,
        text: `Imported ${added.toLocaleString()} viewings from ${formatDate(result.range![0], 'month')} to ${formatDate(result.range![1], 'month')}.${result.watches.length - added > 0 ? ` ${(result.watches.length - added).toLocaleString()} were already here.` : ''}`,
      });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <SourceHeader title="Watch history from Google Takeout" status={importedAt ? `Imported ${formatDate(importedAt)}` : 'Optional'} />
      <p className="text-[14px] leading-relaxed text-dim">
        Takeout has every video you’ve opened on your account, with dates, going back years. Import it to fill in your History, Time Machine, and creator relationships from before TubeStat. Takeout doesn’t say how long you watched, so imported videos add to video counts, not hours. Shorts aren’t marked in Takeout.
      </p>
      <p className="mt-2 text-[13px] text-dim">
        At <a href="https://takeout.google.com/" target="_blank" rel="noreferrer" className="text-paper underline underline-offset-4">takeout.google.com</a>, choose only “YouTube and YouTube Music”, set history format to JSON, and include only “history”. Then pick <code className="rounded bg-raise-2 px-1 text-paper">watch-history.json</code> here.
      </p>
      <label className={cx('mt-4 inline-flex cursor-pointer rounded-lg border border-line-strong px-4 py-2 text-[14px] hover:bg-raise-2', (busy || disabled) && 'pointer-events-none opacity-40')}>
        {busy ? 'Importing…' : 'Choose watch-history.json'}
        <input type="file" accept=".json,application/json" className="sr-only" disabled={busy || disabled} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {status ? <p className={cx('mt-2 text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
      <Provenance>The file is read on this device. Nothing is uploaded.</Provenance>
    </div>
  );
}

function PastCounts({ subscriptions, disabled }: { subscriptions: Subscription[]; disabled?: boolean }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    hasArchivePermission().then(setOn);
  }, []);
  const dated = subscriptions.filter((s) => s.subscriptionDate != null);
  const live = dated.filter((s) => s.subscriberCountAtSubscription != null && s.countAtSubscriptionSource !== 'archive').length;
  const fromArchive = dated.filter((s) => s.countAtSubscriptionSource === 'archive').length;

  const run = async () => {
    setBusy(true);
    setStatus({ ok: true, text: 'Looking up the Internet Archive…' });
    try {
      const r = await dispatch<ArchiveProgress>({ type: 'archive:lookup' });
      setStatus({ ok: true, text: `Checked ${r.checked} ${r.checked === 1 ? 'channel' : 'channels'}, found ${r.found}.${r.remaining ? ` ${r.remaining} more will be checked in the background.` : ''}` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (next: boolean) => {
    if (next) {
      // The permission prompt needs the click, so ask before anything else.
      const granted = await requestArchivePermission();
      setOn(granted);
      if (granted) await run();
      else setStatus({ ok: false, text: 'Chrome didn’t give permission, so nothing was looked up.' });
    } else {
      await removeArchivePermission();
      setOn(false);
      setStatus(null);
    }
  };

  return (
    <div>
      <SourceHeader title="Their size when you subscribed" status={dated.length ? `${(live + fromArchive).toLocaleString()} of ${dated.length.toLocaleString()} known` : 'Needs subscription dates'} />
      <p className="text-[14px] leading-relaxed text-dim">
        YouTube doesn’t publish past subscriber counts. TubeStat knows them exactly for channels it saw you subscribe to. For older subscriptions, it can estimate them from the Internet Archive, which has saved copies of popular channel pages going back to 2006. Each estimate is labelled with the date of the copy it came from. Small channels often weren’t saved, so they can’t be estimated.
      </p>
      <div className="mt-2 max-w-2xl">
        <Toggle
          label="Estimate them from the Internet Archive"
          detail="Sends web.archive.org one channel ID at a time, a few every 15 minutes. Nothing about you is sent. Chrome will ask for permission."
          on={on}
          disabled={disabled || busy || !isExtension}
          onChange={toggle}
        />
      </div>
      {on && !busy ? (
        <Button className="mt-1" disabled={disabled} onClick={run}>Check more now</Button>
      ) : null}
      {status ? <p className={cx('mt-2 text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
    </div>
  );
}

function ImportBackup({ disabled, onDone }: { disabled?: boolean; onDone: () => void }) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File) => {
    setBusy(true);
    setStatus({ ok: true, text: 'Importing…' });
    try {
      const r = await dispatch<{ added: number; total: number }>({ type: 'data:import', json: await file.text() });
      if (!r) throw new Error('Importing only works inside the extension.');
      setStatus({ ok: true, text: r.added ? `Imported ${r.added.toLocaleString()} viewings. You now have ${r.total.toLocaleString()}.` : `Everything in that file was already here (${r.total.toLocaleString()} viewings).` });
      onDone();
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <label className={cx('inline-flex cursor-pointer items-center justify-center rounded-lg border border-line-strong px-4 py-2 text-[14px] font-medium text-paper hover:bg-raise-2', (disabled || busy) && 'pointer-events-none opacity-40')}>
        {busy ? 'Importing…' : 'Import a TubeStat export'}
        <input type="file" accept="application/json,.json" className="sr-only" disabled={disabled || busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {status ? <p className={cx('basis-full text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
    </>
  );
}

/** `accountClientId` is set (possibly to '') while signed in; then the Google copy is deleted too. */
function DeleteAll({ onDone, disabled, accountClientId }: { onDone: () => void; disabled?: boolean; accountClientId: string | null }) {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const signedIn = accountClientId != null;
  return (
    <div className="mt-10 max-w-2xl border-t border-line pt-6">
      <p className="text-[15px]">Delete everything</p>
      <p className="mt-1 text-[13px] text-dim">
        Erases all viewing history, creators, subscriptions, groups, and settings from this device{signedIn ? ', and the copy in your Google account, which also removes it from your other devices the next time they sync' : ''}. This can’t be undone. Export first if you might want it back.
      </p>
      <div className="mt-4 flex gap-2">
        {stage === 'idle' ? (
          <Button variant="danger" disabled={disabled} onClick={() => setStage('confirm')}>Delete everything</Button>
        ) : stage === 'confirm' ? (
          <>
            <Button
              variant="danger"
              onClick={async () => {
                setError(null);
                try {
                  if (signedIn) {
                    // Delete the Google copy first, so a sync can't bring the data back.
                    const token = await authorize(accountClientId);
                    await dispatch({ type: 'account:signOut', token });
                  }
                  await dispatch({ type: 'data:deleteAll' });
                  setStage('done');
                  onDone();
                } catch (e) {
                  setError(`Nothing was deleted. ${(e as Error).message}`);
                }
              }}
            >
              Yes, delete all my data
            </Button>
            <Button onClick={() => setStage('idle')}>Keep my data</Button>
          </>
        ) : (
          <p className="text-[13px] text-dim" role="status">Deleted. TubeStat is starting fresh.</p>
        )}
      </div>
      {error ? <p className="mt-2 text-[13px] text-play" role="status">{error}</p> : null}
    </div>
  );
}
