import { useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href, navigate } from '../hooks/useRoute';
import { monthsByYear, periodDetail } from '../analytics/history';
import { monthKey, monthRange, yearRange, type Range } from '../analytics/periods';
import { formatDate, formatDuration, monthName } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Button, Duration, Empty, Provenance, Scrubber, Section, Segmented, Thumb, cx } from '../components/ui';
import { Wrapped } from '../components/Wrapped';
import { ShareDialog } from '../components/ShareDialog';

export function History({ sub }: { sub?: string }) {
  if (sub && /^\d{4}-\d{2}$/.test(sub)) return <PeriodPage range={monthRange(sub)} />;
  if (sub && /^\d{4}$/.test(sub)) return <PeriodPage range={yearRange(Number(sub))} />;
  const tab = sub === 'time-machine' ? 'machine' : 'timeline';
  return (
    <>
      <PageTitle
        title="History"
        sub="How your YouTube has changed, month by month."
        aside={
          <Segmented
            label="View"
            options={[
              { id: 'timeline', label: 'Timeline' },
              { id: 'machine', label: 'Time Machine' },
            ]}
            value={tab}
            onChange={(v) => navigate('history', ...(v === 'machine' ? ['time-machine'] : []))}
          />
        }
      />
      {tab === 'timeline' ? <Timeline /> : <TimeMachine />}
    </>
  );
}

function Timeline() {
  const { analytics: a } = useData();
  const years = useMemo(() => monthsByYear(a), [a]);
  if (!years.length) return <Empty title="Your history starts with your first video">Each month you use YouTube adds a row here.</Empty>;
  const max = Math.max(...years.flatMap((y) => y.months.map((m) => m.summary.watchSeconds)), 1);
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-16">
      {years.map((y) => (
        <section key={y.year}>
          <div className="mb-4 flex items-baseline justify-between border-b border-line pb-4">
            <a href={href('history', String(y.year))} className="display text-[39px] leading-none hover:underline hover:decoration-1 hover:underline-offset-8">{y.year}</a>
            <div className="text-right text-[14px] text-dim">
              <span className="tnum text-paper">{formatDuration(y.summary.watchSeconds)}</span> across {y.summary.videos.toLocaleString()} videos
              {y.year < thisYear || new Date().getMonth() === 11 ? (
                <a href={href('history', String(y.year))} className="ml-4 text-paper underline-offset-4 hover:underline">{y.year} Wrapped</a>
              ) : null}
            </div>
          </div>
          <ol>
            {y.months.map((m) => (
              <li key={m.key}>
                <a href={href('history', m.key)} className="group grid grid-cols-[120px_1fr_auto] items-center gap-6 py-3 md:grid-cols-[160px_1fr_120px_110px]">
                  <span className="display text-[20px] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{monthName(m.range.start ? new Date(m.range.start).getMonth() : 0)}</span>
                  <Scrubber value={m.summary.watchSeconds || m.summary.videos} max={m.summary.watchSeconds ? max : Math.max(...y.months.map((x) => x.summary.videos))} tone={m.summary.watchSeconds ? 'play' : 'buffer'} animate={false} />
                  <span className="tnum text-right text-[15px]">{m.summary.watchSeconds ? formatDuration(m.summary.watchSeconds) : '—'}</span>
                  <span className="tnum hidden text-right text-[13px] text-dim md:block">{m.summary.videos.toLocaleString()} videos</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <Provenance>Grey bars are imported months where only video counts are known.</Provenance>
    </div>
  );
}

function PeriodPage({ range }: { range: Range }) {
  const { analytics: a } = useData();
  const d = useMemo(() => periodDetail(a, range), [a, range]);
  const [wrapped, setWrapped] = useState(false);
  const [sharing, setSharing] = useState(false);
  const isYear = range.kind === 'year';
  const short = isYear ? range.label : monthName(new Date(range.start).getMonth());

  return (
    <>
      <a href={href('history')} className="text-[13px] text-dim hover:text-paper">History</a>
      <header className="mt-6 mb-12 flex flex-wrap items-end justify-between gap-6">
        <h1 className="display text-[39px] leading-none md:text-[62px]">{range.label}</h1>
        {d.summary.videos ? (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setWrapped(true)}>Play your {short}</Button>
            <Button onClick={() => setSharing(true)}>Share</Button>
          </div>
        ) : null}
      </header>

      {!d.summary.videos ? (
        <Empty title={`Nothing recorded in ${range.label}`} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <Duration seconds={d.summary.watchSeconds} className="hero-num block text-[51px]" />
              <p className="mt-2 text-[14px] text-dim">watched</p>
            </div>
            <Stat value={d.summary.videos.toLocaleString()} label="videos" />
            <Stat value={d.summary.creators.toLocaleString()} label="creators" />
            <Stat value={d.summary.activeDays.toLocaleString()} label="days you watched" />
          </div>
          {d.summary.unknownTimeVideos ? <Provenance>{d.summary.unknownTimeVideos.toLocaleString()} imported videos have no watch time and aren’t included in the hours.</Provenance> : null}

          <div className="mt-14 grid gap-14 md:grid-cols-2">
            <Section title="Top creators">
              <ol className="space-y-4">
                {d.topCreators.map((c, i) => (
                  <li key={c.channelId}>
                    <a href={href('creators', c.channelId)} className="group flex items-center gap-4">
                      <span className="tnum w-4 text-[13px] text-faint">{i + 1}</span>
                      <Avatar src={c.avatar} name={c.channelName} size={i === 0 ? 48 : 36} />
                      <span className={cx('min-w-0 flex-1 truncate group-hover:underline', i === 0 ? 'display text-[20px]' : 'text-[15px]')}>{c.channelName}</span>
                      <span className="tnum text-[13px] text-dim">{c.watchSeconds ? formatDuration(c.watchSeconds) : `${c.videos} videos`}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="Top categories" aside={d.categories.byVideos ? 'by videos' : 'by watch time'}>
              <ul className="space-y-4">
                {d.categories.items.slice(0, 5).map((c, i) => (
                  <li key={c.category}>
                    <div className="mb-1.5 flex justify-between text-[15px]">
                      <span>{c.category}</span>
                      <span className="tnum text-dim">{Math.round(c.share * 100)}%</span>
                    </div>
                    <Scrubber value={c.share} max={d.categories.items[0].share} head={i === 0} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Longest session">
              {d.longestSession ? (
                <>
                  <Duration seconds={d.longestSession.watchSeconds} className="hero-num block text-[38px]" />
                  <p className="mt-2 text-[14px] text-dim">{formatDate(d.longestSession.start, 'weekday')}, {d.longestSession.videos} videos</p>
                </>
              ) : (
                <p className="text-[14px] text-dim">No tracked sessions in this period.</p>
              )}
            </Section>
            <Section title="Most watched video">
              {d.topVideos[0] ? (
                <a href={`https://www.youtube.com/watch?v=${d.topVideos[0].videoId}`} target="_blank" rel="noreferrer" className="group flex gap-4">
                  <Thumb src={d.topVideos[0].thumbnail} className="w-40 shrink-0" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[15px] group-hover:underline">{d.topVideos[0].title || 'Untitled video'}</p>
                    <p className="mt-1 text-[13px] text-dim">{d.topVideos[0].channelName}</p>
                    <p className="tnum mt-1 text-[13px] text-dim">
                      {d.topVideos[0].watchSeconds ? formatDuration(d.topVideos[0].watchSeconds) : ''}
                      {d.topVideos[0].views > 1 ? ` over ${d.topVideos[0].views} viewings` : ''}
                    </p>
                  </div>
                </a>
              ) : null}
            </Section>
          </div>

          {d.newCreators.length ? (
            <Section title="New creators you found" className="mt-14" aside={`${d.newCreators.length}`}>
              <ul className="flex flex-wrap gap-x-6 gap-y-4">
                {d.newCreators.slice(0, 18).map((c) => (
                  <li key={c.channelId}>
                    <a href={href('creators', c.channelId)} className="flex items-center gap-2.5 text-[14px] hover:underline">
                      <Avatar src={c.avatar} name={c.channelName} size={28} />
                      {c.channelName}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}

      {wrapped ? <Wrapped range={range} onClose={() => setWrapped(false)} /> : null}
      {sharing ? (
        <ShareDialog
          filename={`tubestat-${range.label.toLowerCase().replace(/\s+/g, '-')}.png`}
          onClose={() => setSharing(false)}
          spec={{
            kind: 'period',
            eyebrow: 'My YouTube',
            title: range.label,
            watchSeconds: d.summary.watchSeconds,
            videos: d.summary.videos,
            topCreator: d.topCreators[0] ? { name: d.topCreators[0].channelName, avatar: d.topCreators[0].avatar } : null,
            topCategory: d.categories.items[0]?.category ?? null,
            longestSessionSeconds: d.longestSession?.watchSeconds ?? null,
          }}
        />
      ) : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="self-end">
      <p className="hero-num text-[32px]">{value}</p>
      <p className="mt-2 text-[14px] text-dim">{label}</p>
    </div>
  );
}

/** Pick any past month and see a snapshot of your YouTube at that point. */
function TimeMachine() {
  const { analytics: a } = useData();
  const years = useMemo(() => monthsByYear(a), [a]);
  const [year, setYear] = useState(() => years[years.length - 1]?.year ?? new Date().getFullYear());
  const yearData = years.find((y) => y.year === year);
  const months = yearData ? [...yearData.months].reverse() : [];
  const [monthK, setMonthK] = useState<string | null>(null);
  const key = monthK && months.some((m) => m.key === monthK) ? monthK : months[months.length - 1]?.key ?? monthKey(Date.now());
  const d = useMemo(() => periodDetail(a, monthRange(key)), [a, key]);

  if (!years.length) return <Empty title="The Time Machine needs history">Come back after a few weeks of watching, or import your Takeout history in Profile to travel further back.</Empty>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[...years].reverse().map((y) => (
          <button key={y.year} onClick={() => { setYear(y.year); setMonthK(null); }} className={cx('display rounded-md px-3 py-1 text-[20px] leading-tight transition-colors', y.year === year ? 'text-paper' : 'text-faint hover:text-dim')}>
            {y.year}
          </button>
        ))}
      </div>
      <div className="scrollbar-none mb-12 flex gap-1 overflow-x-auto border-b border-line">
        {Array.from({ length: 12 }, (_, m) => {
          const k = `${year}-${String(m + 1).padStart(2, '0')}`;
          const has = months.some((x) => x.key === k);
          return (
            <button key={k} disabled={!has} onClick={() => setMonthK(k)} className={cx('relative whitespace-nowrap px-3 pb-3 pt-1 text-[14px]', k === key ? 'text-paper' : has ? 'text-dim hover:text-paper' : 'text-faint/50')}>
              {monthName(m, true)}
              {k === key ? <span className="absolute inset-x-2 -bottom-px h-[2px] bg-play" /> : null}
            </button>
          );
        })}
      </div>

      <div key={key} className="enter grid gap-12 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="display text-[34px] leading-none">{monthRange(key).label}</p>
          <p className="mt-8 text-[14px] text-dim">You watched</p>
          {d.summary.watchSeconds ? <Duration seconds={d.summary.watchSeconds} className="hero-num mt-2 block text-[58px]" /> : <p className="hero-num mt-2 text-[58px]">{d.summary.videos}</p>}
          <p className="mt-3 text-[18px]">{d.summary.watchSeconds ? `${d.summary.videos.toLocaleString()} videos` : 'videos (watch time not recorded)'}</p>

          <dl className="mt-10 grid grid-cols-2 gap-8">
            <div>
              <dt className="text-[13px] text-dim">Top creator</dt>
              <dd className="mt-2 flex items-center gap-3">
                {d.topCreators[0] ? (
                  <>
                    <Avatar src={d.topCreators[0].avatar} name={d.topCreators[0].channelName} size={36} />
                    <a href={href('creators', d.topCreators[0].channelId)} className="truncate text-[18px] hover:underline">{d.topCreators[0].channelName}</a>
                  </>
                ) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-dim">Top category</dt>
              <dd className="mt-2 text-[18px]">{d.categories.items[0]?.category ?? '—'}</dd>
            </div>
          </dl>
          <a href={href('history', key)} className="mt-10 inline-block text-[14px] text-paper underline-offset-4 hover:underline">See all of {monthRange(key).label}</a>
        </div>
        <div>
          <p className="mb-4 text-[13px] text-dim">What you were watching</p>
          <ul className="grid grid-cols-2 gap-4">
            {d.topVideos.slice(0, 4).map((v) => (
              <li key={v.videoId}>
                <Thumb src={v.thumbnail} />
                <p className="mt-2 line-clamp-2 text-[13px]">{v.title || 'Untitled video'}</p>
                <p className="mt-0.5 truncate text-[12px] text-dim">{v.channelName}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
