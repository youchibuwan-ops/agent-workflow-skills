// Trusted launcher ↔ installed bundle bridge. No model-facing tool can bind,
// replace or control this process-local capability.
let current;
export function bindController(controller,{onFatal=()=>{}}={}) {
  if(current) throw new Error('A DSH workflow controller is already bound');
  if(!controller || !Array.isArray(controller.toolSchemas) || !controller.toolSchemas.length
    || !['dispatch','assertReady','abort','exportAudit'].every(key=>typeof controller[key]==='function'))
    throw new Error('A complete host-owned workflow controller is required');
  const entry=Object.freeze({controller,onFatal});
  current=entry;
  return ()=>{if(current===entry) current=undefined;};
}
export function requireBinding() {
  if(!current) throw new Error('Use the controlled workflow-dsh launcher; no trusted controller is bound');
  return current;
}
