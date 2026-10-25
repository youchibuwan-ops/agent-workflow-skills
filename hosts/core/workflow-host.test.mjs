import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorkflowHost } from './workflow-host.mjs';

const sha = (x) => createHash('sha256').update(x).digest('hex');
const adopt = { candidate: 'current-export', decision: 'adopt', reason: 'Current physical method covers all scoped output fields.', covers: ['generation','sum','input_sha256'] };
async function setup(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trusted-workflow-host-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith('trusted-workflow-host-'));
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = join(root, 'workspace');
  const mirror = join(root, 'mirror/current-export');
  mkdirSync(workspace, { recursive: true }); mkdirSync(join(mirror, 'references'), { recursive: true });
  const input = '{"generation":"actual-current","values":[17,23]}\n';
  writeFileSync(join(workspace, 'input.json'), input);
  writeFileSync(join(mirror, 'SKILL.md'), '---\nname: current-export\ndescription: Use to export the current input.\n---\n# Method\nRead [method](references/method.md) and LICENSE; preserve current generation, sum all values and hash exact input bytes.\n');
  writeFileSync(join(mirror, 'references/method.md'), '# Exact current identity\nRead input.json raw bytes, preserve generation, sum values, hash SHA256; independently verify the output.\n');
  writeFileSync(join(mirror, 'LICENSE'), 'MIT controlled fixture license body\n');
  writeFileSync(join(root, 'ref-a.md'), '# Reference A\nCurrent identity is required.\n');
  writeFileSync(join(root, 'ref-b.md'), '# Reference B\nIndependent validation is required.\n');
  const cards = [];
  const config = { workspace, stateRoot: join(root, 'private-state'), taskId: 'host-task',
    userMessage: 'Use the selected JSON approach; execute and verify it autonomously. Do not change input.json.',
    contract: { requirements: ['generation', 'sum', 'input_sha256'], constraints: ['protected input'], stopAfter: 'learning',
      protectedInputs: ['input.json'], writeAllowlist: ['output.json'],
      selection: { mode: 'fixed', instruction: 'Use the selected JSON approach.' },
      feedback: { mode: 'delegated_verification', instruction: 'Execute technical validation autonomously.' },
      catalog: [{ id: 'current-export', path: mirror, version: 'fixture-current' }],
      references: [{ id: 'a', path: join(root, 'ref-a.md') }, { id: 'b', path: join(root, 'ref-b.md') }],
      validators: [{ id: 'current-json', type: 'json-export', input: 'input.json' }], learning: { required: false }, autoAdvance: false,
      ...overrides }, onCard: (card) => cards.push(card) };
  const host = await createWorkflowHost(config);
  const call = (name, args = {}) => host.dispatch(name, args, { callId: `test-${Math.random()}` });
  const checkpoint = async () => {
    const status = await call('workflow_status');
    return call('workflow_checkpoint', { done: ['Actual prerequisites inspected.'], evidence: status.state.evidence,
      next_action: 'Only the next permitted stage.' });
  };
  const inspect = async () => {
    assert.equal((await call('workflow_search_skills', { query: 'current export' })).ok, true);
    const opened = await call('workflow_open_skill', { candidate: 'current-export' });
    assert.equal(opened.ok, true);
    const proofs = [];
    for (const entry of opened.data.files) {
      const read = await call('workflow_read_source', { source: opened.data.source, path: entry.path });
      assert.equal(read.ok, true); proofs.push(read.data.source_receipt);
    }
    assert.equal((await call('workflow_confirm_sources', { receipts: proofs })).ok, true);
    assert.equal((await call('workflow_review_skill', { candidate: 'current-export', decision: 'adopt', reason: 'Covers current identity, sum and exact byte hash.', covers: ['generation', 'sum', 'input_sha256'] })).ok, true);
    assert.equal((await call('workflow_install_skill', { candidate: 'current-export' })).ok, true);
    for (const id of ['a', 'b']) {
      const reference = await call('workflow_open_reference', { reference: id });
      assert.equal(reference.ok, true);
      const proofs = [];
      for (const file of reference.data.files) {
        const read = await call('workflow_read_source', { source: reference.data.source, path: file.path });
        assert.equal(read.ok, true); proofs.push(read.data.source_receipt);
      }
      assert.equal((await call('workflow_confirm_sources', { receipts: proofs })).ok, true);
      assert.equal((await call('workflow_observe_reference', { source: reference.data.source, observation: `Actual ${id} source supports this task.` })).ok, true);
    }
    assert.equal((await checkpoint()).ok, true);
  };
  const output = JSON.stringify({ generation: 'actual-current', total: 40, input_sha256: sha(input) });
  return { root, workspace, mirror, host, call, checkpoint, inspect, cards, output, input, config };
}

test('host performs scope before model tools and rejects unknown tools or fabricated facts', async (t) => {
  const f = await setup(t);
  assert.equal(f.host.ready, true); assert.equal(f.host.stage, 'discovery');
  assert.equal(f.cards[0].report.stage, 'scope');
  assert.equal((await f.call('exec_command', { command: 'write a marker' })).ok, false);
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  const forged = await f.call('workflow_checkpoint', { done: ['all read'], evidence: ['fake'], next_action: 'skip', receipts: [{ passed: true }] });
  assert.equal(forged.ok, false); assert.equal(f.host.stage, 'discovery');
});

test('input reading returns actual bytes and hash while host/config inputs remain unavailable', async (t) => {
  const f = await setup(t);
  const result = await f.call('workflow_read_workspace', { path: 'input.json' });
  assert.equal(result.ok, true); assert.equal(result.data.content, f.input); assert.equal(result.data.sha256, sha(f.input));
  assert.equal((await f.call('workflow_read_workspace', { path: '../private-state' })).ok, false);
  assert.equal((await f.call('workflow_read_workspace', { path: '.agents/skills/host/SKILL.md' })).ok, false);
});

test('UTF-8 chunks join exactly without silent truncation or broken boundary acknowledgments', async (t) => {
  const f = await setup(t);
  const body = '汉字😀'.repeat(4000);
  writeFileSync(join(f.mirror, 'references/method.md'), body);
  await f.call('workflow_search_skills', { query: 'export' });
  const source = await f.call('workflow_open_skill', { candidate: 'current-export' });
  let offset = 0; let actual = '';
  while (offset < Buffer.byteLength(body)) {
    const chunk = await f.call('workflow_read_source', { source: source.data.source, path: 'references/method.md', offset, length: 11999 });
    assert.equal(chunk.ok, true); assert(chunk.data.end > offset);
    actual += chunk.data.content; offset = chunk.data.end;
  }
  assert.equal(actual, body);
});

test('download and a partial returned source never satisfy inspection or installation', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  await f.call('workflow_read_source', { source: opened.data.source, path: 'SKILL.md', length: 5 });
  const review = await f.call('workflow_review_skill', { candidate: 'current-export', decision: 'adopt', covers: ['generation','sum','input_sha256'], reason: 'Claimed sufficient.' });
  assert.equal(review.ok, false);
  assert.equal((await f.call('workflow_install_skill', { candidate: 'current-export' })).ok, false);
  assert.equal((await f.checkpoint()).ok, false);
});

test('precomputed same-response reads and review cannot mark unseen results inspected', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const replies = await Promise.all([
    ...opened.data.files.map((entry) => f.call('workflow_read_source', { source: opened.data.source, path: entry.path })),
    f.call('workflow_review_skill', adopt),
  ]);
  assert.equal(replies.at(-1).ok, false, 'A native scheduler executing a read before review is not evidence the model has received the read');
  assert(!f.host.exportAudit().events.some((e) => e.kind === 'skill_review'));
  const proofs = replies.slice(0, -1).map((r) => r.data.source_receipt);
  assert(proofs.every((p) => typeof p === 'string' && p.length >= 32));
  assert.equal((await f.call('workflow_confirm_sources', { receipts: proofs })).ok, true);
  assert.equal((await f.call('workflow_review_skill', adopt)).ok, true);
});

test('confirmation is atomic, opaque, one-use, source-bound and cannot acknowledge missing bytes', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: 'SKILL.md', length: 5 });
  const proof = read.data.source_receipt;
  assert.equal(typeof proof, 'string');
  assert(!JSON.stringify((await f.call('workflow_status')).data).includes(proof));
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof, 'made-up'] })).ok, false);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof] })).ok, true);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof] })).ok, false);
  assert.equal((await f.call('workflow_review_skill', adopt)).ok, false, 'Confirming five bytes must not approve a full bundle');
  const old = await f.call('workflow_read_source', { source: opened.data.source, path: 'LICENSE' });
  await f.call('workflow_open_skill', { candidate: 'current-export' });
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [old.data.source_receipt] })).ok, false);
});

test('references also require a proof from their actual returned body before observation', async (t) => {
  const f = await setup(t);
  const opened = await f.call('workflow_open_reference', { reference: 'a' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
  assert.equal((await f.call('workflow_observe_reference', { source: opened.data.source, observation: 'I claim I read it.' })).ok, false);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] })).ok, true);
  assert.equal((await f.call('workflow_observe_reference', { source: opened.data.source, observation: 'The actual current reference requires current identity.' })).ok, true);
});

test('a reference catalog ID is not a source handle; refusal identifies the usable current handle', async (t) => {
  const f = await setup(t);
  const opened = await f.call('workflow_open_reference', { reference: 'a' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
  await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] });
  const wrong = await f.call('workflow_observe_reference', { source: 'a', observation: 'The current reference supports the task.' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /source handle/i);
  assert.match(wrong.error, /reference:a/);
  assert.equal(wrong.state.references[0].source, 'reference:a');
  assert.equal(wrong.state.references[0].confirmed, true);
  assert.equal((await f.call('workflow_observe_reference', { source: wrong.state.references[0].source, observation: 'The returned current reference supports the task.' })).ok, true);
});

test('complete actual-source/readback/choice/write/validation/learning chain succeeds', async (t) => {
  const f = await setup(t);
  await f.inspect(); assert.equal(f.host.stage, 'selection');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'draft');
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, true);
  assert.equal((await f.checkpoint()).ok, false); // No independent validation yet.
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, true);
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'feedback');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'delivery');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'learning');
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal((await f.call('workflow_learn', { decision: 'no_increment', reason: 'The already inspected current export method covers the independently verified result.', evidence: ['current-export', 'output.json'] })).ok, true);
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.complete, true);
  assert.deepEqual(f.cards.filter((x) => x.kind === 'checkpoint').map((x) => x.report.stage),
    ['scope','discovery','selection','draft','feedback','delivery','learning']);
  assert.equal(readFileSync(join(f.workspace, 'input.json'), 'utf8'), f.input);
});

test('only trusted external input can choose a direction and accept feedback', async (t) => {
  const f = await setup(t, { selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await f.inspect();
  assert.equal((await f.checkpoint()).ok, false);
  const status = await f.call('workflow_status');
  assert.equal((await f.call('workflow_checkpoint', { done: ['I choose A'], evidence: status.state.evidence, next_action: 'draft', user_choice: 'A' })).ok, false);
  const options = ['A','B','C'].map((id) => ({ id, description: `Actual distinct approach ${id}`, sources: ['reference:a','reference:b'] }));
  assert.equal((await f.call('workflow_checkpoint', { done: ['Presented three supported approaches.'], evidence: [], next_action: 'Wait for the user.', options })).ok, false);
  await f.host.acceptUserMessage('/workflow choose A');
  assert.equal((await f.checkpoint()).ok, true);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal((await f.checkpoint()).ok, true);
  assert.equal((await f.checkpoint()).ok, false);
  await f.host.acceptUserMessage('/workflow accept');
  assert.equal((await f.checkpoint()).ok, true);
});

test('an unshown or invalid human choice and premature acceptance never cache authorization', async (t) => {
  const f = await setup(t, { selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await assert.rejects(f.host.acceptUserMessage('/workflow choose A'));
  await assert.rejects(f.host.acceptUserMessage('/workflow accept'));
  await f.inspect();
  const options = ['A','B','C'].map((id) => ({ id, description: `Actual distinct approach ${id}`, sources: ['reference:a','reference:b'] }));
  assert.equal((await f.call('workflow_checkpoint', { done: ['Present options'], evidence: [], next_action: 'Wait', options })).ok, false);
  await assert.rejects(f.host.acceptUserMessage('/workflow choose D'));
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  const forgedOptions = options.map((o) => ({ ...o, sources: ['made-up-reference'] }));
  const denied = await f.call('workflow_checkpoint', { done: ['Options'], evidence: [], next_action: 'Wait', options: forgedOptions });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /inspected|reference/i);
});

test('a validator never claims uncovered requirements or reveals a frozen answer to the actor', async (t) => {
  const f = await setup(t, { validators: [{ id: 'partial', type: 'exact-text', expected: 'hidden-oracle', covers: ['generation'] }] });
  assert(!f.host.instructions.includes('hidden-oracle'));
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: 'hidden-oracle' });
  assert.equal((await f.call('workflow_validate', { validator: 'partial', artifact: 'output.json' })).ok, true);
  await f.checkpoint(); await f.checkpoint();
  assert.equal(f.host.stage, 'delivery');
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal(f.host.complete, false);
});

test('external revision reopens the draft and invalidates old artifact validation and acceptance', async (t) => {
  const f = await setup(t, { feedback: { mode: 'required' } });
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  await f.checkpoint(); assert.equal(f.host.stage, 'feedback');
  await f.host.acceptUserMessage('Revise the draft and verify it again.');
  assert.equal(f.host.stage, 'draft');
  assert.equal((await f.checkpoint()).ok, false);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal((await f.checkpoint()).ok, true);
  assert.equal((await f.checkpoint()).ok, false);
  await f.host.acceptUserMessage('/workflow accept');
  assert.equal((await f.checkpoint()).ok, true);
});

test('protected input, traversal and failed verification are rejected without changing stages', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  for (const path of ['input.json', '../private-state/key', '.codex/config.toml', '.dsh/cordis.yml']) {
    assert.equal((await f.call('workflow_write', { path, content: 'bad' })).ok, false, path);
  }
  await f.call('workflow_write', { path: 'output.json', content: '{"generation":"wrong","total":40}' });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, false);
  assert.equal((await f.checkpoint()).ok, false); assert.equal(f.host.stage, 'draft');
  assert.equal(readFileSync(join(f.workspace, 'input.json'), 'utf8'), f.input);
});

test('independent JSON refusal identifies a mistaken field name without disclosing the oracle', async (t) => {
  const f = await setup(t); await f.inspect(); await f.checkpoint();
  const wrong = { generation: 'actual-current', sum: 40, input_sha256: sha(f.input) };
  await f.call('workflow_write', { path: 'output.json', content: JSON.stringify(wrong) });
  const result = await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(result.ok, false);
  assert.match(result.error, /total/);
  assert.match(result.error, /unexpected.*sum/i);
  assert(!result.error.includes(sha(f.input)));
  assert.equal(f.host.stage, 'draft');
});

test('external input/installed payload changes and an abort fail closed', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  writeFileSync(join(f.workspace, 'input.json'), 'changed externally');
  const result = await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal(result.ok, false); assert.equal(result.fatal, true); assert.equal(f.host.ready, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  const g = await setup(t);
  g.host.abort('controller failed');
  assert.equal((await g.call('workflow_search_skills', { query: 'export' })).ok, false);
  assert.equal(g.host.ready, false);
});

test('required real Skill maintenance cannot be waived with actor-authored no-increment text', async (t) => {
  const f = await setup(t, { learning: { required: true } });
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  await f.checkpoint(); await f.checkpoint(); await f.checkpoint();
  assert.equal(f.host.stage, 'learning');
  assert.equal((await f.call('workflow_learn', { decision: 'no_increment', reason: 'I say no changes.', evidence: ['output.json'] })).ok, false);
  assert.equal((await f.checkpoint()).ok, false); assert.equal(f.host.complete, false);
});

test('a declared stop boundary prevents real write handlers and reads after the boundary', async (t) => {
  const f = await setup(t, { stopAfter: 'selection' });
  await f.inspect(); await f.checkpoint();
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  assert.equal((await f.call('workflow_read_workspace', { path: 'input.json' })).ok, false);
});

test('correcting an artifact requires new validation and can then finish the draft checkpoint', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: '{"wrong":true}' });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, false);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, true);
  assert.equal((await f.checkpoint()).ok, true);
});

async function automaticDiscovery(f) {
  await f.call('workflow_search_skills', { query: 'current export' });
  const bundle = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const proofs = [];
  for (const file of bundle.data.files) proofs.push((await f.call('workflow_read_source', { source: bundle.data.source, path: file.path })).data.source_receipt);
  await f.call('workflow_confirm_sources', { receipts: proofs });
  await f.call('workflow_review_skill', adopt);
  await f.call('workflow_install_skill', { candidate: 'current-export' });
  for (const reference of ['a','b']) {
    const opened = await f.call('workflow_open_reference', { reference });
    const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
    await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] });
    await f.call('workflow_observe_reference', { source: opened.data.source, observation: `Actual source ${reference} supports current input and independent validation.` });
  }
}

test('host automatically emits ordered evidence cards without actor-authored checkpoint ceremonies', async (t) => {
  const f = await setup(t, { autoAdvance: true });
  await automaticDiscovery(f);
  assert.equal(f.host.stage, 'draft');
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal(f.host.stage, 'draft');
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(f.host.stage, 'learning');
  await f.call('workflow_learn', { decision: 'no_increment', reason: 'The fully inspected current-export method covers this independently validated output.', evidence: ['current-export','output.json'] });
  assert.equal(f.host.complete, true);
  assert.deepEqual(f.cards.filter((x) => x.kind === 'checkpoint').map((x) => x.report.stage), ['scope','discovery','selection','draft','feedback','delivery','learning']);
  assert(!f.host.exportAudit().events.some((e) => e.event === 'tool' && e.name === 'workflow_checkpoint'));
});

test('automatic reports still stop for actual user choice, current feedback and declared boundaries', async (t) => {
  const f = await setup(t, { autoAdvance: true, selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await automaticDiscovery(f); assert.equal(f.host.stage, 'selection');
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  const options = ['A','B','C'].map((id) => ({ id, description: `Current supported option ${id}`, sources: ['reference:a','reference:b'] }));
  await f.call('workflow_checkpoint', { done: ['Present actual choices'], evidence: [], next_action: 'Wait for user choice', options });
  assert(f.cards.some((c) => c.kind === 'options'));
  await f.host.acceptUserMessage('/workflow choose A'); assert.equal(f.host.stage, 'draft');
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(f.host.stage, 'feedback');
  await f.host.acceptUserMessage('/workflow accept'); assert.equal(f.host.stage, 'learning');
  const stopped = await setup(t, { autoAdvance: true, stopAfter: 'selection' });
  await automaticDiscovery(stopped);
  assert.equal((await stopped.call('workflow_write', { path: 'output.json', content: stopped.output })).ok, false);
  assert(!existsSync(join(stopped.workspace, 'output.json')));
});
