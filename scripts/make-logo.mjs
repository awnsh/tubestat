// Builds the TubeStat logo files: SVG mark, SVG lockups (wordmark outlined from
// Instrument Serif so it renders identically everywhere), and PNG icons.
//   node scripts/make-logo.mjs
//
// The mark: YouTube's played-progress bar forms the crossbar of a T, with the
// red playhead sitting where the stem meets it.
import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const brand = resolve(root, 'brand');
mkdirSync(brand, { recursive: true });

const C = { ink: '#111113', paper: '#f2f0eb', play: '#ff3040', track: '#4a4946', trackLight: '#d6d3cc' };

/** The glyph in a 100×100 box. `stem` and `track` colours change for light backgrounds. */
const glyph = (stem = C.paper, track = C.track) =>
  `<rect x="16" y="25" width="68" height="10" rx="5" fill="${track}"/>` +
  `<rect x="16" y="25" width="40" height="10" rx="5" fill="${C.play}"/>` +
  `<rect x="44" y="30" width="12" height="50" rx="6" fill="${stem}"/>` +
  `<circle cx="50" cy="30" r="13" fill="${C.play}"/>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;

// App icon: glyph on the ink tile.
const icon = svg(100, 100, `<rect width="100" height="100" rx="22" fill="${C.ink}"/>${glyph()}`);
// Bare glyphs for placing on a page background, cropped tight to the shape.
const tight = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 15 72 67" width="72" height="67">${body}</svg>
`;
const markDark = tight(glyph());
const markLight = tight(glyph(C.ink, C.trackLight));

// Wordmark lockups.
const fontFile = readFileSync(resolve(root, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff'));
const font = opentype.parse(fontFile.buffer.slice(fontFile.byteOffset, fontFile.byteOffset + fontFile.byteLength));
// Size the word so its cap height spans the mark from the bar's top (y 25) to the stem's foot (y 80).
const capHeight = font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7;
const size = Math.round((55 * font.unitsPerEm) / capHeight); // whole sizes avoid NaN points in opentype.js
// Lay glyphs out by hand (with kerning): opentype.js can't run this font's ccmp lookups.
function textPath(str, x, y) {
  const scale = size / font.unitsPerEm;
  const path = new opentype.Path();
  const glyphs = [...str].map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    path.extend(g.getPath(x, y, size));
    x += g.advanceWidth * scale + (glyphs[i + 1] ? font.getKerningValue(g, glyphs[i + 1]) * scale : 0);
  });
  return path;
}
const bb = textPath('TubeStat', 0, 0).getBoundingBox();
const textW = bb.x2 - bb.x1;
const gap = 14;
// Baseline sits on the stem's foot.
const baseline = 80;
const lockup = (stem, track, ink) => {
  // The glyph spans x 16–84 (and y 17–80); crop the lockup tight around it and the word.
  const x0 = 84 + gap;
  const p = textPath('TubeStat', x0 - bb.x1, baseline).toPathData(2);
  const [vx, vy] = [14, 15];
  const vw = Math.ceil(x0 + textW + 2 - vx);
  const vh = 68;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">${glyph(stem, track)}<path d="${p}" fill="${ink}"/></svg>\n`;
};
const lockupDark = lockup(C.paper, C.track, C.paper);
const lockupLight = lockup(C.ink, C.trackLight, C.ink);

const files = {
  'tubestat-icon.svg': icon,
  'tubestat-mark-on-dark.svg': markDark,
  'tubestat-mark-on-light.svg': markLight,
  'tubestat-logo-on-dark.svg': lockupDark,
  'tubestat-logo-on-light.svg': lockupLight,
};
for (const [name, body] of Object.entries(files)) writeFileSync(resolve(brand, name), body);

// PNGs, rendered by Chromium for accurate anti-aliasing.
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svgText, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace('<svg ', `<svg style="display:block;width:${w}px;height:${h}px" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
for (const s of [16, 32, 48, 128]) await png(icon, s, s, resolve(root, `public/icons/${s}.png`));
await png(icon, 512, 512, resolve(brand, 'tubestat-icon-512.png'));
const [lw, lh] = lockupDark.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
await png(lockupDark, lw * 4, lh * 4, resolve(brand, 'tubestat-logo-on-dark.png'));
await png(lockupLight, lw * 4, lh * 4, resolve(brand, 'tubestat-logo-on-light.png'));
await browser.close();

// The website and dashboard use the same files.
copyFileSync(resolve(brand, 'tubestat-icon.svg'), resolve(root, 'docs/assets/icon.svg'));
copyFileSync(resolve(root, 'public/icons/128.png'), resolve(root, 'docs/assets/icon.png'));
copyFileSync(resolve(brand, 'tubestat-mark-on-dark.svg'), resolve(root, 'public/mark.svg'));
copyFileSync(resolve(brand, 'tubestat-mark-on-dark.svg'), resolve(root, 'docs/assets/mark.svg'));
console.log('logo files written to brand/, public/icons/, docs/assets/');
