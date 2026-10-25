// Host-side opt-in adapter; loading SKILL.md does not execute this module.
import { WorkflowGate, STAGES } from './workflow-gate.mjs';

export function attachDshGate(ctx, gate, trustedToolMap) {
  if (!(gate instanceof WorkflowGate) || typeof ctx?.tools?.guard !== 'function') {
    throw new Error('An actual WorkflowGate and native DSH ToolRuntime are required');
  }
  if (!trustedToolMap || !Object.keys(trustedToolMap).length
    || !Object.values(trustedToolMap).every((stage) => stage === 'research' || STAGES.includes(stage))) {
    throw new Error('Explicit host-owned tool-to-stage policy required');
  }
  return ctx.tools.guard(gate.guard(trustedToolMap));
}
