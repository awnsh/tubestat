import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href, navigate } from '../hooks/useRoute';
import { rangeFor, type PeriodKind } from '../analytics/periods';
import { FORMATS, type CreatorMetric, type CreatorStat, type Format } from '../analytics/engine';
import { computeOg } from '../analytics/og';
import { formatAudienceShare, formatDuration } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Empty, OgBadge, Scrubber, Section, Segmented, cx } from '../components/ui';

const METRICS: Array<{ id: CreatorMetric; label: string }> = [
  { id: 'time', label: 'Watch time' },
  { id: 'videos', label: 'Videos' },
  { id: 'sessions', label: 'Sessions' },
];

const PERIODS: Array<{ id: PeriodKind; label: string }> = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

function metricText(c: CreatorStat, m: CreatorMetric) {
  if (m === 'time') return formatDuration(c.watchSeconds);
  if (m === 'videos') return `${c.videos.toLocaleString()} videos`;
  return `${c.sessions.toLocaleString()} sessions`;
}

function metricValue(c: CreatorStat, m: CreatorMetric) {
  return m === 'time' ? c.watchSeconds : m === 'videos' ? c.videos : c.sessions;
}

/** Lowercase, accents removed, so "beyonce" finds "Beyoncé". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function Creators() {
  const { analytics: all, db } = useData();
  const [metric, setMetric] = useState<CreatorMetric>('time');
  const [kind, setKind] = useState<PeriodKind>('all');
  const [format, setFormat] = useState<Format>('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const a = all.forFormat(format);
  const range = useMemo(() => rangeFor(kind, Date.now(), all.firstDataAt ?? Date.now()), [kind, all]);
  const q = fold(query.trim().replace(/^@/, ''));
  // Searching looks through everyone you watched in this view, not just the top 100.
  const list = useMemo(() => a.topCreators(range, metric, q ? 100_000 : 100), [a, range, metric, q]);
  const matches = (id: string, name: string) => {
    const handle = db.channels[id]?.handle ?? '';
    return fold(name).includes(q) || fold(handle.replace(/^@/, '')).includes(q);
  };
  const ranked = list.map((c, i) => ({ c, rank: i + 1 })).filter(({ c }) => !q || matches(c.channelId, c.channelName));
  // Channels you know (subscribed, or watched outside this view) that also match.
  const others = q
    ? Object.values(db.channels)
        .filter((ch) => !list.some((c) => c.channelId === ch.channelId) && matches(ch.channelId, ch.channelName || ''))
        .sort((x, y) => (db.subscriptions[y.channelId]?.active ? 1 : 0) - (db.subscriptions[x.channelId]?.active ? 1 : 0) || x.channelName.localeCompare(y.channelName))
        .slice(0, 30)
    : [];
  const [first, ...rest] = list;
  const max = first ? metricValue(first, metric) : 1;
  const second = (c: CreatorStat) => {
    const base = metric === 'time' ? `${c.videos.toLocaleString()} videos` : formatDuration(c.watchSeconds);
    // In the mixed view, say how much of a creator's count is Shorts.
    return format === 'all' && c.shorts ? `${base}, ${c.shorts === c.videos ? 'all Shorts' : c.shorts === 1 ? '1 Short' : `${c.shorts.toLocaleString()} Shorts`}` : base;
  };

  // "/" jumps to the search box, as on YouTube.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !(t && /^(INPUT|TEXTAREA)$/.test(t.tagName))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const row = ({ c, rank }: { c: CreatorStat; rank: number }, i: number) => {
    const og = computeOg(db.channels[c.channelId], db.subscriptions[c.channelId]);
    return (
      <li key={c.channelId}>
        <a href={href('creators', c.channelId)} className="group grid grid-cols-[28px_40px_1fr_auto] items-center gap-4 py-3.5">
          <span className="tnum text-[13px] text-faint">{rank}</span>
          <Avatar src={c.avatar} name={c.channelName} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] group-hover:underline">{c.channelName}</span>
              {og ? <OgBadge tier={og.tier} size="sm" /> : null}
            </div>
            <Scrubber value={metricValue(c, metric)} max={max} className="mt-2 max-w-[420px]" animate={!q && i < 12} delay={i * 45} />
          </div>
          <div className="tnum text-right">
            <p className="text-[14px]">{metricText(c, metric)}</p>
            <p className="text-[12px] text-dim">{second(c)}</p>
          </div>
        </a>
      </li>
    );
  };

  return (
    <>
      <PageTitle title="Creators" sub={`Who you spend your time with. ${range.label}.`} />
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Search creators</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('');
              // Enter opens the top match.
              const top = ranked[0]?.c.channelId ?? others[0]?.channelId;
              if (e.key === 'Enter' && q && top) navigate('creators', top);
            }}
            placeholder="Search creators  /"
            className="w-full rounded-lg border border-line-strong bg-transparent py-2 pl-9 pr-3 text-[14px] placeholder:text-faint focus:border-paper/40 focus:outline-none"
          />
        </label>
        <Segmented label="Rank by" options={METRICS} value={metric} onChange={setMetric} />
        <Segmented label="Time period" options={PERIODS} value={kind} onChange={setKind} />
        <Segmented label="Format" options={FORMATS} value={format} onChange={setFormat} />
      </div>

      {q ? (
        ranked.length || others.length ? (
          <>
            {ranked.length ? (
              <>
                <p className="mb-2 text-[13px] text-dim">
                  {ranked.length.toLocaleString()} {ranked.length === 1 ? 'creator' : 'creators'} matching “{query.trim()}” · {range.label}
                </p>
                <ol className="divide-y divide-line">{ranked.map(row)}</ol>
              </>
            ) : null}
            {others.length ? (
              <Section title={ranked.length ? 'Also matching, not watched in this view' : `Matching “${query.trim()}”, not watched in this view`} className={ranked.length ? 'mt-12' : ''}>
                <ul className="divide-y divide-line">
                  {others.map((ch) => (
                    <li key={ch.channelId}>
                      <a href={href('creators', ch.channelId)} className="group flex items-center gap-4 py-3">
                        <Avatar src={ch.avatar} name={ch.channelName} size={36} />
                        <span className="min-w-0 flex-1 truncate text-[15px] group-hover:underline">{ch.channelName}</span>
                        <span className="text-[12px] text-dim">
                          {[ch.handle, db.subscriptions[ch.channelId]?.active ? 'Subscribed' : null, ch.videosWatched ? `${ch.videosWatched.toLocaleString()} videos all time` : null].filter(Boolean).join(' · ')}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : (
          <Empty title={`No creators matching “${query.trim()}”`}>TubeStat only knows creators you’ve watched or subscribed to. Try part of their name or @handle.</Empty>
        )
      ) : !first ? (
        <Empty title={format === 'all' ? 'No creators in this period' : `No ${format === 'shorts' ? 'Shorts' : 'long-form videos'} in this period`}>Creators appear here as soon as you watch something.</Empty>
      ) : (
        <>
          <a href={href('creators', first.channelId)} className="enter group mb-10 flex items-center gap-6 border-b border-line pb-10">
            <span className="tnum self-start text-[15px] text-faint">1</span>
            <Avatar src={first.avatar} name={first.channelName} size={112} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <p className="display truncate text-[34px] leading-none md:text-[45px] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-8">{first.channelName}</p>
              </div>
              <p className="tnum mt-3 text-[18px]">
                {metricText(first, metric)} <span className="text-dim">and {second(first)}</span>
              </p>
              <OgLine channelId={first.channelId} db={db} />
            </div>
          </a>
          <ol className="divide-y divide-line">{rest.map((c, i) => row({ c, rank: i + 2 }, i))}</ol>
        </>
      )}
    </>
  );
}


function OgLine({ channelId, db }: { channelId: string; db: ReturnType<typeof useData>['db'] }) {
  const og = computeOg(db.channels[channelId], db.subscriptions[channelId]);
  if (!og) return null;
  return (
    <p className={cx('mt-3 flex items-center gap-2 text-[13px] text-dim')}>
      <OgBadge tier={og.tier} size="sm" />
      {og.audienceAfterYou != null ? `${og.estimate ? 'About ' : ''}${formatAudienceShare(og.audienceAfterYou)} of their audience arrived after you` : 'Subscribed early in the channel’s life'}
    </p>
  );
}
