// Model-facing view only. The host's authoritative state and audit are untouched.
const STATE_FIELDS = new Set([
  'task','revision','stage','complete','blockedReason','needs_input','evidence',
  // Preserve diagnostics and source proof fields if a host adds them to state.
  'error','errors','fatal','recovery','missing','code','source_operation',
  'source_receipt','source_receipts',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Remove repeated workflow catalogs from a tool's state envelope. Never project
 * data: source bytes, confirmation challenges, and workflow_status's full data
 * snapshot remain exactly the same values. Unknown top-level fields also survive.
 */
export function compactToolResult(result, {toolName} = {}) {
  if (toolName !== undefined && !/^workflow_[a-z0-9_]+$/.test(toolName)) return result;
  if (!object(result) || !object(result.state)) return result;
  const entries = Object.entries(result.state);
  const retained = entries.filter(([key]) => STATE_FIELDS.has(key) || /(?:^|_)(?:evidence|receipt)_ids?$/.test(key));
  if (retained.length === entries.length) return result;
  return {...result, state:Object.fromEntries(retained)};
}
