import { useMemo } from 'react';
import { clock, coverage, heatGradient, replayedMoments, type ReplayHeat } from '../replay/heat';
import { Provenance, Section } from './ui';

/** The stretches of video you keep coming back to, from your Replay Maps. */
export function ReplayMoments({ replays }: { replays: Record<string, ReplayHeat> }) {
  const maps = useMemo(() => Object.values(replays).filter((h) => h.duration > 0 && coverage(h) > 0), [replays]);
  const moments = useMemo(
    () =>
      maps
        .flatMap((h) => replayedMoments(h).slice(0, 1).map((m) => ({ ...m, heat: h })))
        .sort((a, b) => b.peak - a.peak || b.heat.updatedAt - a.heat.updatedAt)
        .slice(0, 6),
    [maps],
  );

  return (
    <Section title="Moments you replay" className="mt-20" aside={maps.length ? `${maps.length} videos mapped` : undefined}>
      {moments.length ? (
        <ol className="divide-y divide-line">
          {moments.map((m) => (
            <li key={`${m.videoId}-${m.start}`}>
              <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(m.videoId)}&t=${m.start}s`} target="_blank" rel="noreferrer" className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] group-hover:underline">{m.heat.title || 'Untitled video'}</p>
                  <p className="truncate text-[12px] text-dim">{m.heat.channelName}</p>
                </div>
                <p className="tnum text-right text-[13px]">
                  <span className="text-paper">{clock(m.start)}–{clock(m.end)}</span>
                  <span className="ml-2 text-dim">{m.peak}×</span>
                </p>
                <div className="relative col-span-2 h-[4px] rounded-full bg-track" style={{ backgroundImage: heatGradient(m.heat) }}>
                  <span className="absolute -top-[3px] h-[10px] rounded-sm ring-1 ring-paper/80" style={{ left: `${(m.start / m.heat.duration) * 100}%`, width: `${Math.max(0.6, ((m.end - m.start) / m.heat.duration) * 100)}%` }} />
                </div>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="max-w-2xl text-[14px] leading-relaxed text-dim">
          {maps.length
            ? 'Nothing replayed yet. Rewind a part of a video and it shows up here.'
            : 'Replay Maps start with the next video you watch. Look for the thin strip above YouTube’s seek bar.'}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-dim">
        <Legend color="rgba(242,240,235,0.62)" label="watched" />
        <Legend color="#f5d90a" label="replayed 2×" />
        <Legend color="#e0429a" label="3× or more" />
      </div>
      <Provenance>Measured on the video’s own timeline while it plays, so seeking past a part never marks it seen. Starts from when this feature was installed.</Provenance>
    </Section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <i className="inline-block h-[4px] w-5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
