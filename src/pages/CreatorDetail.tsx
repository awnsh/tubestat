import { useMemo, useState } from 'react';
import { useData } from '../hooks/useDatabase';
import { href } from '../hooks/useRoute';
import { computeOg, TIER_DESCRIPTIONS, trackedGrowth } from '../analytics/og';
import { formatAudienceShare, formatCompact, formatDate, formatDuration, formatSpan } from '../lib/format';
import { Avatar, Button, Empty, OgBadge, Provenance, Section, Thumb } from '../components/ui';
import { BarChart, GrowthLine } from '../components/charts';
import { ShareDialog } from '../components/ShareDialog';

const SOURCE_TEXT = {
  observed: 'TubeStat saw you subscribe.',
  api: 'Subscription date from your YouTube account (YouTube Data API).',
} as Record<string, string>;

export function CreatorDetail({ channelId }: { channelId: string }) {
  const { analytics: a, db } = useData();
  const [sharing, setSharing] = useState(false);
  const ch = db.channels[channelId];
  const sub = db.subscriptions[channelId];
  const watches = useMemo(() => a.creatorWatches(channelId), [a, channelId]);
  const og = computeOg(ch, sub);
  const growth = ch ? trackedGrowth(ch) : null;

  const totals = useMemo(() => {
    const secs = watches.reduce((s, w) => s + (w.watchedSeconds ?? 0), 0);
    const sessions = a.sessions.filter((s) => s.channelIds.includes(channelId)).length;
    const videos = new Map<string, { title: string; thumb: string; secs: number; views: number; videoId: string }>();
    for (const w of watches) {
      const v = videos.get(w.videoId) ?? { title: w.title, thumb: w.thumbnail, secs: 0, views: 0, videoId: w.videoId };
      v.secs += w.watchedSeconds ?? 0;
      v.views++;
      videos.set(w.videoId, v);
    }
    const months = new Map<string, number>();
    for (const w of watches) {
      const d = new Date(w.timestamp);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.set(k, (months.get(k) ?? 0) + (w.watchedSeconds ?? 0));
    }
    return { secs, sessions, videos: [...videos.values()].sort((x, y) => y.secs - x.secs || y.views - x.views).slice(0, 6), months };
  }, [watches, a, channelId]);

  if (!ch && !watches.length) {
    return <Empty title="TubeStat doesn’t know this creator yet" />;
  }
  const name = ch?.channelName || watches[0]?.channelName || 'Unknown creator';
  const firstWatch = watches[0]?.timestamp ?? null;

  // Monthly bars across the whole relationship.
  const monthBars = (() => {
    if (!firstWatch) return [];
    const out = [];
    const d = new Date(firstWatch);
    const cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date();
    while (cursor <= end) {
      const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key: k, label: cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), value: totals.months.get(k) ?? 0, tick: cursor.getMonth() === 0 || out.length === 0 ? String(cursor.getFullYear()) : undefined });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  })();

  return (
    <>
      <a href={href('creators')} className="text-[13px] text-dim hover:text-paper">Creators</a>
      <header className="enter mt-6 flex flex-wrap items-center gap-7">
        <Avatar src={ch?.avatar} name={name} size={128} />
        <div className="min-w-0">
          <h1 className="display text-[36px] leading-none md:text-[53px]">{name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-dim">
            {og ? <OgBadge tier={og.tier} size="lg" /> : null}
            {ch?.handle ? <span>{ch.handle}</span> : null}
            {ch?.subscriberCount != null ? <span className="tnum">{formatCompact(ch.subscriberCount)} subscribers</span> : null}
            <a href={ch?.url ?? `https://www.youtube.com/channel/${channelId}`} target="_blank" rel="noreferrer" className="text-paper underline-offset-4 hover:underline">
              Open on YouTube
            </a>
          </div>
        </div>
      </header>

      <Section title="Your history" className="mt-14">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
          <Fact label="Subscribed">
            {sub?.active ? (sub.subscriptionDate ? formatDate(sub.subscriptionDate, 'month') : 'Yes') : 'Not subscribed'}
          </Fact>
          <Fact label="Subscribed for">{sub?.active && sub.subscriptionDate ? formatSpan(Date.now() - sub.subscriptionDate) : '—'}</Fact>
          <Fact label="You watched">
            {formatDuration(totals.secs)}
          </Fact>
          <Fact label="Videos">{watches.length.toLocaleString()}</Fact>
          <Fact label="First watched">{firstWatch ? formatDate(firstWatch, 'month') : '—'}</Fact>
          <Fact label="Sessions">{totals.sessions.toLocaleString()}</Fact>
        </dl>
        {sub?.active && !sub.subscriptionDate ? (
          <Provenance>
            YouTube doesn’t show when you subscribed. TubeStat has seen you subscribed since {formatDate(sub.firstObserved)}. Connect your YouTube account in Profile to get the exact date.
          </Provenance>
        ) : sub?.subscriptionDateSource ? (
          <Provenance>{SOURCE_TEXT[sub.subscriptionDateSource] ?? ''}</Provenance>
        ) : null}
        {watches.some((w) => w.source === 'takeout') ? <Provenance>Includes viewings imported from Google Takeout, which count as videos but have no watch time.</Provenance> : null}
      </Section>

      <Section title="Their growth" className="mt-14">
        {og?.basis === 'audience' ? (
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
            <Fact label="When you subscribed" big>{formatCompact(og.subscribersThen)}</Fact>
            <Fact label="Now" big>{formatCompact(og.subscribersNow)}</Fact>
            <Fact label="Growth" big>+{formatCompact((og.subscribersNow ?? 0) - (og.subscribersThen ?? 0))}</Fact>
          </div>
        ) : ch?.subscriberCount != null ? (
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
            <Fact label="Subscribers now" big>{formatCompact(ch.subscriberCount)}</Fact>
            {growth ? <Fact label={`Since ${formatDate(growth.since, 'short')}`} big>{growth.delta >= 0 ? '+' : '−'}{formatCompact(Math.abs(growth.delta))}</Fact> : null}
          </div>
        ) : (
          <p className="text-[14px] text-dim">TubeStat records subscriber counts whenever you open one of this creator’s videos.</p>
        )}
        {ch && ch.subscriberHistory.length >= 2 ? (
          <div className="mt-8">
            <GrowthLine points={ch.subscriberHistory.map((h) => ({ t: h.t, v: h.count }))} format={(v) => `${formatCompact(v)} subscribers`} />
          </div>
        ) : null}
        {ch?.subscriberHistory.length ? (
          <Provenance>
            Tracking since {formatDate(ch.subscriberHistory[0].t, 'month')}. Counts come from YouTube, which rounds them (for example 1.23M). Earlier history isn’t available from YouTube, so it isn’t shown.
          </Provenance>
        ) : null}
      </Section>

      <Section title="How early you were" className="mt-14" aside={og ? <Button onClick={() => setSharing(true)}>Share</Button> : undefined}>
        {og ? (
          <div className="max-w-2xl">
            <p className="statement text-[28px]">
              {og.basis === 'audience'
                ? `You subscribed before ${og.estimate ? 'about ' : ''}${formatAudienceShare(og.audienceAfterYou ?? 0)} of their current audience.`
                : `You subscribed ${Math.round((og.lifetimeShare ?? 0) * 100)}% of the way into the channel’s life so far.`}
            </p>
            <p className="mt-4 text-[14px] leading-relaxed text-dim">
              <span className="text-paper">{og.tier}</span>: {TIER_DESCRIPTIONS[og.tier]}{' '}
              {og.basis === 'timing'
                ? 'This is an estimate from dates alone. YouTube doesn’t publish past subscriber counts, so TubeStat can’t say how big the audience was then.'
                : og.estimate
                  ? 'The subscriber count on your subscription date is interpolated from TubeStat’s own snapshots.'
                  : 'Based on the subscriber count TubeStat recorded when you subscribed.'}
            </p>
          </div>
        ) : (
          <p className="max-w-2xl text-[14px] leading-relaxed text-dim">
            {sub?.active
              ? 'OG status needs your subscription date. Connect your YouTube account in Profile, or it will be measured exactly for creators you subscribe to from now on.'
              : 'Subscribe to this creator and TubeStat will record their size at that moment. That becomes your OG status as they grow.'}
          </p>
        )}
      </Section>

      {monthBars.length > 1 ? (
        <Section title="Your watch time by month" className="mt-14">
          <BarChart data={monthBars} format={(v) => formatDuration(v)} ariaLabel={`Monthly watch time for ${name}`} height={100} />
        </Section>
      ) : null}

      {totals.videos.length ? (
        <Section title="Most watched videos" className="mt-14">
          <ul className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-3">
            {totals.videos.map((v) => (
              <li key={v.videoId}>
                <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noreferrer" className="group block">
                  <Thumb src={v.thumb} />
                  <p className="mt-2 line-clamp-2 text-[13px] group-hover:underline">{v.title || 'Untitled video'}</p>
                  <p className="tnum mt-1 text-[12px] text-dim">
                    {v.secs ? formatDuration(v.secs) : 'Watch time unknown'}
                    {v.views > 1 ? `, ${v.views} views` : ''}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sharing && og ? (
        <ShareDialog
          filename={`tubestat-${name.toLowerCase().replace(/\W+/g, '-')}.png`}
          onClose={() => setSharing(false)}
          spec={{
            kind: 'early',
            creator: name,
            avatar: ch?.avatar ?? null,
            tier: og.tier,
            subscribedYear: formatDate(og.subscribedAt, 'year'),
            then: og.subscribersThen,
            now: og.subscribersNow,
            audienceAfter: og.audienceAfterYou,
            estimate: og.estimate,
          }}
        />
      ) : null}
    </>
  );
}

function Fact({ label, children, big }: { label: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-dim">{label}</dt>
      <dd className={big ? 'hero-num mt-3 text-[38px]' : 'tnum mt-2 text-[22px] font-medium tracking-tight'}>{children}</dd>
    </div>
  );
}
