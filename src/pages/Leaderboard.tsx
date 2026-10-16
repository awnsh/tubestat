import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { ensureMemberId, saveGroups } from '../storage/db';
import type { FriendGroup } from '../storage/schema';
import { BOARD_METRICS, buildStats, createGroup, decodeStats, encodeStats, leaderboard, refreshSelf, upsertMember, type BoardMetric } from '../social/social';
import { isoWeek } from '../analytics/periods';
import { formatDuration } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Button, Provenance, Section, Segmented, cx } from '../components/ui';

export function Leaderboard() {
  const { analytics: a, db, sample } = useData();
  const [memberId, setMemberId] = useState(db.memberId);
  const [groups, setGroups] = useState<FriendGroup[]>(db.groups);
  const [selected, setSelected] = useState<string | null>(db.groups[0]?.id ?? null);
  const [metric, setMetric] = useState<BoardMetric>('time');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sample && !db.memberId) ensureMemberId().then(setMemberId);
  }, [sample, db.memberId]);
  useEffect(() => setGroups(db.groups), [db.groups]);

  const name = db.settings.displayName || 'You';
  const me = useMemo(() => buildStats(a, memberId || 'pending', name), [a, memberId, name]);
  const code = useMemo(() => encodeStats(me), [me]);
  const liveGroups = useMemo(() => groups.map((g) => refreshSelf(g, me)), [groups, me]);
  const group = liveGroups.find((g) => g.id === selected) ?? liveGroups[0] ?? null;

  const persist = (next: FriendGroup[]) => {
    setGroups(next);
    if (!sample) saveGroups(next.map((g) => refreshSelf(g, me)));
  };

  return (
    <>
      <PageTitle title="Leaderboard" sub="Compare your week with friends. Only totals are shared, never what you watched." />

      <Section title="Your stat code" aside={`Week ${me.week.split('-W')[1]}`}>
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <MiniStat label="Watch time" value={formatDuration(me.weekWatchSeconds)} />
              <MiniStat label="Videos" value={me.weekVideos.toLocaleString()} />
              <MiniStat label="Creators" value={me.weekCreators.toLocaleString()} />
              <MiniStat label="Longest streak" value={`${me.longestStreak} days`} />
            </dl>
            <p className="mt-6 text-[14px] leading-relaxed text-dim">
              Send this code to friends who use TubeStat. They paste it into a group to see you on their leaderboard. It contains your name and the numbers above. No video titles, channels, or history.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() =>
                navigator.clipboard.writeText(code).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                })
              }
            >
              {copied ? 'Copied' : 'Copy my code'}
            </Button>
          </div>
        </div>
        {!db.settings.displayName && !sample ? <Provenance>Set the name friends see in <a className="underline underline-offset-4" href="#/profile">Profile</a>.</Provenance> : null}
      </Section>

      <Section title="Groups" className="mt-16" aside={liveGroups.length ? `${liveGroups.length}` : undefined}>
        {liveGroups.length ? (
          <div className="mb-8 flex flex-wrap gap-2">
            {liveGroups.map((g) => (
              <button key={g.id} onClick={() => setSelected(g.id)} className={cx('rounded-lg px-3 py-1.5 text-[14px]', g.id === group?.id ? 'bg-raise-2 text-paper shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-dim hover:text-paper')}>
                {g.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="mb-6 text-[14px] text-dim">TubeStat works fine on your own. Groups are for when you want a little competition.</p>
        )}
        <CreateGroup disabled={sample} onCreate={(n) => {
          const g = createGroup(n, me);
          persist([...groups, g]);
          setSelected(g.id);
        }} />
      </Section>

      {group ? (
        <Section title={group.name} className="mt-16" aside={`${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}>
          <Segmented label="Leaderboard" options={BOARD_METRICS} value={metric} onChange={setMetric} />
          <Board group={group} metric={metric} />
          <AddMember
            disabled={sample}
            onAdd={(raw) => {
              const stats = decodeStats(raw);
              if (stats.memberId === me.memberId) throw new Error('That’s your own code.');
              persist(groups.map((g) => (g.id === group.id ? upsertMember(g, stats) : g)));
              return stats.name;
            }}
          />
          <div className="mt-10 flex flex-wrap gap-3 border-t border-line pt-6">
            {group.members.filter((m) => !m.isYou).map((m) => (
              <button
                key={m.memberId}
                disabled={sample}
                onClick={() => persist(groups.map((g) => (g.id === group.id ? { ...g, members: g.members.filter((x) => x.memberId !== m.memberId) } : g)))}
                className="text-[13px] text-dim hover:text-paper disabled:opacity-40"
              >
                Remove {m.name}
              </button>
            ))}
            <button disabled={sample} onClick={() => persist(groups.filter((g) => g.id !== group.id))} className="ml-auto text-[13px] text-play hover:underline disabled:opacity-40">
              Delete group
            </button>
          </div>
        </Section>
      ) : null}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-dim">{label}</dt>
      <dd className="tnum mt-1.5 text-[22px] font-medium tracking-tight">{value}</dd>
    </div>
  );
}

function Board({ group, metric }: { group: FriendGroup; metric: BoardMetric }) {
  const rows = leaderboard(group, metric, isoWeek(Date.now()));
  const max = Math.max(1, ...rows.filter((r) => !r.stale).map((r) => r.value));
  const fmt = (v: number) => (metric === 'time' ? formatDuration(v) : metric === 'streak' ? `${v} days` : metric === 'diversity' ? `${v} creators` : `${v.toLocaleString()}`);
  return (
    <ol className="mt-6">
      {rows.map((r, i) => (
        <li key={r.member.memberId} className={cx('grid grid-cols-[24px_36px_1fr_auto] items-center gap-4 border-b border-line py-4', r.stale && 'opacity-50')}>
          <span className="tnum text-[13px] text-faint">{r.stale ? '' : i + 1}</span>
          <Avatar src={null} name={r.member.name} size={36} />
          <div className="min-w-0">
            <p className={cx('truncate', i === 0 && !r.stale ? 'display text-[28px] leading-none' : 'text-[15px]')}>
              {r.member.name}
              {r.member.isYou ? <span className="ml-2 font-sans text-[12px] text-dim">you</span> : null}
            </p>
            <div className="mt-2 max-w-[380px]">
              <div className="h-[3px] rounded-full bg-track">
                <div className={cx('h-full rounded-full', r.member.isYou ? 'bg-play' : 'bg-buffer')} style={{ width: `${r.stale ? 0 : (r.value / max) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="tnum text-right text-[15px]">
            {fmt(r.value)}
            {r.stale ? <p className="text-[11px] text-dim">code from an earlier week</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CreateGroup({ onCreate, disabled }: { onCreate: (name: string) => void; disabled?: boolean }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate(name);
        setName('');
      }}
    >
      <label className="sr-only" htmlFor="group-name">Group name</label>
      <input id="group-name" disabled={disabled} value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Purdue Friends" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-transparent px-3 py-2 text-[14px] placeholder:text-faint focus:border-paper/40 focus:outline-none disabled:opacity-40" />
      <Button type="submit" disabled={disabled || !name.trim()}>Create group</Button>
    </form>
  );
}

function AddMember({ onAdd, disabled }: { onAdd: (code: string) => string; disabled?: boolean }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const n = onAdd(code);
          setMsg({ ok: true, text: `Added ${n}. Paste a new code from them each week to update their numbers.` });
          setCode('');
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <label htmlFor="friend-code" className="text-[13px] text-dim">Add or update a friend</label>
      <div className="mt-2 flex max-w-xl gap-2">
        <input id="friend-code" disabled={disabled} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a TUBESTAT1. code" className="min-w-0 flex-1 rounded-lg border border-line-strong bg-transparent px-3 py-2 font-mono text-[13px] placeholder:font-sans placeholder:text-faint focus:border-paper/40 focus:outline-none disabled:opacity-40" />
        <Button type="submit" disabled={disabled || !code.trim()}>Add</Button>
      </div>
      {msg ? <p className={cx('mt-2 text-[13px]', msg.ok ? 'text-dim' : 'text-play')} role="status">{msg.text}</p> : null}
    </form>
  );
}
