import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

// Fixed worked-example assembly, not a generic SVG or visual validator.
const base = process.argv[2] ? resolve(process.argv[2])
  : fileURLToPath(new URL('../examples/svg-binder-clip/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(base, 'case-manifest.json'), 'utf8'));
const required = ['N-L', 'F-L', 'N-R', 'F-R', 'N-central', 'F-central'];
for (const part of required) {
  if (!manifest.order.includes(part)) throw new Error(`Missing reference-confirmed curl: ${part}`);
}
if (new Set(manifest.order).size !== 11) throw new Error('Expected eleven distinct reviewed local scopes');
const hash = (text) => createHash('sha256').update(text).digest('hex');
let header;
const groups = [];
for (const name of ['sheet-substrate', ...manifest.order]) {
  const local = readFileSync(join(base, 'locals', `${name}.svg`), 'utf8').replaceAll('\r\n', '\n');
  const item = manifest.parts[name];
  const matches = [...local.matchAll(/<g id="([^"]+)">[\s\S]*?<\/g>/g)];
  if (matches.length !== 1 || matches[0][1] !== item.id) throw new Error(`Incorrect local group: ${name}`);
  const group = matches[0][0];
  if (hash(group) !== item.group_sha256) throw new Error(`Reviewed local changed: ${name}`);
  header ??= local.slice(0, local.indexOf('<g id='));
  groups.push(group);
}
const source = header + groups.join('') + '</svg>\n';
if (hash(source) !== manifest.source_sha256) throw new Error('Assembly differs from the recorded source');
writeFileSync(join(base, 'source.svg'), source);
console.log('Assembled all eleven exact current groups, six curls and two handles; visual review remains separate.');
