import { useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href } from '../hooks/useRoute';
import { generateInsights } from '../analytics/insights';
import { compareCategories, defaultComparison } from '../analytics/history';
import { biggestWins, allOg } from '../analytics/wins';
import { milestones } from '../analytics/engine';
import { rangeFor } from '../analytics/periods';
import { formatCompact, formatDate, formatDuration, formatHour, formatSpan } from '../lib/format';
import { PageTitle } from '../components/Shell';
import { Avatar, Empty, OgBadge, Provenance, Scrubber, Section } from '../components/ui';
import { BarChart, CompareBars } from '../components/charts';
import type { OgTier } from '../analytics/og';

const TIER_ORDER: OgTier[] = ['DAY ONE', 'OG', 'EARLY', 'ESTABLISHED', 'RECENT'];
const WIN_COLORS = ['var(--color-bar-yellow)', 'var(--color-bar-cyan)', 'var(--color-bar-green)', 'var(--color-bar-magenta)', 'var(--color-bar-blue)', 'var(--color-bar-red)'];

export function Insights() {
  const { analytics: a, db } = useData();
  const insights = useMemo(() => generateInsights(a), [a]);
  const comparison = useMemo(() => {
    const p = defaultComparison(a);
    return p ? compareCategories(a, p.before, p.after) : null;
  }, [a]);
  const wins = useMemo(() => biggestWins(db, a), [db, a]);
  const ogs = useMemo(() => allOg(db).sort((x, y) => TIER_ORDER.indexOf(x.og.tier) - TIER_ORDER.indexOf(y.og.tier) || (y.og.audienceAfterYou ?? 0) - (x.og.audienceAfterYou ?? 0)), [db]);
  const [showAllOg, setShowAllOg] = useState(false);
  const all = rangeFor('all', Date.now(), a.firstDataAt ?? Date.now());
  const hours = useMemo(() => a.hourly(all), [a]);
  const streaks = a.streaks();
  const marks = useMemo(() => milestones(a), [a]);
  const s = useMemo(() => a.summary(all), [a]);
  const subsWithoutDates = Object.values(db.subscriptions).filter((x) => x.active && !x.subscriptionDate).length;

  return (
    <>
      <PageTitle title="Insights" sub="Patterns in your viewing, written from what TubeStat has recorded." />

      {insights.length ? (
        <ul className="enter space-y-8">
          {insights.map((i, k) => (
            <li key={i.id} className={k === 0 ? 'statement max-w-3xl text-[34px]' : 'statement max-w-3xl text-[24px] text-paper/85'}>
              {i.text}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Not enough history yet">Insights only appear when the data behind them is solid. A week or two of normal viewing usually does it.</Empty>
      )}

      <Section title="How you’ve changed" className="mt-20" aside={comparison ? `${comparison.before.label} vs ${comparison.after.label}` : undefined}>
        {comparison ? (
          <>
            {comparison.sentences.length ? (
              <ul className="mb-8 max-w-3xl space-y-2 text-[17px] leading-relaxed">
                {comparison.sentences.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="mb-8 text-[15px] text-dim">Your mix of categories has stayed about the same.</p>
            )}
            <CompareBars rows={comparison.rows.map((r) => ({ label: r.category, before: r.before, after: r.after }))} beforeLabel={comparison.before.label} afterLabel={comparison.after.label} />
            <Provenance>
              Shares of {comparison.byVideos ? 'videos watched' : 'watch time'}. Categories come from each video’s YouTube category, refined by title keywords.
            </Provenance>
          </>
        ) : (
          <p className="text-[14px] text-dim">Comparisons start once you have two months of history.</p>
        )}
      </Section>

      <Section title="Your biggest wins" className="mt-20">
        {wins.length ? (
          <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
            {wins.map((w, wi) => {
              const ch = db.channels[w.channelId];
              return (
                <a key={w.id} href={href('creators', w.channelId)} className="group flex gap-5">
                  <Avatar src={ch?.avatar} name={ch?.channelName ?? '?'} size={52} />
                  <div className="min-w-0">
                    <p className="text-[13px] text-dim">{w.title}</p>
                    <p className="hero-num mt-1 text-[32px]" style={{ color: WIN_COLORS[wi % WIN_COLORS.length] }}>{w.headline}</p>
                    <p className="mt-2 text-[14px] leading-relaxed text-paper/85 group-hover:underline">{w.detail}</p>
                    {w.estimate ? <p className="mt-1 text-[12px] text-faint">Estimate</p> : null}
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="max-w-2xl text-[14px] leading-relaxed text-dim">
            Wins come from your subscription history and creators’ growth. Visit your{' '}
            <a className="text-paper underline underline-offset-4" href="https://www.youtube.com/feed/channels" target="_blank" rel="noreferrer">subscriptions page</a> once, and connect your YouTube account in <a className="text-paper underline underline-offset-4" href={href('profile')}>Profile</a> for subscription dates.
          </p>
        )}
      </Section>

      <Section title="How early you were" className="mt-20" aside={ogs.length ? `${ogs.length} creators` : undefined}>
        {ogs.length ? (
          <>
            <ol className="divide-y divide-line">
              {(showAllOg ? ogs : ogs.slice(0, 8)).map((o) => (
                <li key={o.channelId}>
                  <a href={href('creators', o.channelId)} className="group grid grid-cols-[36px_1fr_auto] items-center gap-4 py-3">
                    <Avatar src={o.avatar} name={o.channelName} size={36} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] group-hover:underline">{o.channelName}</p>
                      <p className="tnum text-[12px] text-dim">
                        Subscribed {formatDate(o.og.subscribedAt, 'month')}
                        {o.og.basis === 'audience' ? `, at ${formatCompact(o.og.subscribersThen)} → ${formatCompact(o.og.subscribersNow)}` : ''}
                        {o.og.estimate ? ' (estimate)' : ''}
                      </p>
                    </div>
                    <OgBadge tier={o.og.tier} size="sm" />
                  </a>
                </li>
              ))}
            </ol>
            {ogs.length > 8 ? (
              <button onClick={() => setShowAllOg((v) => !v)} className="mt-4 text-[13px] text-dim hover:text-paper">
                {showAllOg ? 'Show fewer' : `Show all ${ogs.length}`}
              </button>
            ) : null}
          </>
        ) : null}
        {subsWithoutDates ? (
          <Provenance>
            {subsWithoutDates} of your subscriptions have no known subscription date, so they have no OG status yet. YouTube only shares these dates through your account; connect it in Profile.
          </Provenance>
        ) : !ogs.length ? (
          <p className="text-[14px] text-dim">No subscriptions recorded yet.</p>
        ) : null}
      </Section>

      <Section title="When you watch" className="mt-20" aside="all time, by hour of day">
        <BarChart
          data={hours.map((v, h) => ({ key: String(h), label: `${formatHour(h)}–${formatHour(h + 1)}`, tick: h % 3 === 0 ? formatHour(h) : undefined, value: v }))}
          format={(v) => formatDuration(v)}
          ariaLabel="Watch time by hour of day"
          height={110}
        />
      </Section>

      <div className="mt-20 grid gap-14 md:grid-cols-2">
        <Section title="Streaks">
          <dl className="grid grid-cols-2 gap-8">
            <div>
              <dt className="text-[13px] text-dim">Current watching streak</dt>
              <dd className="hero-num mt-2 text-[38px]">{streaks.current}<span className="ml-1 text-[16px] font-normal tracking-normal text-dim">days</span></dd>
            </div>
            <div>
              <dt className="text-[13px] text-dim">Longest</dt>
              <dd className="hero-num mt-2 text-[38px]">{streaks.longest}<span className="ml-1 text-[16px] font-normal tracking-normal text-dim">days</span></dd>
              {streaks.longestEnd ? <p className="mt-1 text-[12px] text-faint">ended {formatDate(streaks.longestEnd, 'short')}</p> : null}
            </div>
            <div className="col-span-2">
              <dt className="text-[13px] text-dim">Tracking</dt>
              <dd className="mt-2 text-[18px]">for {formatSpan(Date.now() - db.meta.installedAt)}, on {db.meta.activeDays.length} {db.meta.activeDays.length === 1 ? 'day' : 'days'} with YouTube</dd>
            </div>
          </dl>
        </Section>
        <Section title="Milestones">
          <ul className="space-y-5">
            {marks.map((m) => (
              <li key={m.id}>
                <div className="mb-1.5 flex justify-between text-[14px]">
                  <span className={m.reachedAt ? 'text-paper' : 'text-dim'}>{m.label}</span>
                  <span className="tnum text-[12px] text-dim">{m.reachedAt ? formatDate(m.reachedAt, 'short') : `${Math.round(m.progress * 100)}%`}</span>
                </div>
                <Scrubber value={m.progress} tone={m.reachedAt ? 'play' : 'buffer'} animate={false} />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Shorts and long-form" className="mt-20">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <p className="hero-num text-[32px]">{s.longform.toLocaleString()}</p>
            <p className="mt-2 text-[13px] text-dim">long-form videos</p>
          </div>
          <div>
            <p className="hero-num text-[32px]">{s.shorts.toLocaleString()}</p>
            <p className="mt-2 text-[13px] text-dim">Shorts</p>
          </div>
          <div>
            <p className="hero-num text-[32px]">{s.startedLong ? `${Math.round((s.completedLong / s.startedLong) * 100)}%` : '—'}</p>
            <p className="mt-2 text-[13px] text-dim">of long videos finished</p>
          </div>
          <div>
            <p className="hero-num text-[32px]">{s.longform ? formatDuration(a.watches.filter((w) => !w.isShort && w.watchedSeconds).reduce((x, w) => x + (w.watchedSeconds ?? 0), 0) / Math.max(1, a.watches.filter((w) => !w.isShort && w.watchedSeconds).length)) : '—'}</p>
            <p className="mt-2 text-[13px] text-dim">average time per long video</p>
          </div>
        </div>
        <Provenance>A video counts as finished when you’ve covered 90% of it. Skipping ahead doesn’t count.</Provenance>
      </Section>
    </>
  );
}
