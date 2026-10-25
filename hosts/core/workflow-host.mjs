// Trusted host controller. Never expose this object, key, contract or collector as model tools.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, lstatSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, basename, isAbsolute, relative, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowGate, sealEvidence, STAGES } from '../../skills/proactive-skill-discovery/scripts/workflow-gate.mjs';
import { WORKFLOW_TOOL_SCHEMAS } from './tool-schemas.mjs';
export { WORKFLOW_TOOL_SCHEMAS };

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const inside = (root, path) => { const rel = relative(resolve(root), resolve(path)); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
const blocked = (message) => Object.assign(new Error(message), { business: true });
function safeRelative(value) {
  if (!nonempty(value) || value.includes('\0') || isAbsolute(value) || /^[a-z]:/i.test(value)) throw blocked('Expected a relative path');
  const path = value.replaceAll('\\', '/');
  if (path.split('/').some((part) => !part || part === '.' || part === '..') || path.includes(':')) throw blocked('Traversal or invalid path rejected');
  return path;
}
function regularFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '__pycache__'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw blocked('Symlinked Skill resources are not accepted');
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      if (files.length > 100) throw blocked('Bundle exceeds the reviewed resource limit');
    }
  };
  visit(root);
  return files;
}
function validate(value, schema, label = 'arguments') {
  if (schema.enum && !schema.enum.includes(value)) throw blocked(`${label}: invalid enum`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw blocked(`${label}: expected object`);
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw blocked(`${label}: missing ${key}`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw blocked(`${label}: unexpected field ${key}`);
      validate(value[key], schema.properties[key], `${label}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) throw blocked(`${label}: expected array`);
    for (const item of value) validate(item, schema.items, label);
  } else if (schema.type === 'string' && typeof value !== 'string') throw blocked(`${label}: expected string`);
  else if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw blocked(`${label}: invalid integer`);
}

class GuardedWorkflowHost {
  #config; #root; #workspace; #gate; #key = randomBytes(32); #seq = 0; #pending = []; #sources = new Map();
  #candidates = new Map(); #installed = new Map(); #protected = new Map(); #artifacts = new Map(); #validated = new Map();
  #audit = []; #failed = null; #ready = false; #options = []; #selection = null; #feedback = null;
  #queue = Promise.resolve(); #sourceReceipts = new Map();
  constructor(config) {
    if (!nonempty(config?.workspace) || !nonempty(config?.userMessage)) throw new Error('Trusted workspace and original external user message required');
    this.#workspace = realpathSync(config.workspace);
    this.#root = resolve(config.stateRoot ?? join(tmpdir(), `workflow-state-${randomBytes(12).toString('hex')}`));
    if (inside(this.#workspace, this.#root)) throw new Error('Trusted state must remain outside the actor workspace');
    mkdirSync(this.#root, { recursive: true });
    this.#root = realpathSync(this.#root);
    if (inside(this.#workspace, this.#root)) throw new Error('State symlink resolves into the actor workspace');
    if (config.installedRoot && inside(this.#workspace, config.installedRoot)) throw new Error('Managed installed Skills must remain outside the actor workspace');
    this.#config = { ...config, taskId: config.taskId ?? `task-${randomBytes(8).toString('hex')}`,
      contract: structuredClone(config.contract ?? {}) };
    this.#config.contract.requirements ??= ['user-task'];
    this.#config.contract.constraints ??= [];
    this.#config.contract.stopAfter ??= 'learning';
    this.#config.contract.protectedInputs ??= [];
    this.#config.contract.validators ??= [];
    this.#config.contract.catalog ??= [];
    this.#config.contract.references ??= [];
    this.#config.contract.selection ??= { mode: 'pending' };
    this.#config.contract.feedback ??= { mode: 'required' };
    this.#config.contract.learning ??= { required: false };
    this.#config.contract.autoAdvance ??= true;
    this.#selection = this.#config.contract.selection.mode !== 'pending' ? this.#config.contract.selection : null;
    this.#feedback = this.#config.contract.feedback.mode === 'delegated_verification' ? this.#config.contract.feedback : null;
    this.#gate = new WorkflowGate({ task: this.#config.taskId, revision: 1, key: this.#key, root: this.#root });
    for (const entry of this.#config.contract.catalog) this.#candidates.set(entry.id, structuredClone(entry));
    for (const path of this.#config.contract.protectedInputs) {
      const absolute = this.#workspaceFile(path, false);
      this.#protected.set(safeRelative(path), hash(readFileSync(absolute)));
    }
  }
  get toolSchemas() { return WORKFLOW_TOOL_SCHEMAS; }
  get stage() { return this.#gate.stage; }
  get complete() { return this.#ready && !this.#failed && this.stage === 'complete'; }
  get ready() { return this.#ready && !this.#failed; }
  get instructions() {
    return `Mandatory host workflow. Raw tools are unavailable. The host already emitted the authorized scope checkpoint. Use workflow_status for current stage and receipt IDs.\n`
      + `Discovery: search -> open Skill -> read ALL required file ranges -> confirm their returned source_receipt values with workflow_confirm_sources -> review applicability/license -> install/read back -> acquire/read/confirm/observe at least two references.\n`
      + `Reading a range returns its content and an unpredictable one-use source_receipt. After receiving those results, batch their receipts in workflow_confirm_sources. Precomputed read+review or read+observe calls do not count as inspection. The host never reveals challenges through status.\n`
      + `Checkpoint evidence must list host-issued IDs; do not submit receipts, pass fields or human authority. Use actual user choice/delegation.\n`
      + `At draft write allowed artifacts, then call the host validator. This preview refuses sandbox method execution. Call workflow_learn with concrete evidence before completion.\n`
      + (this.#config.contract.autoAdvance ? `Stage reports are automatic: after actual prerequisites are satisfied the HOST emits each ordered checkpoint and advances. Read the state returned by each tool; do not repeatedly call workflow_status/checkpoint or fill seven report forms. workflow_checkpoint is needed only to submit real unresolved selection options.\n`
        : `This trusted test contract uses manual stage requests: checkpoint draft, feedback, delivery and learning using host-issued evidence IDs.\n`)
      + `Correctable refusals keep the stage open. Do not claim completion while host.complete is false. Pending choice/feedback must be reported as waiting.\n`
      + `Original external user task:\n${this.#config.userMessage}\n`
      + `Host contract: ${JSON.stringify({ requirements: this.#config.contract.requirements, selection: this.#config.contract.selection,
        feedback: this.#config.contract.feedback, writeAllowlist: this.#config.contract.writeAllowlist,
        protectedInputs: this.#config.contract.protectedInputs, validators: this.#config.contract.validators.map(({ id, type, input, covers }) => ({ id, type, input, covers })),
        references: this.#config.contract.references.map((x) => ({ id: x.id, url: x.url, label: x.label })), learning: this.#config.contract.learning })}`;
  }
  async initialize() {
    this.#record('authorization', { origin: 'user', instruction: this.#config.userMessage });
    this.#record('scope', { goal: this.#config.userMessage, requirements: this.#config.contract.requirements,
      constraints: this.#config.contract.constraints, stop_after: this.#config.contract.stopAfter });
    this.#ready = true;
    const report = this.#report(['Captured original external user task, authorized workspace, complete requirement IDs and stopping point.']);
    const result = this.#gate.advance(report, this.#pending);
    if (!result.ok) throw new Error(`Host scope failed: ${result.errors.join('; ')}`);
    this.#pending = [];
    await this.#card({ kind: 'scope', report, enforcement: 'host_guarded' });
    await this.#card({ kind: 'checkpoint', report, result });
    this.#audit.push({ event: 'initialized', stage: this.stage });
    return this;
  }
  assertReady() { if (!this.ready) throw new Error(`Workflow host unavailable: ${this.#failed ?? 'not initialized'}`); return true; }
  abort(reason) { this.#failed = String(reason); this.#ready = false; this.#gate.stop(String(reason)); this.#audit.push({ event: 'aborted', reason: String(reason) }); }
  exportAudit() { return structuredClone({ task: this.#config.taskId, stage: this.stage, complete: this.complete, failed: this.#failed, events: this.#audit }); }
  #state() { return { task: this.#config.taskId, revision: this.#gate.revision, stage: this.stage, complete: this.complete,
    blockedReason: this.#failed, evidence: this.#pending.map((x) => x.id),
    candidates: [...this.#candidates.values()].map((x) => ({ id: x.id, version: x.version, installed: this.#installed.has(x.id) })),
    references: this.#config.contract.references.map((x) => { const source = this.#sources.get(`reference:${x.id}`);
      return { id: x.id, source: source?.id ?? null, confirmed: !!source && this.#fullyRead(source), observed: !!source?.observation }; }),
    validators: this.#config.contract.validators.map((x) => ({ id: x.id, type: x.type })),
    capabilities: { source_confirmation: 'returned-challenge', checkpoints: this.#config.contract.autoAdvance ? 'host-automatic' : 'manual-test-mode',
      acquisition: 'configured-local-only', method_execution: 'unavailable', skill_maintenance: 'no-increment-only', validators: ['json-export','exact-text'] },
    options: this.#options, needs_input: this.stage === 'selection' && !this.#selection || this.stage === 'feedback' && !this.#feedback };
  }
  async #card(card) {
    this.#audit.push({ event: 'card', ...structuredClone(card) });
    if (this.#config.onCard) await this.#config.onCard(structuredClone(card));
  }
  #record(kind, data) {
    const event = sealEvidence({ id: `receipt-${++this.#seq}`, seq: this.#seq, task: this.#config.taskId, revision: this.#gate.revision, kind, data }, this.#key);
    this.#pending.push(event);
    this.#audit.push({ event: 'observed', kind, id: event.id, seq: event.seq, stage: this.stage });
    return event;
  }
  #report(done, evidence = this.#pending.map((x) => x.id), next = 'Only the next host-approved stage.') {
    return { task: this.#config.taskId, revision: this.#gate.revision, stage: this.stage, done, evidence, missing: [], next_action: next };
  }
  #require(stage) { if (this.stage !== stage) throw blocked(`Current stage is ${this.stage}; ${stage} action denied before its prerequisites`); }
  #workspaceFile(path, writing) {
    const rel = safeRelative(path);
    if (rel.split('/').some((x) => ['.git', '.codex', '.agents', '.dsh', '.workflow-host', 'node_modules'].includes(x))
      || /(^|\/)(?:\.env(?:\..*)?|auth\.json|credentials(?:\..*)?)$/i.test(rel)) throw blocked('Host/configuration or credential paths are unavailable to the actor');
    const absolute = resolve(this.#workspace, rel);
    if (!inside(this.#workspace, absolute)) throw blocked('Workspace escape denied');
    let parent = writing ? dirname(absolute) : absolute;
    while (!existsSync(parent)) parent = dirname(parent);
    if (!inside(this.#workspace, realpathSync(parent))) throw blocked('Symlink escape denied');
    if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) throw blocked('Symlinked output denied');
    return absolute;
  }
  #snapshot(relativePath, bytes, bundlePath = relativePath) {
    const path = safeRelative(relativePath);
    const target = resolve(this.#root, path);
    if (!inside(this.#root, target)) throw new Error('Internal snapshot escape');
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    return { path, relative_path: bundlePath, bytes: bytes.length, returned_bytes: bytes.length, truncated: false, sha256: hash(bytes) };
  }
  #integrity() {
    for (const [path, digest] of this.#protected) if (hash(readFileSync(this.#workspaceFile(path, false))) !== digest) throw new Error(`Protected input changed externally: ${path}`);
    for (const entry of this.#installed.values()) {
      const names = regularFiles(entry.path).map((x) => relative(entry.path, x).replaceAll('\\', '/')).sort();
      if (JSON.stringify(names) !== JSON.stringify(entry.files.map((x) => x.path).sort())) throw new Error('Installed method manifest changed externally');
      for (const file of entry.files) if (hash(readFileSync(join(entry.path, file.path))) !== file.sha256) throw new Error('Installed method payload changed externally');
    }
    for (const source of this.#sources.values()) if (source.originRoot) {
      const names = regularFiles(source.originRoot).map((x) => relative(source.originRoot, x).replaceAll('\\', '/')).sort();
      if (JSON.stringify(names) !== JSON.stringify(source.files.map((x) => x.path).sort())
        || source.files.some((x) => hash(readFileSync(join(source.originRoot, x.path))) !== hash(x.bytes))) throw new Error('Acquired current source changed externally');
    } else if (source.originFile && hash(readFileSync(source.originFile)) !== hash(source.files[0].bytes)) throw new Error('Reference source changed externally');
    for (const [path, entry] of this.#artifacts) if (hash(readFileSync(this.#workspaceFile(path, false))) !== entry.sha256) throw new Error(`Artifact changed outside its guarded writer: ${path}`);
  }
  dispatch(name, args = {}, meta = {}) {
    const run = this.#queue.then(() => this.#performDispatch(name, args, meta));
    this.#queue = run.catch(() => {});
    return run;
  }
  async #performDispatch(name, args, meta) {
    try {
      this.assertReady();
      this.#integrity();
      const definition = WORKFLOW_TOOL_SCHEMAS.find((x) => x.name === name);
      if (!definition) throw blocked('Unknown or raw tool is not registered in this host');
      validate(args, definition.inputSchema);
      if (name !== 'workflow_status') {
        if (this.complete || STAGES.indexOf(this.stage) > STAGES.indexOf(this.#config.contract.stopAfter)) throw blocked('The authorized stopping boundary has been reached');
        this.#gate.run(this.stage, () => undefined);
      }
      this.#audit.push({ event: 'tool', name, callId: meta.callId, stage: this.stage });
      const data = await this.#dispatch(name, args);
      await this.#autoAdvance();
      return { ok: true, state: this.#state(), data };
    } catch (error) {
      if (error.business) return { ok: false, error: error.message, missing: [error.message], state: this.#state() };
      this.abort(`Collector/controller failure: ${error.message}`);
      return { ok: false, fatal: true, error: this.#failed, state: this.#state() };
    }
  }
  async #dispatch(name, args) {
    if (name === 'workflow_status') return this.#state();
    if (name === 'workflow_read_workspace') {
      const path = safeRelative(args.path);
      const allowed = this.#config.contract.readAllowlist;
      if (allowed && !allowed.includes(path)) throw blocked('Input is outside the host-approved read allowlist');
      const bytes = readFileSync(this.#workspaceFile(path, false));
      const chunk = this.#textChunk(bytes, args.offset ?? 0, args.length ?? 12000);
      this.#audit.push({ event: 'workspace_input_delivered', path, start: chunk.start, end: chunk.end, sha256: hash(bytes) });
      return { path, ...chunk, bytes: bytes.length, sha256: hash(bytes) };
    }
    if (name === 'workflow_checkpoint') return this.#checkpoint(args);
    if (name === 'workflow_search_skills') {
      this.#require('discovery');
      const candidates = [...this.#candidates.values()];
      if (!candidates.length) throw blocked('No approved catalog is configured; acquire a trusted source before continuing');
      this.#record('skill_search', { source: 'host-configured-catalog', query: args.query, results: candidates.map((x) => x.id) });
      return { candidates: candidates.map((x) => ({ id: x.id, version: x.version, source: x.url ?? 'configured-source' })) };
    }
    if (name === 'workflow_open_skill') {
      this.#require('discovery');
      const candidate = this.#candidates.get(args.candidate);
      if (!candidate) throw blocked('Candidate was not returned by this catalog');
      if (!this.#pending.some((x) => x.kind === 'skill_search' && x.data.results.includes(candidate.id))) throw blocked('Actual candidate search is required first');
      if (!candidate.path) throw blocked('This source needs the reviewed network acquisition provider');
      return this.#openBundle(candidate);
    }
    if (name === 'workflow_read_source') return this.#read(args);
    if (name === 'workflow_confirm_sources') return this.#confirmSources(args.receipts);
    if (name === 'workflow_review_skill') {
      this.#require('discovery');
      const source = this.#sources.get(`skill:${args.candidate}`);
      if (!source || !this.#fullyRead(source)) throw blocked('Full current Skill, referenced files and license have not all been received and confirmed; confirm the returned source_receipt values first');
      if (!nonempty(args.reason) || !args.covers.length) throw blocked('Concrete applicability and requirement coverage required');
      if (args.decision === 'adopt' && this.#config.contract.requirements.some((x) => !args.covers.includes(x))) throw blocked('Adopted method does not map every scoped requirement');
      const files = source.files.map((x) => this.#snapshot(`sources/${source.storage}/${x.path}`, x.bytes, x.path));
      source.review = { decision: args.decision, reason: args.reason, covers: args.covers };
      this.#record('skill_review', { candidate: args.candidate, version: source.version, required_files: files.map((x) => x.path),
        files, decision: args.decision, reason: args.reason });
      await this.#card({ kind: 'capabilities', candidate: args.candidate, version: source.version, files: source.files.map((x) => x.path),
        decision: args.decision, reason: args.reason, covers: args.covers, installed: false });
      return { reviewed: true };
    }
    if (name === 'workflow_install_skill') return this.#install(args.candidate);
    if (name === 'workflow_open_reference') {
      this.#require('discovery');
      const ref = this.#config.contract.references.find((x) => x.id === args.reference);
      if (!ref?.path) throw blocked('Reference is not a configured readable source');
      const bytes = readFileSync(ref.path);
      const source = { id: `reference:${ref.id}`, storage: `reference-${this.#sources.size}`, type: 'reference', reference: ref,
        originFile: ref.path,
        files: [{ path: basename(ref.path), bytes, coverage: [] }] };
      this.#sources.set(source.id, source);
      return { source: source.id, files: source.files.map((x) => ({ path: x.path, bytes: x.bytes.length })) };
    }
    if (name === 'workflow_observe_reference') {
      this.#require('discovery');
      const source = this.#sources.get(args.source);
      if (!source || source.type !== 'reference') throw blocked(`Unknown reference source handle ${JSON.stringify(args.source)}. Use the exact source returned by workflow_open_reference, not a catalog ID. Opened reference handles: ${[...this.#sources.values()].filter((x) => x.type === 'reference').map((x) => x.id).join(', ') || '(none)'}`);
      if (!this.#fullyRead(source) || !nonempty(args.observation)) throw blocked(`Receive and confirm the complete reference ${source.id} before claiming an observation`);
      source.observation = args.observation;
      const refs = [...this.#sources.values()].filter((x) => x.type === 'reference' && x.observation);
      if (refs.length >= 2) this.#record('references', { sources: refs.map((x) => ({ url: x.reference.url ?? `configured-reference:${x.reference.id}`, observation: x.observation })) });
      return { observed: true, inspected_references: refs.length };
    }
    if (name === 'workflow_write') return this.#write(args.path, args.content);
    if (name === 'workflow_apply_method') throw blocked('Method execution requires the OS sandbox provider; no raw execution fallback is allowed');
    if (name === 'workflow_validate') return this.#validateArtifact(args);
    if (name === 'workflow_learn') return this.#learn(args);
    throw blocked('Tool has no host-owned handler');
  }
  #openBundle(candidate) {
    const root = realpathSync(candidate.path);
    const files = regularFiles(root).map((path) => ({ path: relative(root, path).replaceAll('\\', '/'), bytes: readFileSync(path), coverage: [] }));
    if (!files.some((x) => x.path === 'SKILL.md') || !files.some((x) => /(^|\/)LICEN[CS]E(?:\.[^/]+)?$/i.test(x.path))) throw blocked('Complete Skill entry and applicable license body are required');
    if (files.reduce((n, x) => n + x.bytes.length, 0) > 4 * 1024 * 1024) throw blocked('Source bundle is too large for this reviewed acquisition policy');
    const source = { id: `skill:${candidate.id}`, storage: `skill-${this.#sources.size}`, type: 'skill', candidate: candidate.id,
      version: candidate.version ?? hash(Buffer.concat(files.map((x) => x.bytes))), files, originRoot: root };
    this.#sources.set(source.id, source);
    return { source: source.id, version: source.version, files: files.map((x) => ({ path: x.path, bytes: x.bytes.length })) };
  }
  #read(args) {
    const source = this.#sources.get(args.source);
    if (!source) throw blocked('Acquire an approved source first');
    const path = safeRelative(args.path);
    const file = source.files.find((x) => x.path === path);
    if (!file) throw blocked('Path is outside the acquired source manifest');
    const { start, end, content } = this.#textChunk(file.bytes, args.offset ?? 0, args.length ?? 12000);
    if (this.#sourceReceipts.size >= 4096) throw blocked('Too many unconfirmed source ranges; confirm received results first');
    const proof = `source-${randomBytes(32).toString('hex')}`;
    this.#sourceReceipts.set(proof, { source, file, start, end, revision: this.#gate.revision });
    this.#audit.push({ event: 'source_returned', source: source.id, path, start, end, sha256: hash(file.bytes) });
    return { source: source.id, path, content, start, end, total_bytes: file.bytes.length, sha256: hash(file.bytes),
      source_receipt: proof, complete: this.#fileRead(file) };
  }
  #confirmSources(proofs) {
    if (!proofs.length || proofs.length > 4096 || new Set(proofs).size !== proofs.length) throw blocked('Confirm a nonempty batch of distinct actual source receipts');
    const entries = proofs.map((proof) => {
      const entry = this.#sourceReceipts.get(proof);
      if (!entry || entry.revision !== this.#gate.revision || this.#sources.get(entry.source.id) !== entry.source)
        throw blocked('Unknown, consumed or stale source receipt; only values from actual current read results are accepted');
      return entry;
    });
    // Validate the entire batch before changing any coverage. A proof is a
    // challenge from the actual native tool result, not an actor-authored fact.
    for (let i = 0; i < entries.length; i++) {
      const { source, file, start, end } = entries[i];
      file.coverage.push([start, end]); this.#sourceReceipts.delete(proofs[i]);
      this.#audit.push({ event: 'source_delivered', source: source.id, path: file.path, start, end, sha256: hash(file.bytes), confirmation: 'returned-challenge' });
    }
    return { confirmed: entries.map(({ source, file, start, end }) => ({ source: source.id, path: file.path, start, end, complete: this.#fileRead(file) })) };
  }
  #textChunk(bytes, start, length) {
    if (start >= bytes.length) throw blocked('Source offset out of range');
    const maximum = Math.min(bytes.length, start + length);
    for (let end = maximum; end > start && end >= maximum - 3; end--) {
      try { return { start, end, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start, end)) }; }
      catch { /* Move only the ending boundary; an invalid start is never acknowledged. */ }
    }
    throw blocked('Binary source, invalid UTF-8 start, or chunk shorter than one codepoint');
  }
  #fileRead(file) {
    let end = 0;
    for (const [a, b] of [...file.coverage].sort((x, y) => x[0] - y[0])) { if (a > end) return false; end = Math.max(end, b); }
    return end === file.bytes.length && end > 0;
  }
  #fullyRead(source) { return source.files.every((x) => this.#fileRead(x)); }
  #install(candidate) {
    this.#require('discovery');
    const source = this.#sources.get(`skill:${candidate}`);
    if (!source || source.review?.decision !== 'adopt' || !this.#fullyRead(source)) throw blocked('Only a fully inspected adopted source may be installed');
    const folder = candidate.replace(/[^a-zA-Z0-9-]/g, '-');
    const target = resolve(this.#config.installedRoot ?? join(this.#root, 'installed-skills'), folder);
    const exists = existsSync(target);
    if (exists) {
      const existing = regularFiles(target).map((p) => relative(target, p).replaceAll('\\', '/')).sort();
      if (JSON.stringify(existing) !== JSON.stringify(source.files.map((x) => x.path).sort())
        || source.files.some((x) => !readFileSync(join(target, x.path)).equals(x.bytes))) throw blocked('Existing installed version differs; refusal preserves it');
    } else {
      for (const file of source.files) { const path = join(target, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.bytes); }
    }
    const manifest = source.files.map((x) => {
      const bytes = readFileSync(join(target, x.path));
      if (!bytes.equals(x.bytes)) throw new Error('Installed read-back mismatch');
      return { path: x.path, sha256: hash(bytes) };
    });
    this.#installed.set(candidate, { path: target, files: manifest, source });
    const files = source.files.map((x) => this.#snapshot(`installed/${folder}/${x.path}`, readFileSync(join(target, x.path)), x.path));
    this.#record('skill_install', { candidate, version: source.version, mode: exists ? 'reuse' : 'install', files });
    return { installed: true, mode: exists ? 'reuse' : 'install', catalog: 'host-managed-discoverable-skills', files: manifest };
  }
  #write(path, content) {
    this.#require('draft');
    const rel = safeRelative(path);
    if (this.#protected.has(rel)) throw blocked('Protected input cannot be written');
    const allow = this.#config.contract.writeAllowlist;
    if (allow && !allow.includes(rel)) throw blocked('Artifact is outside the authorized write allowlist');
    if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw blocked('Artifact exceeds allowed size');
    const method = [...this.#installed.entries()].find(([, item]) => item.source.review?.decision === 'adopt');
    if (!method) throw blocked('No inspected installed method is active');
    const absolute = this.#workspaceFile(rel, true);
    mkdirSync(dirname(absolute), { recursive: true });
    const temp = `${absolute}.workflow-${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(temp, content); renameSync(temp, absolute);
    const artifact = this.#snapshot(`artifacts/${rel}`, readFileSync(absolute), rel);
    this.#pending = this.#pending.filter((x) => !(['application','validation'].includes(x.kind) && x.data.artifact?.relative_path === rel));
    this.#artifacts.set(rel, { ...artifact, workspacePath: rel }); this.#validated.delete(rel);
    this.#record('application', { candidate: method[0], version: method[1].source.version,
      method: `Artifact physically produced after the selected inspected method; semantic correspondence requires independent validation. ${method[1].source.review.reason}`, artifact });
    return { artifact: rel, sha256: artifact.sha256, bytes: artifact.bytes };
  }
  #validateArtifact(args) {
    this.#require('draft');
    const artifact = this.#artifacts.get(safeRelative(args.artifact));
    const validator = this.#config.contract.validators.find((x) => x.id === args.validator);
    if (!artifact || !validator) throw blocked('Current produced artifact and host-approved validator are required');
    const bytes = readFileSync(this.#workspaceFile(args.artifact, false));
    let observation;
    if (validator.type === 'json-export') {
      const raw = readFileSync(this.#workspaceFile(validator.input, false));
      const input = JSON.parse(raw.toString('utf8'));
      let actual;
      try { actual = JSON.parse(bytes.toString('utf8')); } catch { throw blocked('Independent validator: malformed JSON'); }
      const expected = { generation: input.generation, total: input.values.reduce((a, b) => a + b, 0), input_sha256: hash(raw) };
      if (!actual || typeof actual !== 'object' || Array.isArray(actual)) throw blocked('Independent validator: expected a JSON object with generation, total and input_sha256');
      const differing = Object.entries(expected).filter(([k, v]) => actual[k] !== v).map(([k]) => k);
      const unexpected = Object.keys(actual).filter((k) => !Object.hasOwn(expected, k));
      if (differing.length || unexpected.length) throw blocked(`Independent validator: missing/incorrect fields [${differing.join(', ')}]; unexpected fields [${unexpected.join(', ')}]. Required keys: generation, total, input_sha256. Recheck the actual input; expected values are not supplied by this refusal`);
      observation = `Independently verified ${JSON.stringify(expected)}`;
    } else if (validator.type === 'exact-text') {
      if (bytes.toString('utf8') !== validator.expected) throw blocked('Independent validator: text differs from frozen expected output');
      observation = 'Current artifact equals the trusted frozen expected text.';
    } else throw blocked('Unknown independent validator; no actor-supplied test result is accepted');
    const covers = validator.covers ?? (validator.type === 'json-export' ? ['generation','sum','input_sha256'] : []);
    if (!Array.isArray(covers) || !covers.length || covers.some((x) => !this.#config.contract.requirements.includes(x)))
      throw blocked('Independent validator has no valid host-defined scoped requirement coverage');
    this.#validated.set(args.artifact, { artifact, observation, covers });
    this.#record('validation', { artifact, command: `host-approved:${validator.id}/${validator.type}`, exit_code: 0, observation });
    return { validated: true, artifact: args.artifact, observation };
  }
  #learn(args) {
    this.#require('learning');
    if (!nonempty(args.reason) || !args.evidence.length) throw blocked('Concrete maintenance/no-increment evidence is required');
    if (this.#config.contract.learning.required || args.decision === 'updated') throw blocked('Required Skill changes need a configured independent behavior-validation capability; they cannot be waived or self-approved');
    if (!this.#validated.size) throw blocked('There is no independently verified current task result to support learning');
    this.#record('learning', { decision: 'no_increment', reason: args.reason, evidence: args.evidence });
    return { decision: 'no_increment', reason: args.reason, actual_maintenance: false };
  }
  async #checkpoint(args) {
    if (this.stage === 'selection') {
      if (args.options) {
        if (args.options.length < 3 || args.options.length > 5 || new Set(args.options.map((x) => x.id)).size !== args.options.length) throw blocked('Present 3–5 distinct supported options');
        if (args.options.some((x) => !nonempty(x.description) || !x.sources.length || x.sources.some((id) => {
          const source = this.#sources.get(id);
          return !source || source.type !== 'reference' || !source.observation || !this.#fullyRead(source);
        }))) throw blocked('Each option needs a concrete description and actually inspected reference sources');
        this.#options = structuredClone(args.options);
        await this.#card({ kind: 'options', stage: 'selection', options: this.#options });
      }
      if (!this.#selection) throw blocked('Actual external user choice or explicit prior delegation is missing');
      if (!this.#pending.some((x) => x.kind === 'selection')) this.#record('selection', { origin: 'user', ...this.#selection });
    }
    if (this.stage === 'feedback') {
      if (!this.#feedback) throw blocked('Actual feedback for this current artifact is missing');
      if (!this.#pending.some((x) => x.kind === 'feedback')) for (const item of this.#validated.values()) this.#record('feedback', { origin: 'user',
        decision: this.#feedback.mode === 'delegated_verification' ? 'delegated_verification' : 'accept', instruction: this.#feedback.instruction, artifact: item.artifact });
    }
    if (this.stage === 'delivery' && !this.#pending.some((x) => x.kind === 'delivery')) {
      const verified = [...this.#validated.values()];
      const requirements = this.#config.contract.requirements.map((requirement) => {
        const item = verified.find((x) => x.covers.includes(requirement));
        if (!item) throw blocked(`No independent current-artifact validation covers scoped requirement: ${requirement}`);
        return { requirement, result: 'pass', evidence: `${item.artifact.relative_path}@${item.artifact.sha256}: ${item.observation}` };
      });
      for (const item of verified) this.#record('delivery', { artifact: item.artifact, requirements });
    }
    const report = this.#report(args.done, [...new Set([...args.evidence, ...this.#pending.filter((x) => ['selection','feedback','delivery'].includes(x.kind)).map((x) => x.id)])], args.next_action);
    const result = this.#gate.advance(report, this.#pending);
    if (!result.ok) throw blocked(result.errors.join('; '));
    this.#pending = [];
    await this.#card({ kind: 'checkpoint', report, result });
    return { checkpoint: report, next_stage: this.stage };
  }
  async #autoAdvance() {
    if (!this.#config.contract.autoAdvance) return;
    for (let i = 0; i < STAGES.length && this.ready && !this.complete; i++) {
      if (STAGES.indexOf(this.stage) > STAGES.indexOf(this.#config.contract.stopAfter)) break;
      const kinds = new Set(this.#pending.map((x) => x.kind));
      const allValidated = this.#artifacts.size > 0 && [...this.#artifacts.keys()].every((path) => this.#validated.has(path));
      const allCovered = this.#config.contract.requirements.every((id) => [...this.#validated.values()].some((x) => x.covers.includes(id)));
      const eligible = this.stage === 'discovery' ? ['skill_search','skill_review','skill_install','references'].every((kind) => kinds.has(kind))
        : this.stage === 'selection' ? !!this.#selection
          : this.stage === 'draft' ? allValidated && allCovered
            : this.stage === 'feedback' ? allValidated && !!this.#feedback
              : this.stage === 'delivery' ? allValidated && allCovered
                : this.stage === 'learning' ? kinds.has('learning') : false;
      if (!eligible) break;
      const stage = this.stage;
      try {
        await this.#checkpoint({ done: [`Host verified the actual prerequisites for ${stage}; generated this report from observed receipts.`],
          evidence: this.#pending.map((x) => x.id), next_action: 'Continue only at the next authorized stage; wait for any required human input.' });
      } catch (error) {
        if (!error.business) throw error;
        this.#audit.push({ event: 'automatic_checkpoint_waiting', stage, reason: error.message }); break;
      }
    }
  }
  async acceptUserMessage(text) {
    // This method is deliberately absent from model tool schemas.
    if (!nonempty(text)) throw new Error('External input must be nonempty');
    const choice = text.match(/^\/workflow choose ([a-z0-9_-]+)$/i);
    if (choice) {
      const selected = choice[1];
      if (this.stage !== 'selection' || !this.#options.length || !this.#options.some((x) => x.id === selected))
        throw blocked('Choose only an actually shown option at the selection stage');
      this.#selection = { mode: 'chosen', selected,
        options: this.#options.map((x) => x.id), instruction: text };
    } else if (text.trim() === '/workflow accept') {
      if (this.stage !== 'feedback' || !this.#validated.size) throw blocked('Accept only the current independently validated draft at feedback');
      this.#feedback = { mode: 'accept', instruction: text };
    }
    else if (/^(?:\/workflow pause|暂停|先停|停止)/.test(text.trim())) this.abort('External user paused the task');
    else if (this.stage === 'feedback') {
      this.#gate.reopen('draft', text); this.#pending = []; this.#validated.clear(); this.#sourceReceipts.clear();
      this.#feedback = this.#config.contract.feedback.mode === 'delegated_verification' ? this.#config.contract.feedback : null;
      await this.#card({ kind: 'revision', revision: this.#gate.revision, stage: 'draft', instruction: text, previous_validation_invalidated: true });
    }
    this.#audit.push({ event: 'external_user_input', text });
    await this.#autoAdvance();
    return this.#state();
  }
}

export async function createWorkflowHost(config) { return new GuardedWorkflowHost(config).initialize(); }
