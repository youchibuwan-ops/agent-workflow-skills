import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { WorkflowGate, sealEvidence, STAGES } from '../skills/proactive-skill-discovery/scripts/workflow-gate.mjs';

const sha = (data) => createHash('sha256').update(data).digest('hex');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'workflow-gate-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith('workflow-gate-'));
    rmSync(root, { recursive: true, force: true });
  });
  const key = randomBytes(32);
  const gate = new WorkflowGate({ task: 'task-1', revision: 1, key, root });
  let seq = 0;
  const receipt = (kind, data = {}) => sealEvidence({ id: `e${++seq}`, seq, task: 'task-1', revision: 1, kind, data }, key);
  const file = (name, content) => {
    writeFileSync(join(root, name), content);
    return { path: name, sha256: sha(content), bytes: Buffer.byteLength(content), returned_bytes: Buffer.byteLength(content), truncated: false };
  };
  const method = file('SKILL.md', '# Fixture method\nUse the current input and emit its sum.\n');
  const license = file('LICENSE', 'MIT fixture license body\n');
  const script = file('method.py', 'print(17 + 23)\n');
  const output = file('output.txt', '40\n');
  const facts = {
    scope: [receipt('authorization', { origin: 'user', instruction: 'Make a verified report; choose autonomously.' }),
      receipt('scope', { goal: 'verified report', requirements: ['sum'], constraints: ['local fixture only'], stop_after: 'learning' })],
    discovery: [receipt('skill_search', { source: 'github', query: 'current-input reporting skill', results: ['fixture'] }),
      receipt('skill_review', { candidate: 'fixture', version: 'a'.repeat(40), required_files: ['SKILL.md', 'LICENSE', 'method.py'],
        files: [method, license, script], decision: 'adopt', reason: 'Covers sum of the current two values.' }),
      receipt('skill_install', { candidate: 'fixture', version: 'a'.repeat(40), files: [method, license, script], mode: 'install' }),
      receipt('references', { sources: [{ url: 'https://example.org/a', observation: 'sum with explicit current-input identity' },
        { url: 'https://example.org/b', observation: 'validate the independently calculated result' }] })],
    selection: [receipt('selection', { origin: 'user', mode: 'delegated', instruction: 'choose autonomously' })],
    draft: [receipt('application', { candidate: 'fixture', version: 'a'.repeat(40), method: 'Sum current input.', artifact: output }),
      receipt('validation', { artifact: output, command: 'independent calculation', exit_code: 0, observation: '17 + 23 = 40' })],
    feedback: [receipt('feedback', { origin: 'user', decision: 'accept', artifact: output, instruction: 'This output meets the requested result.' })],
    delivery: [receipt('delivery', { artifact: output, requirements: [{ requirement: 'sum', result: 'pass', evidence: 'independent sum' }] })],
    learning: [receipt('learning', { decision: 'no_increment', reason: 'Existing method already covers current-input identity and independent sum.', evidence: ['method.py', 'output.txt'] })],
  };
  const report = (stage, evidence = facts[stage]) => ({ task: 'task-1', revision: 1, stage,
    done: [`${stage} performed`], missing: [], next_action: 'Proceed only to the next declared stage.', evidence: evidence.map((x) => x.id) });
  const passThrough = (last) => {
    for (const stage of STAGES.slice(0, STAGES.indexOf(last) + 1)) assert.equal(gate.advance(report(stage), facts[stage]).ok, true, stage);
  };
  return { gate, key, root, receipt, file, facts, report, passThrough };
}

test('all seven stages require signed host evidence and advance in order', (t) => {
  const f = fixture(t);
  f.passThrough('learning');
  assert.equal(f.gate.stage, 'complete');
  assert.equal(f.gate.advance(f.report('learning'), f.facts.learning).ok, false);
});

test('a direct jump to draft never executes the action body', (t) => {
  const f = fixture(t);
  let ran = 0;
  assert.equal(f.gate.advance(f.report('draft'), f.facts.draft).ok, false);
  assert.throws(() => f.gate.run('draft', () => ++ran), /stage/i);
  assert.equal(ran, 0);
});

test('search hits and a late adoption claim cannot replace reviewed and installed files', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  const partial = f.facts.discovery.filter((x) => x.kind !== 'skill_review' && x.kind !== 'skill_install');
  assert.equal(f.gate.advance(f.report('discovery', partial), partial).ok, false);
  assert.equal(f.gate.stage, 'discovery');
});

test('a truncated source, missing referenced script or license body blocks discovery', (t) => {
  for (const mutation of ['truncated', 'missing-script', 'missing-license']) {
    const f = fixture(t);
    f.passThrough('scope');
    const bad = f.facts.discovery.map((entry) => {
      if (entry.kind !== 'skill_review') return entry;
      const copy = structuredClone(entry);
      delete copy.signature;
      if (mutation === 'truncated') copy.data.files[0].returned_bytes -= 1;
      if (mutation === 'missing-script') copy.data.files = copy.data.files.filter((x) => x.path !== 'method.py');
      if (mutation === 'missing-license') copy.data.files = copy.data.files.filter((x) => x.path !== 'LICENSE');
      return sealEvidence(copy, f.key);
    });
    assert.equal(f.gate.advance(f.report('discovery', bad), bad).ok, false, mutation);
  }
});

test('actor-authored pass fields, forged signatures and another task cannot close a stage', (t) => {
  for (const mutate of [(x) => ({ ...x, signature: 'forged' }), (x) => ({ ...x, task: 'other-task' })]) {
    const f = fixture(t);
    const bad = f.facts.scope.map(mutate);
    assert.equal(f.gate.advance({ ...f.report('scope', bad), passed: true }, bad).ok, false);
  }
});

test('a missing visible output field keeps the stage open', (t) => {
  const f = fixture(t);
  const report = f.report('scope');
  delete report.missing;
  assert.equal(f.gate.advance(report, f.facts.scope).ok, false);
  assert.equal(f.gate.stage, 'scope');
});

test('model choice is rejected while a genuine prior user choice is accepted without reasking', (t) => {
  const f = fixture(t);
  f.passThrough('discovery');
  const modelChoice = [f.receipt('selection', { origin: 'assistant', mode: 'delegated', instruction: 'I prefer this.' })];
  assert.equal(f.gate.advance(f.report('selection', modelChoice), modelChoice).ok, false);
  assert.equal(f.gate.advance(f.report('selection'), f.facts.selection).ok, true);
});

test('changed bytes invalidate previous source and artifact evidence', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  writeFileSync(join(f.root, 'SKILL.md'), '# A different current method\n');
  assert.equal(f.gate.advance(f.report('discovery'), f.facts.discovery).ok, false);
  const g = fixture(t);
  g.passThrough('draft');
  writeFileSync(join(g.root, 'output.txt'), 'stale preview\n');
  assert.equal(g.gate.advance(g.report('feedback'), g.facts.feedback).ok, false);
});

test('pre-use chronology is mandatory and receipts cannot be backdated after application', (t) => {
  const f = fixture(t);
  f.passThrough('selection');
  const copy = structuredClone(f.facts.draft[0]);
  delete copy.signature;
  copy.seq = 1;
  const bad = [sealEvidence(copy, f.key), f.facts.draft[1]];
  assert.equal(f.gate.advance(f.report('draft', bad), bad).ok, false);
});

test('rejected candidates need no installation; a concrete rejection does not count as adoption', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  const reject = structuredClone(f.facts.discovery.find((x) => x.kind === 'skill_review'));
  delete reject.signature;
  reject.data.decision = 'reject';
  reject.data.reason = 'Unsupported host API; no eligible method established.';
  const facts = [...f.facts.discovery.filter((x) => !['skill_install', 'skill_review'].includes(x.kind)), sealEvidence(reject, f.key)];
  const result = f.gate.advance(f.report('discovery', facts), facts);
  assert.equal(result.ok, false);
  assert(result.errors.some((x) => /adopt|覆盖|method/i.test(x)));
});

test('a user stop blocks all actions and a new requirement reopens before production', (t) => {
  const f = fixture(t);
  f.passThrough('selection');
  f.gate.stop('User paused this task.');
  assert.throws(() => f.gate.run('draft', () => 'should not run'), /stop/i);
  assert.equal(f.gate.advance(f.report('draft'), f.facts.draft).ok, false);
  const g = fixture(t);
  g.passThrough('selection');
  g.gate.reopen('discovery', 'New source/capability requirement.');
  assert.equal(g.gate.stage, 'discovery');
  assert.throws(() => g.gate.run('draft', () => 'should not run'), /stage/i);
});

test('guard is fail-closed for unknown tools and direct writes before draft', (t) => {
  const f = fixture(t);
  const guard = f.gate.guard({ read_scope_rules: 'scope', read_file: 'research', write_file: 'draft' });
  assert.equal(typeof guard({ name: 'write_file' }), 'string');
  assert.equal(typeof guard({ name: 'unknown_bypass' }), 'string');
  assert.equal(typeof guard({ name: 'read_file' }), 'string');
  assert.equal(guard({ name: 'read_scope_rules' }), undefined);
  f.passThrough('scope');
  assert.equal(guard({ name: 'read_file' }), undefined);
  assert.equal(f.gate.advance(f.report('discovery'), f.facts.discovery).ok, true);
  assert.equal(f.gate.advance(f.report('selection'), f.facts.selection).ok, true);
  assert.equal(guard({ name: 'write_file' }), undefined);
  f.gate.stop('User stop.');
  assert.equal(typeof guard({ name: 'read_file' }), 'string');
});

test('a different installed payload cannot borrow the reviewed candidate version', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  const bad = f.facts.discovery.map((entry) => {
    if (entry.kind !== 'skill_install') return entry;
    const copy = structuredClone(entry);
    delete copy.signature;
    copy.data.files[0] = { ...f.file('different-SKILL.md', '# Different unreviewed method\n'), relative_path: 'SKILL.md' };
    return sealEvidence(copy, f.key);
  });
  assert.equal(f.gate.advance(f.report('discovery', bad), bad).ok, false);
});

test('review before this-task search cannot close discovery', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  const bad = f.facts.discovery.map((entry) => {
    if (entry.kind !== 'skill_search') return entry;
    const copy = structuredClone(entry); delete copy.signature; copy.seq += 30;
    return sealEvidence(copy, f.key);
  });
  assert.equal(f.gate.advance(f.report('discovery', bad), bad).ok, false);
});

test('feedback and delivery must bind the actual current draft, not another valid file', (t) => {
  for (const phase of ['feedback', 'delivery']) {
    const f = fixture(t);
    f.passThrough(phase === 'feedback' ? 'draft' : 'feedback');
    const other = f.file('unrelated.txt', 'plausible but different output\n');
    const copy = structuredClone(f.facts[phase][0]); delete copy.signature; copy.data.artifact = other;
    const bad = [sealEvidence(copy, f.key)];
    assert.equal(f.gate.advance(f.report(phase, bad), bad).ok, false);
  }
});

test('the declared user stop-after-selection boundary denies draft even with otherwise valid proofs', (t) => {
  const f = fixture(t);
  const copy = structuredClone(f.facts.scope[1]); delete copy.signature; copy.data.stop_after = 'selection';
  f.facts.scope[1] = sealEvidence(copy, f.key);
  f.passThrough('selection');
  assert.equal(f.gate.advance(f.report('draft'), f.facts.draft).ok, false);
  let ran = false;
  assert.throws(() => f.gate.run('draft', () => { ran = true; }), /stop/i);
  assert.equal(ran, false);
  assert.equal(typeof f.gate.guard({ write_file: 'draft' })({ name: 'write_file' }), 'string');
});

test('future-stage evidence cannot be submitted in an earlier checkpoint', (t) => {
  const f = fixture(t);
  const bad = [...f.facts.scope, f.facts.selection[0]];
  assert.equal(f.gate.advance(f.report('scope', bad), bad).ok, false);
});

test('a validated first output cannot cover an unvalidated second output', (t) => {
  const f = fixture(t);
  f.passThrough('selection');
  const second = f.file('second-output.txt', 'unvalidated second output\n');
  const extra = f.receipt('application', { candidate: 'fixture', version: 'a'.repeat(40), method: 'Write another output.', artifact: second });
  const bad = [...f.facts.draft, extra];
  assert.equal(f.gate.advance(f.report('draft', bad), bad).ok, false);
});

test('a failing or unrelated behavior test cannot close actual skill maintenance', (t) => {
  for (const testResult of [
    { name: 'regression', exit_code: 1, observation: 'failed', source_sha256: ['current'], seq: 40 },
    { name: 'regression', exit_code: 0, observation: 'passed on an older source', source_sha256: ['old'], seq: 40 },
  ]) {
    const f = fixture(t);
    f.passThrough('delivery');
    const changed = f.file('maintained-SKILL.md', '# Maintained current skill\n');
    const evidence = [f.receipt('learning', { decision: 'updated', reason: 'Fix reproducible current identity failure.',
      evidence: ['maintained-SKILL.md'], files: [changed], before_sha256: sha('previous skill'),
      changed_seq: 39, behavior_tests: [testResult] })];
    assert.equal(f.gate.advance(f.report('learning', evidence), evidence).ok, false);
  }
});

test('maintenance with a changed file and a later passing version-bound behavior test can close', (t) => {
  const f = fixture(t);
  f.passThrough('delivery');
  const file = f.file('maintained-SKILL.md', '# Actually maintained method\n');
  const entry = f.receipt('learning', { decision: 'updated', reason: 'Verified identity correction.', evidence: [file.path],
    files: [file], before_sha256: sha('old'), changed_seq: 0, behavior_tests: [] });
  delete entry.signature;
  entry.data.changed_seq = entry.seq - 2;
  entry.data.behavior_tests = [{ name: 'fresh-context task and adjacent control', exit_code: 0,
    observation: 'Current output and control both independently verified.', source_sha256: [file.sha256], seq: entry.seq - 1 }];
  const facts = [sealEvidence(entry, f.key)];
  assert.equal(f.gate.advance(f.report('learning', facts), facts).ok, true);
});

test('malformed actor records fail closed with a rejection instead of crashing', (t) => {
  for (const mutate of [(report) => ({ ...report, evidence: {} }), (report) => ({ ...report, evidence: 42 })]) {
    const f = fixture(t);
    let result;
    assert.doesNotThrow(() => { result = f.gate.advance(mutate(f.report('scope')), f.facts.scope); });
    assert.equal(result.ok, false);
    assert.equal(f.gate.stage, 'scope');
  }
});

test('delivery cannot silently omit a requirement frozen at scope', (t) => {
  const f = fixture(t);
  const copy = structuredClone(f.facts.scope[1]); delete copy.signature;
  copy.data.requirements = ['sum', 'generation'];
  f.facts.scope[1] = sealEvidence(copy, f.key);
  f.passThrough('feedback');
  assert.equal(f.gate.advance(f.report('delivery'), f.facts.delivery).ok, false);
});

test('zero-byte source or license evidence cannot stand in for full inspection', (t) => {
  const f = fixture(t);
  f.passThrough('scope');
  writeFileSync(join(f.root, 'LICENSE'), '');
  const empty = { path: 'LICENSE', bytes: 0, returned_bytes: 0, truncated: false, sha256: sha('') };
  const facts = f.facts.discovery.map((entry) => {
    if (!['skill_review', 'skill_install'].includes(entry.kind)) return entry;
    const copy = structuredClone(entry); delete copy.signature;
    copy.data.files = copy.data.files.map((x) => x.path === 'LICENSE' ? empty : x);
    return sealEvidence(copy, f.key);
  });
  assert.equal(f.gate.advance(f.report('discovery', facts), facts).ok, false);
});
