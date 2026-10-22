// Developer-only probe. Uses official published components, no model or credentials.
// npm install --prefix <lab> --ignore-scripts @deepseek-ai/dsh@0.2.1-rc.2
// node scripts/verify-dsh-runtime.mjs <lab> [report.json]
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const lab = resolve(process.argv[2]);
const requireLab = createRequire(join(lab, 'package.json'));
const load = name => import(pathToFileURL(requireLab.resolve(name)).href);
const { Context } = await load('@deepseek-ai/cordis');
const Registry = await load('@deepseek-ai/dsh-skill');
const Provider = await load('@deepseek-ai/dsh-skill-filesystem');
const ToolSkill = await load('@deepseek-ai/dsh-tool-skill');
const { default: Tools } = await load('@deepseek-ai/dsh-tools');
const { default: Agents, agentEvents } = await load('@deepseek-ai/dsh-agent');
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt');
const { Session, SESSION_FORMAT_VERSION } = await load('@deepseek-ai/dsh-session');
const { createUserMessage } = await load('@deepseek-ai/dsh-llm');
const { resolveDshHome } = await load('@deepseek-ai/dsh-home-paths');
const Pruner = await load('@deepseek-ai/dsh-compaction-tool-result-pruner');
const scratch = mkdtempSync(join(tmpdir(), 'aws-dsh-runtime-'));
const home = join(scratch, 'isolated-home');
const cwd = join(scratch, 'workspace');
const shared = join(scratch, 'isolated-agents');
mkdirSync(cwd, { recursive: true });
mkdirSync(shared);
const names = ['proactive-skill-discovery', 'crafting-reference-based-svg-assets'];
const envBefore = Object.fromEntries(['DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_BUNDLED_SKILL_DIR'].map(k => [k, process.env[k]]));
process.env.DSH_HOME = home;
process.env.DSH_AGENTS_HOME = shared;
delete process.env.DSH_BUNDLED_SKILL_DIR;
const ctx = new Context();
const report = { kind: 'official-components-no-model', runtimeVersion: '0.2.1-rc.2', node: process.version, skills: [], desktop: 'unverified', automaticSelection: 'unverified', realTasks: 'unverified' };
try {
  // A Node child inherits Codex's bundled PowerShell Core module path. Let Windows
  // PowerShell rebuild its native module path, as it does when started by Explorer.
  const shellEnv = { ...process.env };
  for (const key of Object.keys(shellEnv)) if (key.toLowerCase() === 'psmodulepath') delete shellEnv[key];
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(repo, 'windows/Manage-DshSkills.ps1'), '-Action', 'Install', '-DshHome', home, '-Yes', '-NonInteractive'], { encoding: 'utf8', env: shellEnv });
  assert.equal(resolveDshHome(), home);
  // The official plugin consumes the workingDirectory service; no user cwd/profile is read.
  ctx.provide('workingDirectory', { ensure: async () => cwd });
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(Tools);
  await ctx.plugin(Agents);
  await ctx.plugin(Registry.default);
  await ctx.plugin(Provider, { dshHome: home, agentsHome: shared, watch: false });
  await ctx.plugin(ToolSkill);
  const catalog = await ctx.skills.list({ cwd });
  assert.deepEqual(catalog.map(s => s.name).sort(), [...names].sort());
  const id = 'aws-dsh-runtime-probe';
  const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false });
  const agent = { id, ctx: new Context(), options: {}, session, status: 'running', inbox: {}, inject() { throw new Error('unexpected injection'); } };
  const signal = new AbortController().signal;
  const step = messages => agentEvents(ctx, agent).waterfall('agent/pre-step', { agent, messages, turn: 1, step: 1, signal }, async () => ({ kind: 'enter', messages }));
  const initial = await step([]);
  const catalogText = initial.messages.flatMap(m => m.content).filter(c => c.type === 'text').map(c => c.text).join('\n');
  for (const name of names) assert(catalogText.includes(name), `Missing model catalog: ${name}`);
  const pruner = new Pruner.ToolResultPruner(ctx);
  for (const name of names) {
    const skill = await ctx.skills.get(name, { cwd });
    const original = readFileSync(join(repo, 'skills', name, 'SKILL.md'), 'utf8');
    const body = original.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    assert.equal(skill.content.trim(), body);
    assert.equal(skill.source, 'user-dsh');
    assert.equal(skill.resourceBase.path, join(home, 'skills', name));
    const tool = ctx.tools.get('skill', agent);
    assert(tool, 'Official skill tool not registered');
    const loaded = await tool.execute({ name }, { agent, signal });
    assert.equal(loaded.content.trim(), body);
    const user = createUserMessage({ content: [{ type: 'text', text: `/${name}\nProbe explicit invocation.` }], source: { kind: 'user' } });
    const decision = await step([user]);
    const injected = decision.messages.find(m => m.source?.kind === 'skill-invocation' && m.source.name === name);
    assert(injected, 'Slash invocation did not inject instructions');
    const text = injected.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    assert(text.includes(body), 'Explicit injection omitted body');
    const refs = readdirSync(join(skill.resourceBase.path, 'references')).sort();
    for (const ref of refs) assert.equal(readFileSync(join(skill.resourceBase.path, 'references', ref), 'utf8'), readFileSync(join(repo, 'skills', name, 'references', ref), 'utf8'));
    const rendered = Registry.renderSkillContent(loaded);
    const result = { name, discovery: 'pass', catalog: 'pass', registryFullBody: 'pass', toolFullBody: 'pass', slashFullBody: 'pass', referencesReadable: refs, contentCharacters: [...body].length, renderedCharacters: [...rendered].length, bodySha256: createHash('sha256').update(body).digest('hex') };
    // Characterize the official pruner, not a model task or a full pressure/compaction run.
    const pruned = pruner.pruneContent([{ type: 'text', text: rendered }]);
    result.prunerProbe = pruned === null ? 'below threshold' : 'pruneContent returned a replacement';
    assert.equal(pruned !== null, name === 'crafting-reference-based-svg-assets');
    report.skills.push(result);
    console.log(`${name}: official catalog, registry, tool, slash injection and references PASS`);
  }
  const negative = await step([createUserMessage({ content: [{ type: 'text', text: 'What is 2 + 2?' }], source: { kind: 'user' } })]);
  assert(!negative.messages.some(m => m.source?.kind === 'skill-invocation'), 'Unrelated user text caused explicit invocation');
  report.negativeExplicitInjection = 'pass; does not test model selection';
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
} finally {
  await ctx.fiber.dispose();
  for (const [key, value] of Object.entries(envBefore)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  assert.equal(dirname(scratch), resolve(tmpdir()));
  assert(basename(scratch).startsWith('aws-dsh-runtime-'));
  rmSync(scratch, { recursive: true, force: true });
}
