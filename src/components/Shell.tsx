import type { ReactNode } from 'react';
import { href } from '../hooks/useRoute';
import { useData } from '../hooks/useDatabase';
import { formatSpan } from '../lib/format';
import { Mark, cx } from './ui';

export const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'creators', label: 'Creators' },
  { id: 'history', label: 'History' },
  { id: 'insights', label: 'Insights' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'profile', label: 'Profile' },
] as const;

export function Shell({ active, children }: { active: string; children: ReactNode }) {
  const { db, sample, setSample } = useData();
  const tracking = db.settings.trackingEnabled;
  return (
    <div className="min-h-screen md:flex">
      <aside className="z-20 border-b border-line bg-ink md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col px-4 py-4 md:px-6 md:py-8">
          <a href={href('overview')} className="display mb-0 inline-flex items-center gap-2.5 text-[20px] leading-none md:mb-10">
            <Mark size={22} />
            TubeStat
          </a>
          <nav aria-label="Main" className="scrollbar-none -mx-4 mt-3 flex gap-1 overflow-x-auto px-4 md:mx-0 md:mt-0 md:flex-col md:px-0">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={href(n.id)}
                aria-current={active === n.id ? 'page' : undefined}
                className={cx(
                  'relative whitespace-nowrap rounded-md px-3 py-2 text-[14px] transition-colors md:-mx-3',
                  active === n.id ? 'bg-raise text-paper' : 'text-dim hover:text-paper',
                )}
              >
                {active === n.id ? <span aria-hidden className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-play md:bottom-2 md:left-0 md:right-auto md:top-2 md:h-auto md:w-[2px]" /> : null}
                {n.label}
              </a>
            ))}
          </nav>
          <div className="mt-auto hidden text-[12px] leading-relaxed text-dim md:block">
            <p className="flex items-center gap-2">
              <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', tracking && !sample ? 'bg-play' : 'bg-faint')} />
              {sample ? 'Showing sample data' : tracking ? 'Tracking on' : 'Tracking paused'}
            </p>
            {!sample ? <p className="mt-1 text-faint">Recording for {formatSpan(Date.now() - db.meta.installedAt)}</p> : null}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {sample ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-raise px-6 py-2.5 text-[13px] md:px-14">
            <span className="text-dim">
              <span className="text-paper">Sample data.</span> Fictional creators and viewing history for previewing TubeStat. Your real data is untouched.
            </span>
            <button onClick={() => setSample(false)} className="rounded-md px-2 py-1 text-paper underline-offset-4 hover:underline">
              Show my data
            </button>
          </div>
        ) : null}
        <div className="mx-auto max-w-[1040px] px-5 pb-24 pt-8 md:px-14 md:pt-14">{children}</div>
      </main>
    </div>
  );
}

export function PageTitle({ title, sub, aside }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="display text-[31px] md:text-[45px]">{title}</h1>
        {sub ? <p className="mt-3 text-[15px] text-dim">{sub}</p> : null}
      </div>
      {aside}
    </header>
  );
}
