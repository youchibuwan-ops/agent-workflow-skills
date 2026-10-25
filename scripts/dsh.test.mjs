import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'proactive-skill-discovery-dsh';
const install = (args, env = process.env) => spawnSync(process.execPath,
  [join(root, 'scripts/install-dsh.mjs'), ...args], { encoding: 'utf8', env });
const files = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((x) => x.isFile()).map((x) => join(x.parentPath, x.name));
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-workflow-dsh-'));
  t.after(() => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert(basename(dir).startsWith('agent-workflow-dsh-'));
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('project install is discoverable and fully loadable by the real DSH provider', async (t) => {
  const work = scratch(t);
  mkdirSync(join(work, '.git'));
  const result = install(['--project', work]);
  assert.equal(result.status, 0, result.stderr);
  const target = join(work, '.dsh/skills', name);
  assert.equal(readFileSync(join(target, 'LICENSE'), 'utf8'), readFileSync(join(root, 'LICENSE'), 'utf8'));
  const warnings = [];
  const provider = new FileSystemSkillProvider({ get: () => undefined,
    logger: { warn: (message) => warnings.push(message) } },
  { signal: new AbortController().signal, invalidate() {} },
  { watch: false, dshHome: join(work, 'home'), agentsHome: join(work, 'agents') });
  try {
    const observation = await provider.list({ cwd: work });
    const candidates = Array.isArray(observation) ? observation : observation.candidates;
    const candidate = candidates.find((x) => x.name === name);
    assert(candidate, 'DSH did not discover the installed skill');
    assert.equal(candidate.source, 'project-dsh');
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true });
    const definition = await provider.get(candidate, { cwd: work });
    assert.equal(definition.name, name);
    assert.equal(definition.resourceBase.path, target);
    const resources = [...definition.content.matchAll(/\]\((references\/[^)#]+)(?:#[^)]*)?\)/g)]
      .map((m) => m[1]);
    assert(resources.includes('references/dsh-host.md'));
    for (const ref of resources) assert(readFileSync(join(target, ref), 'utf8').trim());
    assert.equal(warnings.length, 0);
    assert.equal(existsSync(join(target, 'agents/openai.yaml')), false);
  } finally {
    await provider.dispose();
  }
});

test('user install respects an explicit isolated DSH_HOME', (t) => {
  const home = scratch(t);
  const result = install(['--user'], { ...process.env, DSH_HOME: home });
  assert.equal(result.status, 0, result.stderr);
  assert(existsSync(join(home, 'skills', name, 'SKILL.md')));
});

test('a second install refuses to overwrite an existing adaptation', (t) => {
  const work = scratch(t);
  assert.equal(install(['--project', work]).status, 0);
  const target = join(work, '.dsh/skills', name);
  const before = files(target).map((file) => [file, readFileSync(file, 'utf8')]);
  assert.notEqual(install(['--project', work]).status, 0);
  for (const [file, text] of before) assert.equal(readFileSync(file, 'utf8'), text);
});

test('conflicting or incomplete destinations fail without installing', (t) => {
  const work = scratch(t);
  assert.notEqual(install(['--project', work, '--user']).status, 0);
  assert.notEqual(install(['--project']).status, 0);
  assert.equal(existsSync(join(work, '.dsh')), false);
});

test('the DSH distribution preserves the current canonical workflow and resources', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build-dsh-variant.mjs'), '--check'], { stdio: 'pipe' });
});
