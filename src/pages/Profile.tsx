import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { exportAll, saveSettings } from '../storage/db';
import { isExtension, kvBytesInUse } from '../storage/kv';
import type { Settings } from '../storage/schema';
import { dispatch } from '../lib/dispatch';
import { parseTakeout } from '../youtube/takeout';
import { authorize, fetchApiSync, redirectUri, requestApiPermissions } from '../youtube/api';
import { formatDate, formatDuration, formatSpan } from '../lib/format';
import { rangeFor } from '../analytics/periods';
import { PageTitle } from '../components/Shell';
import { Button, Provenance, Section, cx } from '../components/ui';

export function Profile() {
  const { analytics: a, db, sample, setSample, reload } = useData();
  const all = rangeFor('all', Date.now(), a.firstDataAt ?? Date.now());
  const s = useMemo(() => a.summary(all), [a]);
  const subs = Object.values(db.subscriptions).filter((x) => x.active);
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
        </div>
      </Section>

      <Section title="Add more history" className="mt-16">
        <div className="max-w-2xl space-y-12">
          <SubscriptionsSource lastSync={db.meta.lastSubscriptionSync} count={subs.length} />
          <ApiSource disabled={sample} clientId={db.settings.googleClientId} lastSync={db.meta.lastApiSync} onSaveClientId={(id) => update({ googleClientId: id })} watchedChannelIds={Object.keys(db.channels)} />
          <TakeoutSource disabled={sample} importedAt={db.meta.takeoutImportedAt} />
        </div>
      </Section>

      <Section title="Privacy" className="mt-16">
        <div className="max-w-2xl space-y-6 text-[15px] leading-relaxed">
          <Privacy q="What TubeStat records">
            For each video you play on youtube.com in this browser: its ID, title, channel, length, YouTube’s category for it, whether it’s a Short, when you watched, how long it actually played, and how much of it you covered. For channels you visit: name, handle, avatar, and public subscriber count. For your subscriptions: which channels, and a date if YouTube provides one. Nothing else: no searches, comments, recommendations, or other sites.
          </Privacy>
          <Privacy q="Where it’s stored">
            In Chrome’s extension storage on this device. TubeStat has no server and no account. Your data isn’t synced to other devices.
          </Privacy>
          <Privacy q="Does anything leave your device?">
            No viewing data ever leaves your device. TubeStat only makes network requests to load YouTube thumbnails and avatars, and, if you connect it, to read your subscriptions from the YouTube Data API. That connection is read-only and the access token is kept in memory, never saved.
          </Privacy>
          <Privacy q="What friends see">
            Only what’s in your stat code, and only if you send it: your name, this week’s watch time, video count, creator count, and streaks. Never titles, channels, or history.
          </Privacy>
          <Privacy q="Deleting your data">
            Use “Delete everything” below, or remove the extension. Both erase all of it immediately.
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
          <Button onClick={() => setSample(!sample)}>{sample ? 'Hide sample data' : 'Preview with sample data'}</Button>
        </div>
        <DeleteAll disabled={sample} onDone={reload} />
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

function ApiSource({ clientId, lastSync, onSaveClientId, watchedChannelIds, disabled }: { clientId: string; lastSync: number | null; onSaveClientId: (id: string) => Promise<void>; watchedChannelIds: string[]; disabled?: boolean }) {
  const [id, setId] = useState(clientId);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    // Ask for the optional permissions first, while we're still inside the click.
    const permission = requestApiPermissions();
    setBusy(true);
    setStatus(null);
    try {
      if (!(await permission)) throw new Error('TubeStat needs permission to read your subscriptions from Google. Nothing was changed.');
      if (id !== clientId) await onSaveClientId(id.trim());
      setStatus({ ok: true, text: 'Waiting for Google…' });
      const token = await authorize(id);
      const payload = await fetchApiSync(token, watchedChannelIds, (t) => setStatus({ ok: true, text: t }));
      await dispatch({ type: 'api:apply', payload });
      setStatus({ ok: true, text: `Done. ${payload.subscriptions.length} subscriptions with dates, ${payload.channels.length} channels updated.` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SourceHeader title="Subscription dates from your YouTube account" status={lastSync ? `Last synced ${formatDate(lastSync)}` : 'Optional'} />
      <p className="text-[14px] leading-relaxed text-dim">
        The only place YouTube records <em>when</em> you subscribed is its Data API. Connecting gives TubeStat those dates and each channel’s creation date, which power “Subscribed for” and OG status for subscriptions older than TubeStat. It’s read-only and runs only when you press the button.
      </p>
      <button onClick={() => setOpen((v) => !v)} className="mt-3 text-[13px] text-paper underline-offset-4 hover:underline" aria-expanded={open}>
        {open ? 'Hide setup steps' : 'Setup steps (about 5 minutes, once)'}
      </button>
      {open ? (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-dim">
          <li>In Google Cloud Console, create a project and enable “YouTube Data API v3”.</li>
          <li>Configure the OAuth consent screen (External, add yourself as a test user).</li>
          <li>Create an OAuth client ID of type “Web application”.</li>
          <li>
            Add this authorised redirect URI: <code className="break-all rounded bg-raise-2 px-1.5 py-0.5 text-paper">{redirectUri()}</code>
          </li>
          <li>Paste the client ID below and press Connect.</li>
        </ol>
      ) : null}
      <div className="mt-4 flex max-w-xl gap-2">
        <label htmlFor="client-id" className="sr-only">OAuth client ID</label>
        <input id="client-id" disabled={disabled} value={id} onChange={(e) => setId(e.target.value)} placeholder="OAuth client ID (…apps.googleusercontent.com)" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[13px] placeholder:text-faint focus:border-paper/40 focus:outline-none disabled:opacity-40" />
        <Button onClick={run} disabled={disabled || busy || !id.trim().endsWith('.apps.googleusercontent.com') || !isExtension}>
          {busy ? 'Syncing…' : lastSync ? 'Sync again' : 'Connect'}
        </Button>
      </div>
      {status ? <p className={cx('mt-2 text-[13px]', status.ok ? 'text-dim' : 'text-play')} role="status">{status.text}</p> : null}
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

function DeleteAll({ onDone, disabled }: { onDone: () => void; disabled?: boolean }) {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'done'>('idle');
  return (
    <div className="mt-10 max-w-2xl border-t border-line pt-6">
      <p className="text-[15px]">Delete everything</p>
      <p className="mt-1 text-[13px] text-dim">Erases all viewing history, creators, subscriptions, groups, and settings from this device. This can’t be undone. Export first if you might want it back.</p>
      <div className="mt-4 flex gap-2">
        {stage === 'idle' ? (
          <Button variant="danger" disabled={disabled} onClick={() => setStage('confirm')}>Delete everything</Button>
        ) : stage === 'confirm' ? (
          <>
            <Button
              variant="danger"
              onClick={async () => {
                await dispatch({ type: 'data:deleteAll' });
                setStage('done');
                onDone();
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
    </div>
  );
}
