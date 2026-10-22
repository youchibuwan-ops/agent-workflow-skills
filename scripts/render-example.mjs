import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const directory = fileURLToPath(new URL('../examples/svg-binder-clip/', import.meta.url));
const file = (name) => directory + name;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(file('case-manifest.json'), 'utf8'));
const source = readFileSync(file('source.svg'), 'utf8').replaceAll('\r\n', '\n');
if (sha(source) !== manifest.source_sha256) throw new Error('Current source differs from the case manifest');
const groupIds = [...source.matchAll(/<g id="([^"]+)"/g)].map((match) => match[1]);
if (new Set(groupIds).size !== groupIds.length) throw new Error('Duplicate physical group in assembly');
for (const part of ['N-L', 'F-L', 'N-R', 'F-R', 'N-central', 'F-central']) {
  if (!groupIds.includes(manifest.parts[part].id)) throw new Error(`Missing reference-confirmed curl: ${part}`);
}
for (const name of ['sheet-substrate', ...manifest.order]) {
  const local = readFileSync(file(`locals/${name}.svg`), 'utf8').replaceAll('\r\n', '\n');
  const group = [...local.matchAll(/<g id="([^"]+)">[\s\S]*?<\/g>/g)][0]?.[0];
  if (!group || sha(group) !== manifest.parts[name].group_sha256 || !source.includes(group)) {
    throw new Error(`Assembly changed reviewed local: ${name}`);
  }
}
const render = (svg, size, background) => new Resvg(svg, {
  fitTo: { mode: 'width', value: size }, background,
}).render().asPng();

// One global similarity transform, no per-part deformation or X/Y stretching.
const transform = manifest.target_transform;
const content = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const targetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768"><g transform="matrix(${transform.matrix.join(' ')})">${content}</g></svg>`;
const box = transform.crop;
const photo = await sharp(file('reference.jpg')).extract(box).png().toBuffer();
const aligned = await sharp(new Resvg(targetSvg, { background: '#f6f2e9' }).render().asPng())
  .extract(box).png().toBuffer();
await sharp({ create: { width: 880, height: 440, channels: 4, background: '#f6f2e9' } })
  .composite([{ input: photo, left: 0, top: 0 }, { input: aligned, left: 440, top: 0 }])
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

// Fixed camera BODY projection; no text/fonts in reproducible PNGs.
const primary = readFileSync(file('primary-body.svg'), 'utf8');
const primaryPng = new Resvg(primary, { background: '#f6f2e9' }).render().asPng();
const crop = { left: 700, top: 130, width: 480, height: 960 };
const primaryPhoto = await sharp(file('support-axial.jpg')).extract(crop).png().toBuffer();
const primaryBody = await sharp(primaryPng).extract(crop).png().toBuffer();
await sharp({ create: { width: 960, height: 960, channels: 4, background: '#f6f2e9' } })
  .composite([{ input: primaryPhoto, left: 0, top: 0 }, { input: primaryBody, left: 480, top: 0 }])
  .png().toFile(file('primary-body-comparison.png'));

const constructionArg = process.argv.indexOf('--construction-views');
if (constructionArg >= 0) {
  if (!process.argv[constructionArg + 1]) throw new Error('Specify the directory of actual Blender inspection renders');
  const input = resolve(process.argv[constructionArg + 1]);
  const views = ['front', 'end-section', 'reverse-volume'];
  const composites = await Promise.all(views.map(async (name, i) => ({
    input: await sharp(join(input, `${name}.png`)).resize(700, 700).png().toBuffer(), left: i * 700, top: 0,
  })));
  await sharp({ create: { width: 2100, height: 700, channels: 4, background: '#f6f2e9' } })
    .composite(composites).png().toFile(file('construction-views.png'));
}

const inputs = ['source.svg', 'construction.blend', 'primary-body.svg', 'before.svg',
  'reference.jpg', 'support-black.jpg', 'support-unpainted.jpg', 'support-views.jpg',
  'support-no-handles.jpg', 'support-axial.jpg', ...['sheet-substrate', ...manifest.order].map((n) => `locals/${n}.svg`)];
const outputs = ['comparison.png', 'inspection.png', 'primary-body-comparison.png',
  'construction-views.png', 'assembly-seam-rejected.png'];
writeFileSync(file('render-manifest.json'), JSON.stringify({
  renderer: '@resvg/resvg-js@2.6.2', compositor: 'sharp@0.35.5',
  scope: 'Fixed accepted r08 case regeneration and exact-group integrity; not an automatic visual pass',
  nativeSize: [160, 160], targetTransform: transform, primaryCrop: crop,
  independentGroupsUnchanged: manifest.order,
  sha256: Object.fromEntries([...inputs, ...outputs].map((name) => [name, sha(readFileSync(file(name)))])),
}, null, 2) + '\n');
console.log('Rendered accepted case from current source; all six curls and eleven exact groups retained.');

// Controlled owned-vector case: explicit planted faults, never a photo benchmark.
const controlled = fileURLToPath(new URL('../examples/controlled-bracket/', import.meta.url));
const controlledTiles = [];
const controlledHashes = {};
for (const [column, name] of ['reference.svg', 'faulty.svg', 'source.svg'].entries()) {
  const input = readFileSync(controlled + name, 'utf8');
  controlledHashes[name] = createHash('sha256').update(input).digest('hex');
  controlledTiles.push({ input: render(input, 640, '#f6f2e9'), left: column * 640, top: 0 },
    { input: render(input, 160, '#f6f2e9'), left: column * 640, top: 520 },
    { input: render(input, 160, '#172431'), left: column * 640 + 170, top: 520 });
}
const controlledSource = readFileSync(controlled + 'source.svg', 'utf8');
for (const name of ['upright.svg', 'base.svg']) {
  const input = readFileSync(controlled + name, 'utf8');
  const group = input.replaceAll('\r\n', '\n').match(/  <g[\s\S]*?  <\/g>\n/)?.[0];
  if (!group || !controlledSource.replaceAll('\r\n', '\n').includes(group)) throw new Error(`Controlled assembly differs from ${name}`);
  controlledHashes[name] = createHash('sha256').update(input).digest('hex');
}
await sharp({ create: { width: 1920, height: 656, channels: 4, background: '#f6f2e9' } })
  .composite(controlledTiles).png().toFile(controlled + 'comparison.png');
writeFileSync(controlled + 'render-manifest.json', JSON.stringify({
  scope: 'controlled owned-vector fixture; hashes are not an artistic pass',
  renderer: '@resvg/resvg-js@2.6.2', compositor: 'sharp@0.35.5', sha256: controlledHashes,
}, null, 2) + '\n');
console.log('Rendered controlled vector fixture; exact current local groups preserved.');
