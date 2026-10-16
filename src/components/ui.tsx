import { useState, type ReactNode } from 'react';
import { durationParts } from '../lib/format';
import type { OgTier } from '../analytics/og';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

/* ---------- identity ---------- */

const AVATAR_TONES = ['#3a2f2b', '#2b3440', '#34302a', '#2d3a33', '#3b2c36', '#2f2f3b'];

export function Avatar({ src, name, size = 40, className }: { src: string | null | undefined; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const tone = AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length];
  const style = { width: size, height: size };
  if (src && !failed) {
    return <img src={src} alt="" style={style} onError={() => setFailed(true)} className={cx('shrink-0 rounded-full object-cover bg-raise-2', className)} />;
  }
  return (
    <div aria-hidden style={{ ...style, background: tone, fontSize: size * 0.4 }} className={cx('shrink-0 grid place-items-center rounded-full font-medium text-paper/85', className)}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </div>
  );
}

export function Thumb({ src, className }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cx('relative aspect-video overflow-hidden rounded-md bg-raise-2', className)}>
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" /> : null}
    </div>
  );
}

/* ---------- numbers ---------- */

/** "18h 32m" with the units set smaller than the digits. */
export function Duration({ seconds, className, unitClass = 'text-[0.45em] font-medium text-dim ml-[0.06em] mr-[0.22em] tracking-normal' }: { seconds: number; className?: string; unitClass?: string }) {
  return (
    <span className={cx('tnum', className)}>
      {durationParts(seconds).map((p, i) => (
        <span key={i}>
          {p.value}
          <span className={unitClass}>{p.unit}</span>
        </span>
      ))}
    </span>
  );
}

export function Change({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-faint">—</span>;
  const pct = Math.round(value * 100);
  const up = pct > 0;
  return (
    <span className="tnum">
      <span aria-hidden className={cx('mr-1 inline-block', up ? 'text-paper' : 'text-dim')}>{pct === 0 ? '' : up ? '↑' : '↓'}</span>
      {Math.abs(pct)}%{suffix ? <span className="text-dim"> {suffix}</span> : null}
    </span>
  );
}

/* ---------- the scrubber motif ---------- */

/** A YouTube-style progress bar: grey track, red "played" fill, optional playhead. */
export function Scrubber({ value, max = 1, tone = 'play', head = false, className, animate = true }: { value: number; max?: number; tone?: 'play' | 'buffer'; head?: boolean; className?: string; animate?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className={cx('relative h-[3px] w-full rounded-full bg-track', className)}>
      <div className={cx('absolute inset-y-0 left-0 rounded-full', tone === 'play' ? 'bg-play' : 'bg-buffer', animate && 'grow-x')} style={{ width: `${pct}%` }} />
      {head && pct > 0 ? <div className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-play" style={{ left: `${pct}%` }} /> : null}
    </div>
  );
}

/* ---------- structure ---------- */

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('border-t border-line pt-6', className)}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium text-paper">{title}</h2>
        {aside ? <div className="text-[13px] text-dim">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-raise p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
          className={cx('whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition-colors', o.id === value ? 'bg-raise-2 text-paper shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-dim hover:text-paper')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, variant = 'quiet', className, disabled, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'quiet' | 'danger'; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-paper text-ink hover:bg-white',
        variant === 'quiet' && 'border border-line-strong text-paper hover:bg-raise-2',
        variant === 'danger' && 'border border-play/50 text-play hover:bg-play/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- honesty labels ---------- */

export function OgBadge({ tier, size = 'md' }: { tier: OgTier; size?: 'sm' | 'md' | 'lg' }) {
  const strong = tier === 'DAY ONE' || tier === 'OG';
  return (
    <span
      className={cx(
        'inline-flex items-center rounded font-bold tracking-[0.06em]',
        size === 'sm' && 'px-1.5 py-[1px] text-[10px]',
        size === 'md' && 'px-2 py-0.5 text-[11px]',
        size === 'lg' && 'px-3 py-1 text-[13px]',
        strong ? 'bg-play text-white' : 'border border-line-strong text-paper/80',
      )}
    >
      {tier}
    </span>
  );
}

/** Small note that says where a number came from. */
export function Provenance({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[12px] leading-relaxed text-faint">{children}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[15px] text-paper">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-dim">{children}</div> : null}
    </div>
  );
}

/** The TubeStat mark: the played-progress bar forms the crossbar of a T. */
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="14 15 72 67" width={size} height={(size * 67) / 72} aria-hidden className={className}>
      <rect x="16" y="25" width="68" height="10" rx="5" fill="var(--color-faint)" />
      <rect x="16" y="25" width="40" height="10" rx="5" fill="var(--color-play)" />
      <rect x="44" y="30" width="12" height="50" rx="6" fill="var(--color-paper)" />
      <circle cx="50" cy="30" r="13" fill="var(--color-play)" />
    </svg>
  );
}
