import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Development inspection tool: same photo coordinates, never independent X/Y stretching.
const [name, ...numbers] = process.argv.slice(2);
const [x, y, w, h] = numbers.map(Number);
if (!/^[a-z-]+$/.test(name ?? '') || numbers.length !== 4 ||
    [x, y, w, h].some((n) => !Number.isFinite(n)) || w <= 0 || h <= 0) {
  throw new Error('Usage: node scripts/inspect-local.mjs part-name x y width height');
}
const base = resolve('examples/svg-binder-clip');
const input = readFileSync(resolve(base, `${name}.svg`), 'utf8')
  .replace(/width="[^"]+" height="[^"]+"/, `width="${w}" height="${h}"`)
  .replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`);
const width = Math.round(w * 2);
const height = Math.round(h * 2);
const render = (size, background) => new Resvg(input, {
  fitTo: { mode: 'width', value: size }, background,
}).render().asPng();
const reference = await sharp(resolve(base, 'reference.jpg'))
  .extract({ left: x, top: y, width: w, height: h }).resize(width, height).png().toBuffer();
const nativeWidth = Math.max(1, Math.round(w * 160 / 440));
const light = render(nativeWidth, '#f6f2e9');
const dark = render(nativeWidth, '#172431');
const nativeHeight = (await sharp(light).metadata()).height;
const out = resolve(base, `${name}-inspection.png`);
await sharp({ create: { width: width * 2, height: height + nativeHeight + 12,
  channels: 4, background: '#f6f2e9' } })
  .composite([{ input: reference, left: 0, top: 0 },
    { input: render(width, '#f6f2e9'), left: width, top: 0 },
    { input: light, left: width, top: height + 6 },
    { input: dark, left: width + nativeWidth + 8, top: height + 6 }])
  .png().toFile(out);
console.log(`${out}: photo/local same scale; native ${nativeWidth}×${nativeHeight}`);
