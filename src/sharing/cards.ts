/**
 * Share cards drawn on a canvas at 1080×1350 (4:5, the size Instagram and
 * most feeds show uncropped). Images are fetched through the extension's host
 * permissions and decoded as bitmaps so the canvas stays exportable.
 */
import { formatAudienceShare, formatCompact, formatDuration } from '../lib/format';

export const CARD_W = 1080;
export const CARD_H = 1350;

const C = {
  bg: '#111113',
  text: '#F2F0EB',
  muted: '#8C8A86',
  faint: 'rgba(242,240,235,0.14)',
  accent: '#FF3040',
};

const DISPLAY = '"Unbounded Variable", Unbounded, system-ui, sans-serif';
const SANS = '"Inter Variable", Inter, system-ui, sans-serif';

export type CardSpec =
  | {
      kind: 'period';
      eyebrow: string;
      title: string;
      watchSeconds: number;
      videos: number;
      topCreator: { name: string; avatar: string | null } | null;
      topCategory: string | null;
      longestSessionSeconds: number | null;
    }
  | {
      kind: 'early';
      creator: string;
      avatar: string | null;
      tier: string;
      subscribedYear: string;
      then: number | null;
      now: number | null;
      audienceAfter: number | null;
      estimate: boolean;
    };

async function loadBitmap(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

async function ensureFonts() {
  try {
    await Promise.all([document.fonts.load(`600 80px ${DISPLAY}`), document.fonts.load(`600 48px ${SANS}`), document.fonts.load(`400 32px ${SANS}`)]);
  } catch {
    /* fall back to system fonts */
  }
}

function roundAvatar(ctx: CanvasRenderingContext2D, img: ImageBitmap | null, x: number, y: number, size: number, fallback: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = '#26262A';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = C.text;
    ctx.font = `600 ${size * 0.38}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback.slice(0, 1).toUpperCase(), x + size / 2, y + size / 2 + size * 0.03);
  }
  ctx.restore();
}

/** The YouTube scrubber: a thin track, a red played portion and a playhead. */
function scrubber(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, played: number) {
  ctx.fillStyle = C.faint;
  ctx.fillRect(x, y - 3, w, 6);
  ctx.fillStyle = C.accent;
  ctx.fillRect(x, y - 3, w * played, 6);
  ctx.beginPath();
  ctx.arc(x + w * played, y, 13, 0, Math.PI * 2);
  ctx.fill();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: (size: number) => string, start: number, min = 40): number {
  let size = start;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 4;
    ctx.font = font(size);
  }
  return size;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function footer(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.muted;
  ctx.font = `600 24px ${DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('TubeStat', 88, CARD_H - 80);
  ctx.textAlign = 'right';
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText('Your YouTube, tracked', CARD_W - 88, CARD_H - 80);
  ctx.textAlign = 'left';
}

export async function renderCard(spec: CardSpec): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.textBaseline = 'alphabetic';
  const L = 88;
  const W = CARD_W - L * 2;

  if (spec.kind === 'period') {
    ctx.fillStyle = C.muted;
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText(spec.eyebrow, L, 150);
    ctx.fillStyle = C.text;
    const titleSize = fitText(ctx, spec.title, W, (s) => `600 ${s}px ${DISPLAY}`, 76);
    ctx.font = `600 ${titleSize}px ${DISPLAY}`;
    ctx.fillText(spec.title, L, 150 + titleSize + 10);

    // Hero number.
    const dur = formatDuration(spec.watchSeconds);
    ctx.font = `600 150px ${DISPLAY}`;
    const heroSize = fitText(ctx, dur, W, (s) => `600 ${s}px ${DISPLAY}`, 150, 80);
    ctx.font = `600 ${heroSize}px ${DISPLAY}`;
    ctx.fillText(dur, L - 6, 560);
    ctx.fillStyle = C.muted;
    ctx.font = `400 34px ${SANS}`;
    ctx.fillText(`watched across ${spec.videos.toLocaleString()} videos`, L, 624);
    scrubber(ctx, L, 700, W, 1);

    let y = 860;
    if (spec.topCreator) {
      const img = await loadBitmap(spec.topCreator.avatar);
      roundAvatar(ctx, img, L, y, 112, spec.topCreator.name);
      ctx.fillStyle = C.muted;
      ctx.font = `400 28px ${SANS}`;
      ctx.fillText('Top creator', L + 140, y + 42);
      ctx.fillStyle = C.text;
      ctx.font = `500 48px ${SANS}`;
      ctx.fillText(ellipsize(ctx, spec.topCreator.name, W - 140), L + 140, y + 96);
      y += 210;
    }
    const cols: Array<[string, string]> = [];
    if (spec.topCategory) cols.push(['Top category', spec.topCategory]);
    if (spec.longestSessionSeconds) cols.push(['Longest session', formatDuration(spec.longestSessionSeconds)]);
    cols.forEach(([label, value], i) => {
      const x = L + i * (W / 2);
      ctx.fillStyle = C.muted;
      ctx.font = `400 28px ${SANS}`;
      ctx.fillText(label, x, y + 30);
      ctx.fillStyle = C.text;
      ctx.font = `500 48px ${SANS}`;
      ctx.fillText(ellipsize(ctx, value, W / 2 - 24), x, y + 88);
    });
  } else {
    ctx.fillStyle = C.muted;
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText('I was here early', L, 150);

    const img = await loadBitmap(spec.avatar);
    roundAvatar(ctx, img, L, 210, 200, spec.creator);

    ctx.fillStyle = C.text;
    const nameSize = fitText(ctx, spec.creator, W, (s) => `600 ${s}px ${DISPLAY}`, 88, 44);
    ctx.font = `600 ${nameSize}px ${DISPLAY}`;
    ctx.fillText(ellipsize(ctx, spec.creator, W), L, 520);

    // Tier badge.
    ctx.font = `700 28px ${DISPLAY}`;
    const tw = ctx.measureText(spec.tier).width + 48;
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.roundRect(L, 568, tw, 58, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(spec.tier, L + 24, 608);

    const rows: Array<[string, string]> = [['Subscribed', spec.subscribedYear]];
    if (spec.then != null) rows.push(['Creator then', `${formatCompact(spec.then)} subscribers`]);
    if (spec.now != null) rows.push(['Creator now', `${formatCompact(spec.now)} subscribers`]);
    let y = 720;
    for (const [label, value] of rows) {
      ctx.fillStyle = C.muted;
      ctx.font = `400 30px ${SANS}`;
      ctx.fillText(label, L, y);
      ctx.fillStyle = C.text;
      ctx.font = `500 56px ${SANS}`;
      ctx.fillText(value, L, y + 66);
      y += 140;
    }
    if (spec.then != null && spec.now) {
      scrubber(ctx, L, y + 10, W, Math.max(0.01, Math.min(1, spec.then / spec.now)));
      ctx.fillStyle = C.muted;
      ctx.font = `400 26px ${SANS}`;
      const pct = spec.audienceAfter != null ? formatAudienceShare(spec.audienceAfter) : null;
      if (pct != null) ctx.fillText(`${spec.estimate ? 'About ' : ''}${pct} of their audience arrived after me.`, L, y + 70);
    }
  }
  footer(ctx);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
}

export async function downloadCard(canvas: HTMLCanvasElement, filename: string) {
  const url = URL.createObjectURL(await canvasBlob(canvas));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyCard(canvas: HTMLCanvasElement) {
  const blob = await canvasBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
