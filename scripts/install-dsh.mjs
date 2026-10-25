import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const projectMode = args.length === 2 && args[0] === '--project' && !args[1].startsWith('--');
const userMode = args.length === 1 && args[0] === '--user';
if (!projectMode && !userMode) {
  console.error('Usage: node scripts/install-dsh.mjs --project <project-directory> | --user');
  process.exit(2);
}
const name = 'proactive-skill-discovery-dsh';
const source = fileURLToPath(new URL(`../skills/${name}/`, import.meta.url));
const configRoot = projectMode ? resolve(args[1], '.dsh') : resolve(process.env.DSH_HOME || join(homedir(), '.dsh'));
const skillRoot = join(configRoot, 'skills');
const target = join(skillRoot, name);
if (existsSync(target)) {
  console.error(`Already installed; preserve your changes before replacing: ${target}`);
  process.exit(1);
}
assert(existsSync(join(source, 'SKILL.md')) && existsSync(join(source, 'LICENSE')), 'Incomplete DSH source package');
mkdirSync(configRoot, { recursive: true });
const stage = mkdtempSync(join(configRoot, '.skill-stage-'));
try {
  const stagedSkill = join(stage, name);
  cpSync(source, stagedSkill, { recursive: true, errorOnExist: true, force: false });
  mkdirSync(skillRoot, { recursive: true });
  assert.equal(dirname(resolve(target)), resolve(skillRoot));
  assert.equal(basename(target), name);
  assert.equal(dirname(resolve(stagedSkill)), resolve(stage));
  assert(!existsSync(target), 'Destination appeared during installation; no replacement performed');
  renameSync(stagedSkill, target);
  console.log(`Installed ${name}: ${target}`);
} finally {
  // Only remove this invocation's verified temporary child, never a computed user root.
  assert.equal(dirname(resolve(stage)), resolve(configRoot));
  assert(basename(stage).startsWith('.skill-stage-'));
  rmSync(stage, { recursive: true, force: true });
}
