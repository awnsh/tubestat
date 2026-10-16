/**
 * The only charts in the product. Single-series bars with a hover readout,
 * a two-period comparison, and a subscriber-growth line. Thin marks,
 * recessive axes, values in text colour, identity never by colour alone.
 */
import { useId, useRef, useState } from 'react';
import { cx } from './ui';

export interface BarDatum {
  key: string;
  /** Tooltip heading, e.g. "Tue, Sep 23". */
  label: string;
  /** Axis tick text; omitted ticks are skipped. */
  tick?: string;
  value: number;
  /** Draw this bar in the accent (e.g. today). */
  current?: boolean;
}

export function BarChart({ data, format, height = 140, ariaLabel }: { data: BarDatum[]; format: (v: number) => string; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const active = hover != null ? data[hover] : null;
  return (
    <figure className="relative select-none" aria-label={ariaLabel}>
      <div className="mb-2 flex h-5 items-baseline justify-between text-[12px] text-dim">
        <span className="tnum">{active ? <><span className="text-paper">{format(active.value)}</span> <span className="ml-1">{active.label}</span></> : <>Peak {format(max)}</>}</span>
      </div>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <div className="absolute inset-x-0 bottom-0 border-t border-line-strong" />
        <div className="absolute inset-0 flex items-end" style={{ gap: n > 40 ? 1 : 2 }}>
          {data.map((d, i) => {
            const h = d.value > 0 ? Math.max(2, (d.value / max) * height) : 0;
            return (
              <div
                key={d.key}
                className="group relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${d.label}: ${format(d.value)}`}
              >
                <div
                  className={cx('grow-y w-full max-w-12 rounded-t-[3px] transition-colors', d.current ? 'bg-play' : hover === i ? 'bg-paper' : 'bg-buffer')}
                  style={{ height: h, animationDelay: `${Math.min(i * 22, 700)}ms` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex text-[11px] text-faint" style={{ gap: n > 40 ? 1 : 2 }}>
        {data.map((d) => (
          <div key={d.key} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {d.tick ?? ''}
          </div>
        ))}
      </div>
    </figure>
  );
}

export interface CompareRow {
  label: string;
  before: number;
  after: number;
}

/** Two periods per category: before in buffer grey, after in played red. */
export function CompareBars({ rows, beforeLabel, afterLabel }: { rows: CompareRow[]; beforeLabel: string; afterLabel: string }) {
  const max = Math.max(0.01, ...rows.flatMap((r) => [r.before, r.after]));
  return (
    <figure>
      <div className="mb-5 flex gap-5 text-[12px] text-dim" aria-hidden>
        <span className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-buffer" />{beforeLabel}</span>
        <span className="inline-flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-play" />{afterLabel}</span>
      </div>
      <table className="w-full text-[14px]">
        <caption className="sr-only">Share of watch time by category, {beforeLabel} compared with {afterLabel}</caption>
        <thead className="sr-only">
          <tr><th>Category</th><th>{beforeLabel}</th><th>{afterLabel}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="align-middle">
              <th scope="row" className="w-36 py-2.5 pr-4 text-left font-normal text-paper">{r.label}</th>
              <td className="py-2.5">
                <div className="flex flex-col gap-[5px]">
                  <div className="h-[3px] rounded-full bg-buffer grow-x" style={{ width: `${(r.before / max) * 100}%` }} />
                  <div className="h-[3px] rounded-full bg-play grow-x" style={{ width: `${(r.after / max) * 100}%` }} />
                </div>
              </td>
              <td className="tnum w-14 py-2.5 pl-4 text-right text-dim">{Math.round(r.before * 100)}%</td>
              <td className="tnum w-14 py-2.5 pl-2 text-right text-paper">{Math.round(r.after * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Subscriber count over time, from the extension's own snapshots. */
export function GrowthLine({ points, format, height = 120 }: { points: Array<{ t: number; v: number }>; format: (v: number) => string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 600;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const pad = (hi - lo) * 0.1 || hi * 0.01 || 1;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => height - 6 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (height - 12);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const t = t0 + ((e.clientX - rect.left) / rect.width) * (t1 - t0);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i;
    });
    setHover(best);
  };
  const h = hover != null ? points[hover] : points[points.length - 1];
  return (
    <figure>
      <div className="mb-2 text-[12px] text-dim tnum">
        <span className="text-paper">{format(h.v)}</span> <span className="ml-1">{new Date(h.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-[120px] w-full overflow-visible" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-labelledby={id}>
        <title id={id}>Subscriber count from {format(points[0].v)} to {format(points[points.length - 1].v)}</title>
        <line x1="0" x2={W} y1={height} y2={height} stroke="var(--color-line-strong)" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="var(--color-play)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null ? <line x1={x(h.t)} x2={x(h.t)} y1="0" y2={height} stroke="var(--color-line-strong)" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
    </figure>
  );
}
