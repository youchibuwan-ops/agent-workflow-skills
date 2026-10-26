const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
const strings = { type: 'array', items: string };
const tool = (name, description, properties, required = []) => Object.freeze({ name, description,
  inputSchema: object(properties, required) });

export const WORKFLOW_TOOL_SCHEMAS = Object.freeze([
  tool('workflow_status', 'Read the authoritative workflow stage, missing prerequisites and available receipt IDs. It grants no permission.', {}),
  tool('workflow_read_workspace', 'Actually read an authorized project input. Returns its current text and exact raw-byte SHA256; never reads host state, credentials or configuration.',
    { path: string, offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 12000 } }, ['path']),
  tool('workflow_search_skills', 'Query installed Skills first. Only after a concrete local capability gap, request external discovery. Search hits are never source inspection.', { query: string, external: { type: 'boolean' }, gap: string }, ['query']),
  tool('workflow_open_skill', 'Acquire the current full Skill bundle and applicable license. Downloading does not mark it read.', { candidate: string }, ['candidate']),
  tool('workflow_read_source', 'Return actual text bytes and an unpredictable one-use source_receipt. After receiving the result, confirm the receipt; all ranges must be confirmed before review.',
    { source: string, path: string, offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 12000 } }, ['source', 'path']),
  tool('workflow_confirm_sources', 'Confirm source_receipt challenges from actual received read results, optionally in one batch. Guessed, consumed, duplicate and stale challenges are rejected; status never supplies them.',
    { receipts: strings }, ['receipts']),
  tool('workflow_review_skill', 'Record an applicability proposal only after full source/resource/license delivery. The host independently checks physical evidence.',
    { candidate: string, decision: { enum: ['adopt', 'reject'] }, reason: string, covers: strings }, ['candidate', 'decision', 'reason', 'covers']),
  tool('workflow_install_skill', 'Actually install or verify an identical existing bundle in the host-managed discoverable Skill catalog, then read it back.',
    { candidate: string }, ['candidate']),
  tool('workflow_open_reference', 'Acquire a current reference by configured ID, or by https:// URL when the host reports public-HTTPS acquisition. It must then be fully read, receipt-confirmed and observed. Binary media require a verified viewer.', { reference: string }, ['reference']),
  tool('workflow_observe_reference', 'Bind an observation to a confirmed reference. source MUST be the exact returned handle (for example reference:a), not its catalog ID (a); a title or URL alone does not pass.',
    { source: string, observation: string }, ['source', 'observation']),
  tool('workflow_checkpoint', 'Request only the current stage transition. Signed evidence is supplied by the host, never by this request.',
    { done: strings, evidence: strings, next_action: string, options: { type: 'array', items: object({ id: string, description: string, sources: strings, artifacts: strings }, ['id', 'description', 'sources']) } },
    ['done', 'evidence', 'next_action']),
  tool('workflow_write', 'Write an authorized project artifact only in draft. Protected inputs, host files and traversal are rejected before writing. Optional newline preserve (default), LF or CRLF changes only actual decoded ASCII line endings; literal backslash escapes and BOM are never decoded or changed. The same native writer, permissions and exact readback apply.',
    { path: string, content: string, newline: { enum: ['preserve','LF','CRLF'] } }, ['path', 'content']),
  tool('workflow_apply_method', 'Execute a confirmed installed Python method only when a native permission-aware OS sandbox provider is present. Inputs stay read-only; only declared staged outputs may commit.',
    { candidate: string, path: string, args: strings, inputs: strings, outputs: strings }, ['candidate', 'path']),
  tool('workflow_validate', 'Run a host-approved independent validator on the current artifact. Actor-supplied pass fields or test code are not accepted.',
    { validator: string, artifact: string }, ['validator', 'artifact']),
  tool('workflow_learn', 'Propose a concrete no-increment decision or a required Skill revision. The host requires current validation and configured behavior checks.',
    { decision: { enum: ['no_increment', 'updated'] }, reason: string, evidence: strings,
      files: { type: 'array', items: object({ path: string, content: string }, ['path', 'content']) } }, ['decision', 'reason', 'evidence']),
]);
