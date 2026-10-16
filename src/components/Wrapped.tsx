import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildWrapped, type WrappedSlide } from '../analytics/wrapped';
import type { Range } from '../analytics/periods';
import { formatCompact, formatDate, formatDuration, formatSpan } from '../lib/format';
import { useData } from '../hooks/useDatabase';
import { Avatar, Duration, OgBadge, Scrubber, cx } from './ui';
import { ShareDialog } from './ShareDialog';

/** Story-style Wrapped for a month or year. Arrow keys, click, or tap to advance. */
export function Wrapped({ range, onClose }: { range: Range; onClose: () => void }) {
  const { analytics, db } = useData();
  const slides = useMemo(() => buildWrapped(analytics, db, range), [analytics, db, range]);
  const [i, setI] = useState(0);
  const [sharing, setSharing] = useState(false);
  const next = useCallback(() => setI((x) => Math.min(slides.length - 1, x + 1)), [slides.length]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sharing) return;
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose, sharing]);

  // Keep the page underneath from scrolling while Wrapped is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const slide = slides[i];
  const outro = slides.find((s): s is Extract<WrappedSlide, { kind: 'outro' }> => s.kind === 'outro');
  const session = slides.find((s): s is Extract<WrappedSlide, { kind: 'session' }> => s.kind === 'session');
  const topCreatorSlide = slides.find((s): s is Extract<WrappedSlide, { kind: 'creators' }> => s.kind === 'creators');

  return (
    <div role="dialog" aria-modal aria-label={`${range.label} Wrapped`} className="fixed inset-0 z-50 flex flex-col bg-ink">
      <div className="mx-auto flex w-full max-w-2xl gap-1.5 px-6 pt-6">
        {slides.map((_, k) => (
          <button key={k} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className="flex-1 py-2">
            <Scrubber value={k <= i ? 1 : 0} animate={k === i} />
          </button>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 pt-2 text-[13px] text-dim">
        <span>{range.label}</span>
        <button onClick={onClose} className="rounded px-2 py-1 hover:text-paper">Close</button>
      </div>

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 items-center px-6 pb-16">
        <button aria-label="Previous" onClick={prev} className="absolute inset-y-0 left-0 w-1/3" />
        <button aria-label="Next" onClick={next} className="absolute inset-y-0 right-0 w-2/3" />
        <div key={i} className="enter pointer-events-none relative w-full">
          <SlideView slide={slide} />
          {slide.kind === 'outro' ? (
            <div className="pointer-events-auto mt-10 flex gap-3">
              <button onClick={() => setSharing(true)} className="rounded-lg bg-paper px-5 py-2.5 text-[14px] font-medium text-ink hover:bg-white">
                Share your {range.kind === 'year' ? 'year' : 'month'}
              </button>
              <button onClick={() => setI(0)} className="rounded-lg border border-line-strong px-5 py-2.5 text-[14px] hover:bg-raise-2">
                Watch again
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {sharing && outro ? (
        <ShareDialog
          filename={`tubestat-${range.label.toLowerCase().replace(/\s+/g, '-')}.png`}
          onClose={() => setSharing(false)}
          spec={{
            kind: 'period',
            eyebrow: 'My YouTube',
            title: range.label,
            watchSeconds: outro.seconds,
            videos: outro.videos,
            topCreator: topCreatorSlide ? { name: topCreatorSlide.items[0].channelName, avatar: topCreatorSlide.items[0].avatar } : null,
            topCategory: outro.topCategory,
            longestSessionSeconds: session?.session.watchSeconds ?? null,
          }}
        />
      ) : null}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="mb-6 text-[15px] text-dim">{children}</p>;
}

function SlideView({ slide }: { slide: WrappedSlide }) {
  switch (slide.kind) {
    case 'intro':
      return (
        <div>
          <Kicker>TubeStat Wrapped</Kicker>
          <h1 className="display text-[clamp(39px,7.7vw,84px)]">{slide.title}</h1>
          <p className="mt-8 text-[15px] text-dim">Tap or press → to begin.</p>
        </div>
      );
    case 'total':
      return (
        <div>
          <Kicker>You spent</Kicker>
          <Duration seconds={slide.seconds} className="hero-num block text-[clamp(58px,12.8vw,134px)]" />
          <p className="mt-6 text-[22px] leading-snug text-paper">
            watching {slide.videos.toLocaleString()} videos from {slide.creators.toLocaleString()} creators, on {slide.days} different days.
          </p>
          {slide.unknownTimeVideos ? <p className="mt-3 text-[13px] text-faint">{slide.unknownTimeVideos.toLocaleString()} imported videos have no watch time and aren’t included in the total.</p> : null}
        </div>
      );
    case 'creators':
      return (
        <div>
          <Kicker>Your top creators</Kicker>
          <ol className="space-y-5">
            {slide.items.map((c, k) => (
              <li key={c.channelId} className="flex items-center gap-5">
                <span className="tnum w-6 text-[15px] text-faint">{k + 1}</span>
                <Avatar src={c.avatar} name={c.channelName} size={k === 0 ? 72 : 48} />
                <div className="min-w-0">
                  <p className={cx('display truncate', k === 0 ? 'text-[44px]' : 'text-[28px]')}>{c.channelName}</p>
                  <p className="tnum text-[14px] text-dim">{formatDuration(c.watchSeconds)} across {c.videos} videos</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'categories':
      return (
        <div>
          <Kicker>What you watched</Kicker>
          <div className="space-y-6">
            {slide.items.map((c, k) => (
              <div key={c.category}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className={cx('display', k === 0 ? 'text-[48px]' : 'text-[30px]')}>{c.category}</span>
                  <span className="tnum text-[18px] text-dim">{Math.round(c.share * 100)}%</span>
                </div>
                <Scrubber value={c.share} max={slide.items[0].share} head={k === 0} />
              </div>
            ))}
          </div>
          {slide.byVideos ? <p className="mt-6 text-[13px] text-faint">Shares by number of videos; this period has no measured watch time.</p> : null}
        </div>
      );
    case 'session':
      return (
        <div>
          <Kicker>Your longest session</Kicker>
          <Duration seconds={slide.session.watchSeconds} className="hero-num block text-[clamp(58px,12vw,120px)]" />
          <p className="mt-6 text-[22px]">{formatDate(slide.session.start, 'weekday')}, {slide.session.videos} videos in one sitting.</p>
        </div>
      );
    case 'video':
      return (
        <div>
          <Kicker>The video you spent the most time with</Kicker>
          {slide.video.thumbnail ? <img src={slide.video.thumbnail} alt="" className="mb-6 aspect-video w-full max-w-md rounded-lg object-cover" /> : null}
          <p className="statement text-[32px]">{slide.video.title || 'Untitled video'}</p>
          <p className="mt-3 text-[16px] text-dim">
            {slide.video.channelName} · {formatDuration(slide.video.watchSeconds)}
            {slide.video.views > 1 ? `, watched ${slide.video.views} times` : ''}
          </p>
        </div>
      );
    case 'growth': {
      const og = slide.creator.og;
      return (
        <div>
          <Kicker>You were early</Kicker>
          <div className="mb-6 flex items-center gap-4">
            <Avatar src={slide.creator.avatar} name={slide.creator.channelName} size={72} />
            <OgBadge tier={og.tier} size="lg" />
          </div>
          <p className="display text-[36px] leading-tight">{slide.creator.channelName}</p>
          <p className="mt-4 text-[20px] leading-snug">
            {formatCompact(og.subscribersThen)} subscribers when you joined, {formatCompact(og.subscribersNow)} now.
            That’s {og.growthMultiple! >= 10 ? Math.round(og.growthMultiple!) : og.growthMultiple!.toFixed(1)}× in {formatSpan(Date.now() - og.subscribedAt)}.
          </p>
          {og.estimate ? <p className="mt-3 text-[13px] text-faint">Subscriber count at the time is estimated from TubeStat’s recorded history.</p> : null}
        </div>
      );
    }
    case 'facts':
      return (
        <div>
          <Kicker>A few more things</Kicker>
          <ul className="space-y-5">
            {slide.facts.map((f) => (
              <li key={f} className="statement text-[28px]">{f}</li>
            ))}
          </ul>
        </div>
      );
    case 'change':
      return (
        <div>
          <Kicker>Compared with before</Kicker>
          <ul className="space-y-5">
            {slide.lines.map((f) => (
              <li key={f} className="statement text-[32px]">{f}</li>
            ))}
          </ul>
        </div>
      );
    case 'outro':
      return (
        <div>
          <Kicker>{slide.title}</Kicker>
          <Duration seconds={slide.seconds} className="hero-num block text-[clamp(51px,9.6vw,96px)]" />
          <dl className="mt-8 grid grid-cols-2 gap-6 text-[15px]">
            <div><dt className="text-dim">Videos</dt><dd className="tnum mt-1 text-[24px]">{slide.videos.toLocaleString()}</dd></div>
            {slide.topCreator ? <div><dt className="text-dim">Top creator</dt><dd className="mt-1 truncate text-[24px]">{slide.topCreator}</dd></div> : null}
            {slide.topCategory ? <div><dt className="text-dim">Top category</dt><dd className="mt-1 text-[24px]">{slide.topCategory}</dd></div> : null}
          </dl>
        </div>
      );
  }
}
