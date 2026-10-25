// Real rc.2 ToolRuntime dispatch; no DeepSeek model is invoked by these tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, basename, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { WorkflowGate, sealEvidence } from '../../skills/proactive-skill-discovery/scripts/workflow-gate.mjs';
import { attachDshGate } from '../../skills/proactive-skill-discovery/scripts/dsh-guard.mjs';

test('the shipped gate blocks native DSH writes and unknown tools until actual prerequisites pass', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-workflow-gate-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith('dsh-workflow-gate-'));
    rmSync(root, { recursive: true, force: true });
  });
  const key = randomBytes(32);
  const gate = new WorkflowGate({ task: 'native-dsh', revision: 1, key, root });
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime);
  t.after(() => ctx.fiber.dispose());
  let bodyCalls = 0;
  const marker = join(root, 'marker.txt');
  for (const name of ['write_artifact', 'unknown_bypass']) ctx.tools.register({
    name, description: 'Controlled test marker writer.', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => { bodyCalls++; writeFileSync(marker, 'actual-native-body'); return 'wrote'; },
  });
  let researchCalls = 0;
  ctx.tools.register({ name: 'read_candidate', description: 'Read only the controlled method file.',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => { researchCalls++; return readFileSync(join(root, 'SKILL.md'), 'utf8'); } });
  attachDshGate(ctx, gate, { write_artifact: 'draft', read_candidate: 'research' });
  let call = 0;
  const execute = (name) => ctx.tools.execute({ signal: new AbortController().signal,
    callId: ToolCallId(`native-gate-${++call}`), name, arguments: {} });
  assert.equal((await execute('write_artifact')).isError, true);
  assert.equal((await execute('read_candidate')).isError, true);
  assert.equal(researchCalls, 0);
  assert.equal(bodyCalls, 0); assert.equal(existsSync(marker), false);
  ctx.on('tools/pre-execute', () => Promise.resolve({ kind: 'allow' }), { prepend: true });
  assert.equal((await execute('unknown_bypass')).isError, true);
  assert.equal((await execute('write_artifact')).isError, true);
  assert.equal(bodyCalls, 0);
  let seq = 0;
  const receipt = (kind, data) => sealEvidence({ id: `e${++seq}`, seq, task: 'native-dsh', revision: 1, kind, data }, key);
  const advance = (stage, facts) => gate.advance({ task: 'native-dsh', revision: 1, stage,
    done: ['Observed real fixture prerequisites.'], missing: [], evidence: facts.map((x) => x.id), next_action: 'Next stage only.' }, facts);
  assert.equal(advance('scope', [receipt('authorization', { origin: 'user', instruction: 'Build a local fixture; choose the established method.' }),
    receipt('scope', { goal: 'verified fixture', requirements: ['marker'], constraints: ['local native dispatch'], stop_after: 'learning' })]).ok, true);
  const files = [['SKILL.md', '# Current fixture method\n'], ['LICENSE', 'MIT fixture body\n']].map(([path, content]) => {
    writeFileSync(join(root, path), content);
    return { path, bytes: Buffer.byteLength(content), returned_bytes: Buffer.byteLength(content), truncated: false,
      sha256: createHash('sha256').update(content).digest('hex') };
  });
  const discovery = [receipt('skill_search', { source: 'local-controlled-mirror', query: 'fixture', results: ['fixture'] }),
    receipt('skill_review', { candidate: 'fixture', version: 'fixture-v1', decision: 'adopt', reason: 'Actual current fixture coverage.', required_files: ['SKILL.md', 'LICENSE'], files }),
    receipt('skill_install', { candidate: 'fixture', version: 'fixture-v1', mode: 'reuse', files }),
    receipt('references', { sources: [{ url: 'fixture://a', observation: 'source identity' }, { url: 'fixture://b', observation: 'independent verification' }] })];
  assert.notEqual((await execute('read_candidate')).isError, true);
  assert.equal(researchCalls, 1);
  assert.equal(advance('discovery', discovery).ok, true);
  assert.equal((await execute('write_artifact')).isError, true); // Selection is still absent.
  assert.equal(bodyCalls, 0);
  assert.equal(advance('selection', [receipt('selection', { origin: 'user', mode: 'fixed', instruction: 'Use the established method.' })]).ok, true);
  assert.notEqual((await execute('write_artifact')).isError, true);
  assert.equal(bodyCalls, 1); assert.equal(existsSync(marker), true);
  assert.equal((await execute('unknown_bypass')).isError, true);
  assert.equal(bodyCalls, 1);
  gate.stop('User paused.');
  assert.equal((await execute('write_artifact')).isError, true);
  assert.equal(bodyCalls, 1);
});
