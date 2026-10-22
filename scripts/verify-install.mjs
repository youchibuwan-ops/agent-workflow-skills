// Package-specific integration check. Schema validation belongs to skills-ref.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = process.argv[2] || root;
const source = existsSync(input) ? resolve(input) : input;
const output = process.argv[3];
assert(process.env.npm_execpath, 'Run with npm run verify:install -- [source] [report.json]');
const skills = ['proactive-skill-discovery', 'crafting-reference-based-svg-assets'];
const sha = (data) => createHash('sha256').update(data).digest('hex');
function inventory(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(directory, path).replaceAll('\\', '/'), sha(readFileSync(path))];
    }).sort(([a], [b]) => a.localeCompare(b));
}

const report = { cli: 'skills@1.7.4', node: process.version, mode: 'project-copy', telemetry: false, skills: [] };
const scratch = mkdtempSync(join(tmpdir(), 'workflow-skills-'));
try {
  for (const name of skills) {
    const cwd = join(scratch, name);
    mkdirSync(cwd);
    const logs = execFileSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=skills@1.7.4', '--',
      'skills', 'add', source, '--skill', name, '-a', 'codex', '--copy', '-y'], {
      cwd, env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', NO_COLOR: '1' },
      encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const target = join(cwd, '.agents', 'skills', name);
    assert(existsSync(target), `No installed directory for ${name}; output: ${logs}`);
    assert.deepEqual(readdirSync(join(cwd, '.agents', 'skills')), [name], 'Single install included another skill');
    const actual = inventory(target);
    assert.deepEqual(actual, inventory(join(root, 'skills', name)), `${name}: payload differs from checkout`);
    assert.equal(readFileSync(join(target, 'LICENSE'), 'utf8'), readFileSync(join(root, 'LICENSE'), 'utf8'));
    const entry = readFileSync(join(target, 'SKILL.md'), 'utf8');
    const references = [...entry.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
    assert(references.length > 0);
    for (const ref of references) assert(readFileSync(resolve(target, ref.split('#')[0]), 'utf8').trim(), `Empty reference ${ref}`);
    assert(readFileSync(join(target, 'agents', 'openai.yaml'), 'utf8').includes(`$${name}`));
    const listing = execFileSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=skills@1.7.4', '--',
      'skills', 'list', '-a', 'codex', '--json'], {
      cwd, env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', NO_COLOR: '1' }, encoding: 'utf8', timeout: 60000,
    });
    assert(listing.includes(name), 'CLI list did not find installed skill');
    report.skills.push({ name, result: 'pass', referencesRead: references, files: Object.fromEntries(actual) });
    console.log(`${name}: single install, complete payload, license, references, UI prompt and CLI listing verified`);
  }
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
} finally {
  // Verify the absolute deletion target is the task's own named temporary child.
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  assert(basename(scratch).startsWith('workflow-skills-'));
  rmSync(scratch, { recursive: true, force: true });
}
