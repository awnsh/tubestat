import { useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href } from '../hooks/useRoute';
import { elapsedComparable, previousRange, rangeFor, type PeriodKind } from '../analytics/periods';
import { generateInsights } from '../analytics/insights';
import { formatDate, formatDuration, formatHour } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Change, Duration, Scrubber, Section, Segmented, Thumb, Button, Provenance } from '../components/ui';
import { BarChart, type BarDatum } from '../components/charts';

const PERIODS: Array<{ id: PeriodKind; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

const VS: Record<PeriodKind, string> = { day: 'vs yesterday', week: 'vs last week', month: 'vs last month', year: 'vs last year', all: '' };

export function Overview({ welcome }: { welcome?: boolean }) {
  const { analytics: a, setSample } = useData();
  const [kind, setKind] = useState<PeriodKind>('week');
  const now = Date.now();
  const range = useMemo(() => rangeFor(kind, now, a.firstDataAt ?? now), [kind, a]);
  const s = useMemo(() => a.summary(range), [a, range]);
  const prev = previousRange(range);
  const prevSummary = prev ? a.summary(elapsedComparable(range, prev, now)) : null;
  const change = prevSummary && prevSummary.watchSeconds >= 1800 ? s.watchSeconds / prevSummary.watchSeconds - 1 : null;
  const top = a.topCreators(range, 'time', 1)[0];
  const cats = a.categoryShares(range);
  const longest = a.longestSession(range);
  const insights = useMemo(() => generateInsights(a), [a]);
  const streaks = a.streaks();
  const recent = a.watches.slice(-8).reverse();

  const chartData: BarDatum[] = useMemo(() => {
    if (kind === 'day') {
      const hours = a.hourly(range);
      return hours.map((v, h) => ({ key: String(h), label: `${formatHour(h)}–${formatHour(h + 1)}`, tick: h % 6 === 0 ? formatHour(h) : undefined, value: v, current: new Date().getHours() === h }));
    }
    if (kind === 'year' || kind === 'all') {
      return a.monthly(range).map((m, i, arr) => ({
        key: m.key,
        label: new Date(m.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        tick: arr.length <= 12 || i % Math.ceil(arr.length / 8) === 0 ? new Date(m.start).toLocaleDateString(undefined, { month: 'short' }) : undefined,
        value: m.seconds,
        current: i === arr.length - 1,
      }));
    }
    const today = new Date().toDateString();
    return a.daily(range).map((d, i, arr) => ({
      key: String(d.day),
      label: new Date(d.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      tick: kind === 'week' ? new Date(d.day).toLocaleDateString(undefined, { weekday: 'short' }) : i % 7 === 0 || i === arr.length - 1 ? String(new Date(d.day).getDate()) : undefined,
      value: d.seconds,
      current: new Date(d.day).toDateString() === today,
    }));
  }, [a, range, kind]);

  if (!a.hasData) {
    return (
      <>
        <PageTitle title="Your YouTube" sub={welcome ? 'TubeStat is installed and recording.' : undefined} />
        <div className="max-w-xl">
          <p className="display text-[34px] leading-tight">Watch something on YouTube. It’ll be here a few seconds later.</p>
          <p className="mt-5 text-[15px] leading-relaxed text-dim">
            TubeStat records what you watch, for how long, and who made it, on this device only. The longer it runs, the more there is to see: your top creators, how your taste changes, and how early you found the channels you love.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" className="rounded-lg bg-paper px-4 py-2 text-[14px] font-medium text-ink hover:bg-white">
              Open YouTube
            </a>
            <Button onClick={() => setSample(true)}>Preview with sample data</Button>
          </div>
          <div className="mt-14 space-y-6 border-t border-line pt-6 text-[14px] leading-relaxed">
            <div>
              <p className="text-paper">Bring your past with you</p>
              <p className="mt-1 text-dim">
                Import your YouTube watch history from Google Takeout to fill in the years before you installed. <a className="text-paper underline underline-offset-4" href={href('profile')}>Import history</a>
              </p>
            </div>
            <div>
              <p className="text-paper">Find out how early you were</p>
              <p className="mt-1 text-dim">
                Visit <a className="text-paper underline underline-offset-4" href="https://www.youtube.com/feed/channels" target="_blank" rel="noreferrer">your subscriptions page</a> once so TubeStat can start following your creators’ growth.
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }


  return (
    <>
      <PageTitle
        title="Your YouTube"
        sub={range.kind === 'all' && a.firstDataAt ? `Since ${formatDate(a.firstDataAt, 'month')}` : range.label}
        aside={<Segmented label="Time period" options={PERIODS} value={kind} onChange={setKind} />}
      />

      {/* Headline numbers */}
      <div className="enter grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Duration seconds={s.watchSeconds} className="hero-num block text-[76px] md:text-[96px]" />
          <p className="mt-3 text-[14px] text-dim">watched</p>
        </div>
        <Figure value={s.videos.toLocaleString()} label="videos" />
        <Figure value={s.creators.toLocaleString()} label="creators" />
        {kind !== 'all' ? <Figure value={<Change value={change} />} label={VS[kind]} /> : <Figure value={streaks.longest.toLocaleString()} label="day longest streak" />}
      </div>
      {s.unknownTimeVideos ? <Provenance>{s.unknownTimeVideos.toLocaleString()} imported videos in this period have no recorded watch time, so they count as videos but not hours.</Provenance> : null}

      <div className="mt-12">
        <BarChart data={chartData} format={(v) => formatDuration(v)} ariaLabel={`Watch time, ${range.label}`} height={120} />
      </div>

      <div className="mt-16 grid gap-x-14 gap-y-14 md:grid-cols-2">
        <Section title="Your top creator" aside={<a href={href('creators')} className="hover:text-paper">All creators</a>}>
          {top ? (
            <a href={href('creators', top.channelId)} className="group flex items-center gap-5">
              <Avatar src={top.avatar} name={top.channelName} size={88} />
              <div className="min-w-0">
                <p className="display truncate text-[40px] leading-[1.05] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-8">{top.channelName}</p>
                <p className="tnum mt-2 text-[14px] text-dim">
                  {formatDuration(top.watchSeconds)} watched, {top.videos} {top.videos === 1 ? 'video' : 'videos'}
                </p>
              </div>
            </a>
          ) : (
            <p className="text-[14px] text-dim">Nothing watched in this period yet.</p>
          )}
        </Section>

        <Section title="Your top categories" aside={cats.byVideos ? 'by videos' : 'by watch time'}>
          {cats.items.length ? (
            <ul className="space-y-4">
              {cats.items.slice(0, 4).map((c, i) => (
                <li key={c.category}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[15px]">
                    <span>{c.category}</span>
                    <span className="tnum text-dim">{Math.round(c.share * 100)}%</span>
                  </div>
                  <Scrubber value={c.share} max={cats.items[0].share} head={i === 0} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-dim">Nothing watched in this period yet.</p>
          )}
        </Section>

        <Section title="Your longest session">
          {longest ? (
            <>
              <Duration seconds={longest.watchSeconds} className="hero-num block text-[56px]" />
              <p className="mt-3 text-[14px] text-dim">
                {formatDate(longest.start, 'weekday')}, {longest.videos} videos
              </p>
            </>
          ) : (
            <p className="text-[14px] text-dim">Sessions appear once TubeStat has tracked some viewing.</p>
          )}
        </Section>

        <Section title="Worth knowing" aside={insights.length > 1 ? <a href={href('insights')} className="hover:text-paper">{insights.length} insights</a> : undefined}>
          {insights[0] ? (
            <blockquote className="display text-[30px] leading-[1.15]">{insights[0].text}</blockquote>
          ) : (
            <p className="text-[14px] leading-relaxed text-dim">Insights show up once there’s enough history to say something true. Usually a week or two of normal watching.</p>
          )}
          <p className="mt-5 text-[14px] text-dim">
            {streaks.current > 1 ? <>You’re on a <span className="text-paper">{streaks.current}-day</span> watching streak.</> : null}
            {streaks.longest > 1 ? <> Your longest is {streaks.longest} days.</> : null}
          </p>
        </Section>
      </div>

      <Section title="Recently watched" className="mt-16" aside={<a href={href('history')} className="hover:text-paper">History</a>}>
        <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
          {recent.map((w) => (
            <li key={w.id} className="min-w-0">
              <a href={`https://www.youtube.com/watch?v=${w.videoId}`} target="_blank" rel="noreferrer" className="group block">
                <div className="relative">
                  <Thumb src={w.thumbnail} />
                  {w.percentageWatched != null ? <Scrubber value={w.percentageWatched} max={100} animate={false} className="absolute inset-x-0 bottom-0 rounded-none" /> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-snug group-hover:underline">{w.title || 'Untitled video'}</p>
                <p className="mt-1 truncate text-[12px] text-dim">{w.channelName}</p>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="self-end">
      <p className="hero-num text-[40px] md:text-[48px]">{value}</p>
      <p className="mt-3 text-[14px] text-dim">{label}</p>
    </div>
  );
}
