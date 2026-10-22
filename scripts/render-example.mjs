import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../examples/svg-binder-clip/', import.meta.url));
const file = (name) => directory + name;
const source = readFileSync(file('source.svg'), 'utf8');
const groupIds = [...source.matchAll(/<g id="([^"]+)"/g)].map((match) => match[1]);
if (new Set(groupIds).size !== groupIds.length) throw new Error('Duplicate physical group in assembly');
const parts = ['front-lever', 'rear-lever', 'spring-body', 'central-lip', 'rolled-sockets', 'rear-sleeve', 'right-joint-study', 'left-joint-study', 'front-mouth-study', 'rear-lever-study'];
const detail = readFileSync(file('front-lever.svg'), 'utf8');
for (const part of parts) {
  const svg = readFileSync(file(`${part}.svg`), 'utf8');
  // This example uses top-level groups indented two spaces and no nested groups.
  const groups = [...svg.matchAll(/  <g id="[^"]+"[^>]*>[\s\S]*?  <\/g>/g)];
  if (!groups.length) throw new Error(`No drawable groups in ${part}`);
  for (const [group] of groups) {
    if (!source.includes(group)) throw new Error(`Assembly changed reviewed group in ${part}`);
  }
}
const render = (svg, size, background) => new Resvg(svg, {
  fitTo: { mode: 'width', value: size }, background,
}).render().asPng();

// Same 440×440 photograph crop and SVG viewBox; never scale X and Y separately.
const photo = await sharp(file('reference.jpg')).extract({ left: 260, top: 160, width: 440, height: 440 })
  .resize(440, 440).png().toBuffer();
const final = render(source, 440, '#f6f2e9');
const lever = render(detail, 440, '#f6f2e9');
await sharp({ create: { width: 1320, height: 440, channels: 4, background: '#f6f2e9' } })
  .composite([{ input: photo, left: 0, top: 0 }, { input: lever, left: 440, top: 0 }, { input: final, left: 880, top: 0 }])
  .png().toFile(file('comparison.png'));

const tiles = [];
for (const [row, background] of ['#f6f2e9', '#172431'].entries()) {
  for (const [column, angle] of [0, 90, 180, 270].entries()) {
    const rotated = await sharp(render(source, 160, background)).rotate(angle).png().toBuffer();
    tiles.push({ input: rotated, left: column * 160, top: row * 160 });
  }
}
await sharp({ create: { width: 640, height: 320, channels: 4, background: '#f6f2e9' } })
  .composite(tiles).png().toFile(file('inspection.png'));
const connectionPhoto = await sharp(file('reference.jpg'))
  .extract({ left: 370, top: 495, width: 70, height: 80 }).resize(560, 640).png().toBuffer();
const connectionSvg = source.replace('width="160" height="160"', 'width="70" height="80"')
  .replace('viewBox="260 160 440 440"', 'viewBox="370 495 70 80"');
await sharp({ create: { width: 1120, height: 640, channels: 4, background: '#f6f2e9' } })
  .composite([{ input: connectionPhoto, left: 0, top: 0 },
    { input: render(connectionSvg, 560, '#f6f2e9'), left: 560, top: 0 }])
  .png().toFile(file('connections.png'));
// Show the same complete wire before and after sleeve occlusion.
for (const [name, box] of [
  ['wire-through-comparison.png', [370, 485, 70, 90]],
  ['left-wire-through-comparison.png', [285, 380, 80, 95]],
]) {
  const [x, y, w, h] = box;
  const width = w * 4, height = h * 4;
  const cropSvg = (svg) => svg
    .replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`)
    .replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`);
  const target = await sharp(file('reference.jpg'))
    .extract({ left: x, top: y, width: w, height: h }).resize(width, height).png().toBuffer();
  await sharp({ create: { width: width * 3, height, channels: 4, background: '#f6f2e9' } })
    .composite([{ input: target, left: 0, top: 0 },
      { input: render(cropSvg(detail), width, '#f6f2e9'), left: width, top: 0 },
      { input: render(cropSvg(source), width, '#f6f2e9'), left: width * 2, top: 0 }])
    .png().toFile(file(name));
}
// Other specimens explain topology; target and drawing share the exact crop/scale.
// No auxiliary photograph is stretched or presented as a dimensional ruler.
const evidenceRows = [
  { photo: 'support-unpainted.jpg', crop: [340, 230, 220, 330], target: [310, 420, 110, 130],
    local: 'front-mouth-study.svg', label: 'Raised curved crest and returning free edge, not a flat flange' },
  { photo: 'support-views.jpg', crop: [985, 805, 240, 225], target: [390, 440, 155, 140],
    local: 'source.svg', label: 'Folded end and opposing rolls; exclude the cast shadow' },
  { photo: 'support-unpainted.jpg', crop: [205, 430, 700, 500], target: [285, 385, 80, 90],
    local: 'left-joint-study.svg', label: 'Bent wire meets rolled sheet; no added U-shaped loop' },
];
const evidenceTiles = [];
const toCrop = ([left, top, width, height]) => ({ left, top, width, height });
for (const [row, item] of evidenceRows.entries()) {
  const [x, y, w, h] = item.target;
  const factor = Math.min(320 / w, 250 / h);
  const width = Math.round(w * factor), height = Math.round(h * factor);
  const aux = await sharp(file(item.photo)).extract(toCrop(item.crop))
    .resize({ width: 320, height: 250, fit: 'inside' }).png().toBuffer();
  const target = await sharp(file('reference.jpg')).extract(toCrop(item.target))
    .resize(width, height).png().toBuffer();
  const local = readFileSync(file(item.local), 'utf8')
    .replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`)
    .replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`);
  // Captions live in Markdown: no OS-specific system fonts in reproducible PNGs.
  const title = Buffer.from('<svg width="1080" height="50" xmlns="http://www.w3.org/2000/svg"><path d="M12 35H1056" stroke="#d7d3ca"/></svg>');
  evidenceTiles.push({ input: title, left: 0, top: row * 310 },
    { input: aux, left: 12, top: row * 310 + 54 },
    { input: target, left: 372, top: row * 310 + 54 },
    { input: render(local, width, '#f6f2e9'), left: 732, top: row * 310 + 54 });
}
await sharp({ create: { width: 1080, height: 930, channels: 4, background: '#f6f2e9' } })
  .composite(evidenceTiles).png().toFile(file('reference-evidence.png'));
const hashes = Object.fromEntries(['reference.jpg', 'support-black.jpg', 'support-unpainted.jpg', 'support-views.jpg', 'support-no-handles.jpg', ...parts.map((part) => `${part}.svg`), 'before.svg', 'source.svg', 'comparison.png', 'inspection.png', 'connections.png', 'reference-evidence.png', 'wire-through-comparison.png', 'left-wire-through-comparison.png']
  .map((name) => [name, createHash('sha256').update(readFileSync(file(name))).digest('hex')]));
writeFileSync(file('render-manifest.json'), JSON.stringify({
  renderer: '@resvg/resvg-js@2.6.2', compositor: 'sharp@0.35.5',
  photoCrop: [260, 160, 440, 440], nativeSize: [160, 160],
  connectionCrop: [370, 495, 70, 80],
  independentGroupsUnchanged: parts, sha256: hashes,
}, null, 2) + '\n');
console.log('Rendered comparison, connection crop and eight native-size views; reviewed component groups preserved exactly.');
