import { useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href } from '../hooks/useRoute';
import { rangeFor, type PeriodKind } from '../analytics/periods';
import type { CreatorMetric, CreatorStat } from '../analytics/engine';
import { computeOg } from '../analytics/og';
import { formatAudienceShare, formatDuration } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Empty, OgBadge, Scrubber, Segmented, cx } from '../components/ui';

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

export function Creators() {
  const { analytics: a, db } = useData();
  const [metric, setMetric] = useState<CreatorMetric>('time');
  const [kind, setKind] = useState<PeriodKind>('all');
  const range = useMemo(() => rangeFor(kind, Date.now(), a.firstDataAt ?? Date.now()), [kind, a]);
  const list = useMemo(() => a.topCreators(range, metric, 100), [a, range, metric]);
  const [first, ...rest] = list;
  const max = first ? metricValue(first, metric) : 1;
  const second = (c: CreatorStat) => (metric === 'time' ? `${c.videos.toLocaleString()} videos` : formatDuration(c.watchSeconds));

  return (
    <>
      <PageTitle title="Creators" sub={`Who you spend your time with. ${range.label}.`} />
      <div className="mb-10 flex flex-wrap gap-3">
        <Segmented label="Rank by" options={METRICS} value={metric} onChange={setMetric} />
        <Segmented label="Time period" options={PERIODS} value={kind} onChange={setKind} />
      </div>

      {!first ? (
        <Empty title="No creators in this period">Creators appear here as soon as you watch something.</Empty>
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
          <ol className="divide-y divide-line">
            {rest.map((c, i) => {
              const og = computeOg(db.channels[c.channelId], db.subscriptions[c.channelId]);
              return (
                <li key={c.channelId}>
                  <a href={href('creators', c.channelId)} className="group grid grid-cols-[28px_40px_1fr_auto] items-center gap-4 py-3.5">
                    <span className="tnum text-[13px] text-faint">{i + 2}</span>
                    <Avatar src={c.avatar} name={c.channelName} size={40} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] group-hover:underline">{c.channelName}</span>
                        {og ? <OgBadge tier={og.tier} size="sm" /> : null}
                      </div>
                      <Scrubber value={metricValue(c, metric)} max={max} className="mt-2 max-w-[420px]" animate={i < 12} />
                    </div>
                    <div className="tnum text-right">
                      <p className="text-[14px]">{metricText(c, metric)}</p>
                      <p className="text-[12px] text-dim">{second(c)}</p>
                    </div>
                  </a>
                </li>
              );
            })}
          </ol>
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
