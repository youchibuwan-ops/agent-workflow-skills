// The host owns the key, evidence collector and this instance. Actor reports are untrusted.
// MIT; no dependencies. This checks process evidence, never artistic/semantic quality.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const STAGES = Object.freeze(['scope', 'discovery', 'selection', 'draft', 'feedback', 'delivery', 'learning']);
const REQUIRED = Object.freeze({ scope: ['authorization', 'scope'],
  discovery: ['skill_search', 'skill_review', 'skill_install', 'references'],
  selection: ['selection'], draft: ['application', 'validation'], feedback: ['feedback'],
  delivery: ['delivery'], learning: ['learning'] });
const text = (x) => typeof x === 'string' && x.trim().length > 0;
const list = (x) => Array.isArray(x) && x.length > 0;
const canonical = (x) => Array.isArray(x) ? `[${x.map(canonical).join(',')}]`
  : x && typeof x === 'object' ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(',')}}`
    : JSON.stringify(x);
export function sealEvidence(event, key) {
  const body = structuredClone(event);
  delete body.signature;
  return { ...body, signature: createHmac('sha256', key).update(canonical(body)).digest('hex') };
}

export class WorkflowGate {
  #key; #task; #revision; #root; #index = 0; #stop = null; #accepted = []; #lastSeq = 0; #stopAfter = 'learning';
  constructor({ task, revision, key, root }) {
    if (!text(task) || !Number.isSafeInteger(revision) || revision < 1 || !key || key.length < 32) {
      throw new Error('Host task, positive revision and a private key of at least 32 bytes are required');
    }
    this.#task = task; this.#revision = revision; this.#key = Buffer.from(key); this.#root = realpathSync(root);
  }
  get stage() { return STAGES[this.#index] ?? 'complete'; }
  get revision() { return this.#revision; }
  #boundary() { return this.#index > STAGES.indexOf(this.#stopAfter); }
  stop(reason) { if (!text(reason)) throw new Error('Stop reason required'); this.#stop = reason; }
  reopen(stage, reason) {
    const index = STAGES.indexOf(stage);
    if (index < 0 || index > this.#index || !text(reason)) throw new Error('Reopen an existing or earlier stage with a concrete reason');
    if (this.#stop) throw new Error('Stopped task requires a separate, explicit user resume');
    this.#accepted = this.#accepted.filter((x) => STAGES.indexOf(x.stage) < index);
    this.#index = index;
    this.#revision += 1;
  }
  #file(entry, errors) {
    try {
      if (!entry || !text(entry.path) || isAbsolute(entry.path)) throw new Error('Expected a workspace-relative evidence path');
      const path = realpathSync(resolve(this.#root, entry.path));
      const rel = relative(this.#root, path);
      if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('Evidence escaped the declared root');
      const bytes = readFileSync(path);
      if (entry.truncated !== false || entry.bytes !== bytes.length || entry.returned_bytes !== bytes.length
          || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Changed, missing or truncated evidence');
    } catch (error) { errors.push(`${entry?.path ?? 'file'}: ${error.message}`); }
  }
  #files(event, errors) {
    for (const file of event.data.files ?? []) this.#file(file, errors);
    if (event.data.artifact) this.#file(event.data.artifact, errors);
  }
  #fresh(errors) { for (const item of this.#accepted) this.#files(item.event, errors); }
  #validReceipt(event, errors) {
    if (!event || !text(event.id) || !text(event.kind) || !event.data || typeof event.data !== 'object') {
      errors.push('Malformed host receipt'); return false;
    }
    const expected = sealEvidence(event, this.#key).signature;
    const actual = typeof event.signature === 'string' ? event.signature : '';
    if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) errors.push(`Untrusted evidence: ${event.id}`);
    if (event.task !== this.#task || event.revision !== this.#revision) errors.push(`Wrong task/revision: ${event.id}`);
    if (!Number.isSafeInteger(event.seq) || event.seq <= this.#lastSeq) errors.push(`Evidence chronology failed: ${event.id}`);
    this.#files(event, errors);
    return true;
  }
  advance(report, receipts) {
    try { return this.#advance(report, receipts); }
    catch { return { ok: false, stage: this.stage, errors: ['Malformed checkpoint or host receipt; execution remains blocked.'], next_action: 'Repair the malformed input.' }; }
  }
  #advance(report, receipts) {
    const errors = [];
    if (this.#stop) errors.push(`Stopped: ${this.#stop}`);
    if (this.#boundary()) errors.push(`User stop boundary reached: ${this.#stopAfter}`);
    if (!report || report.task !== this.#task || report.revision !== this.#revision || report.stage !== this.stage || this.stage === 'complete') errors.push('Wrong task/revision/stage; skipping or replay is forbidden');
    if (!list(report?.done) || !report.done.every(text) || !Array.isArray(report?.missing)
        || !text(report?.next_action) || !list(report?.evidence)) errors.push('Required checkpoint output: done, missing, next_action, evidence');
    if (report?.missing?.length) errors.push('Missing prerequisites remain open');
    if (!Array.isArray(receipts)) errors.push('Host receipts required');
    this.#fresh(errors);
    const incoming = Array.isArray(receipts) ? receipts : [];
    const ids = new Set();
    const seqs = new Set();
    for (const event of incoming) {
      this.#validReceipt(event, errors);
      if (!(REQUIRED[this.stage] ?? []).includes(event.kind)) errors.push(`Evidence belongs to another stage: ${event.kind}`);
      if (ids.has(event.id) || seqs.has(event.seq)) errors.push('Duplicate evidence ID/sequence');
      ids.add(event.id); seqs.add(event.seq);
      if (!report?.evidence?.includes(event.id)) errors.push(`Evidence missing from visible checkpoint: ${event.id}`);
    }
    for (const id of report?.evidence ?? []) if (!ids.has(id)) errors.push(`No actual host receipt for claim: ${id}`);
    const by = (kind) => incoming.filter((x) => x.kind === kind);
    for (const kind of REQUIRED[this.stage] ?? []) if (!by(kind).length) errors.push(`Missing prerequisite: ${kind}`);
    for (const event of incoming) {
      const d = event.data ?? {};
      if (['authorization', 'selection', 'feedback'].includes(event.kind) && d.origin !== 'user') errors.push(`Actual user evidence required: ${event.kind}`);
      switch (event.kind) {
        case 'authorization': if (!text(d.instruction)) errors.push('User instruction required'); break;
        case 'scope': if (!text(d.goal) || !list(d.requirements) || !d.requirements.every(text)
          || new Set(d.requirements).size !== d.requirements.length || !Array.isArray(d.constraints)
          || !STAGES.includes(d.stop_after)) errors.push('Incomplete scope/requirement IDs or unknown stop boundary'); break;
        case 'skill_search': if (!text(d.source) || !text(d.query) || !Array.isArray(d.results)) errors.push('Actual source/query/results required'); break;
        case 'skill_review': {
          if (!text(d.candidate) || !text(d.version) || !text(d.reason) || !['adopt', 'reject'].includes(d.decision)
              || !list(d.required_files) || !list(d.files)) errors.push('Incomplete source/license/scope review');
          for (const path of d.required_files ?? []) if (!d.files?.some((x) => x.path === path)) errors.push(`Missing required source/license/resource: ${path}`);
          if (!d.files?.some((x) => /(^|[/\\])SKILL\.md$/.test(x.path) && x.bytes > 0)
              || !d.files?.some((x) => /(^|[/\\])(?:LICEN[CS]E|COPYING)(?:[._-][^/\\]+)?$/i.test(x.path) && x.bytes > 0)) errors.push('Full nonempty Skill and applicable license bodies required');
          if (!by('skill_search').some((x) => x.seq < event.seq && x.data.results.includes(d.candidate))) errors.push('Current candidate search must precede this review');
          break;
        }
        case 'skill_install': {
          const reviews = by('skill_review');
          if (!['install', 'reuse'].includes(d.mode) || !list(d.files) || !reviews.some((x) => x.data.decision === 'adopt'
              && x.data.candidate === d.candidate && x.data.version === d.version && x.seq < event.seq)) errors.push('Installed/read-back method must match a reviewed adopted candidate before use');
          const review = reviews.find((x) => x.data.decision === 'adopt' && x.data.candidate === d.candidate && x.data.version === d.version);
          const manifest = (files) => (files ?? []).map((x) => [x.relative_path ?? x.path, x.sha256, x.bytes]).sort((a, b) => a[0].localeCompare(b[0]));
          if (canonical(manifest(review?.data.files)) !== canonical(manifest(d.files))) errors.push('Installed payload differs from the reviewed complete manifest');
          break;
        }
        case 'references': if (!list(d.sources) || d.sources.length < 2 || new Set(d.sources.map((x) => x.url)).size < 2
          || !d.sources.every((x) => text(x.url) && text(x.observation))) errors.push('Multiple actually inspected reference sources required'); break;
        case 'selection':
          if (!text(d.instruction) || !['chosen', 'delegated', 'fixed'].includes(d.mode)) errors.push('Actual choice or explicit prior delegation required');
          if (d.mode === 'chosen' && (!text(d.selected) || !list(d.options) || !d.options.includes(d.selected))) errors.push('Chosen option must match the shown options');
          break;
        case 'application': {
          const adopted = this.#accepted.filter((x) => x.event.kind === 'skill_install').map((x) => x.event);
          if (!d.artifact || !text(d.method) || !adopted.some((x) => x.data.candidate === d.candidate && x.data.version === d.version && x.seq < event.seq)) errors.push('Actual application of the inspected installed method required');
          break;
        }
        case 'validation': if (!d.artifact || !text(d.command) || d.exit_code !== 0 || !text(d.observation)
          || !by('application').some((x) => x.data.artifact?.sha256 === d.artifact.sha256 && x.seq < event.seq)) errors.push('Current artifact must be independently checked after application'); break;
        case 'feedback':
          if (!d.artifact || !['accept', 'delegated_verification'].includes(d.decision) || !text(d.instruction)) errors.push('Unresolved feedback/revision cannot advance');
          if (!this.#accepted.some((x) => x.event.kind === 'application' && x.event.data.artifact?.sha256 === d.artifact?.sha256
            && x.event.data.artifact?.path === d.artifact?.path)) errors.push('Feedback is not bound to the actual draft');
          if (!this.#accepted.some((x) => x.event.kind === 'validation' && x.event.data.artifact?.sha256 === d.artifact?.sha256
            && x.event.data.artifact?.path === d.artifact?.path)) errors.push('Feedback artifact has no successful current validation');
          break;
        case 'delivery':
          if (!d.artifact || !list(d.requirements) || !d.requirements.every((x) => text(x.requirement) && x.result === 'pass' && text(x.evidence))) errors.push('Every delivery requirement needs actual current-artifact verification');
          if (!this.#accepted.some((x) => x.event.kind === 'feedback' && x.event.data.artifact?.sha256 === d.artifact?.sha256
            && x.event.data.artifact?.path === d.artifact?.path)) errors.push('Delivery is not bound to the verified feedback artifact');
          {
            const expected = this.#accepted.find((x) => x.event.kind === 'scope')?.event.data.requirements ?? [];
            const actual = d.requirements?.map((x) => x.requirement) ?? [];
            if (actual.length !== expected.length || new Set(actual).size !== actual.length
              || expected.some((id) => !actual.includes(id))) errors.push('Delivery omits or substitutes a scoped requirement');
          }
          break;
        case 'learning':
          if (!text(d.reason) || !list(d.evidence) || !['updated', 'no_increment'].includes(d.decision)) errors.push('Actual maintenance or justified no-increment evidence required');
          if (d.decision === 'updated' && (!list(d.files) || !text(d.before_sha256) || d.files.every((x) => x.sha256 === d.before_sha256)
            || !list(d.behavior_tests))) errors.push('Maintenance requires changed current files and behavior tests');
          if (d.decision === 'updated' && (!Number.isSafeInteger(d.changed_seq) || !d.behavior_tests?.every((x) =>
            text(x.name) && x.exit_code === 0 && text(x.observation) && Number.isSafeInteger(x.seq)
            && x.seq > d.changed_seq && x.seq < event.seq && list(x.source_sha256)
            && d.files?.every((file) => x.source_sha256.includes(file.sha256))))) errors.push('Behavior tests must pass after, and bind, the actual maintained files');
          break;
        default: errors.push(`Unknown evidence kind: ${event.kind}`);
      }
    }
    if (this.stage === 'draft') for (const item of by('application')) {
      if (!by('validation').some((x) => x.seq > item.seq && x.data.exit_code === 0
        && x.data.artifact?.path === item.data.artifact?.path && x.data.artifact?.sha256 === item.data.artifact?.sha256)) {
        errors.push('Every produced artifact needs its own successful later validation');
      }
    }
    if (this.stage === 'discovery' && !by('skill_review').some((x) => x.data.decision === 'adopt')) errors.push('No adopted method covers the task; rejection alone is not completion');
    if (errors.length) return { ok: false, stage: this.stage, errors: [...new Set(errors)], next_action: 'Repair the earliest missing prerequisite; do not execute the dependent action.' };
    this.#accepted.push(...incoming.map((event) => ({ stage: this.stage, event: structuredClone(event) })));
    this.#lastSeq = Math.max(this.#lastSeq, ...incoming.map((x) => x.seq));
    if (this.stage === 'scope') this.#stopAfter = by('scope')[0].data.stop_after;
    this.#index += 1;
    return { ok: true, stage: this.stage, errors: [], next_action: this.stage === 'complete' ? 'Stop at the authorized delivery boundary.' : `Only ${this.stage} is next.` };
  }
  run(stage, action) {
    if (this.#stop) throw new Error(`Stopped: ${this.#stop}`);
    if (this.#boundary()) throw new Error(`User stop boundary reached: ${this.#stopAfter}`);
    const errors = [];
    this.#fresh(errors);
    if (stage !== this.stage || this.stage === 'complete' || errors.length) throw new Error(`Stage blocked: ${this.stage}; ${errors.join('; ')}`);
    if (typeof action !== 'function') throw new Error('Actual action callback required');
    return action();
  }
  guard(toolStages) {
    // Host-owned exact tool map. Never classify arbitrary shell as read-only research.
    const map = Object.freeze({ ...toolStages });
    return (execution) => {
      try {
        if (this.#stop) return `Stopped: ${this.#stop}`;
        if (this.#boundary()) return `User stop boundary reached: ${this.#stopAfter}`;
        const errors = [];
        this.#fresh(errors);
        if (errors.length) return `Stale prerequisite: ${errors.join('; ')}`;
        const permitted = Object.hasOwn(map, execution.name) ? map[execution.name] : null;
        if (permitted === 'research' && this.stage !== 'scope' && this.stage !== 'complete') return undefined;
        if (permitted && permitted === this.stage) return undefined;
        return `Stage ${this.stage}: tool ${execution.name} is not permitted`;
      } catch { return 'Stage check failed; execution denied'; }
    };
  }
}
