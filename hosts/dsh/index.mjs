import { requireBinding } from './binding.mjs';
export const name='workflow-dsh-guard';
export const inject=['tools'];
export const SERVICE='workflowDshGuard';

export function apply(ctx) {
  let binding;
  try {binding=requireBinding();}
  catch(error) {
    // DSH's best-effort Loader can warn about an inactive plugin and exit 0.
    // The official launcher-owned exit service makes this refusal explicit.
    process.stderr.write('dsh workflow: no trusted controller is bound; use the controlled workflow-dsh launcher.\n');
    ctx.root.get('appExit')?.(1);
    throw error;
  }
  const {controller}=binding;
  controller.assertReady();
  const host=ctx.root;
  const definitions=new Map();
  const pendingDelivery=new Map();
  let failure;
  const fatal=(code,error)=>{
    if(failure) return;
    failure=code;
    try {controller.abort(`${code}${error?.message?`: ${error.message}`:''}`);}catch{}
    try {binding.onFatal(code);}catch{}
  };
  const service=Object.freeze({ownership:'root-context',controller,
    assertActive(){if(failure || host.get(SERVICE)!==service) throw new Error(failure??'Guard service missing or replaced');controller.assertReady();}});
  // Intentionally root-owned, not disposed with this managed plugin. An unload
  // or replacement permanently closes this process until a trusted restart.
  host.tools.guard(exec=>{
    try {
      if(failure) return `Workflow stopped: ${failure}`;
      if(host.get(SERVICE)!==service) {fatal('GUARD_SERVICE_MISSING_OR_REPLACED');return 'Workflow guard missing or replaced; execution denied';}
      controller.assertReady();
      if(exec.parent!==undefined) return 'Nested native tool dispatch is disabled; use workflow tools directly';
      if(!definitions.has(exec.name)) return `Raw or unknown tool ${exec.name} is disabled`;
      if(host.tools.get(exec.name,exec.agent)!==definitions.get(exec.name)) {fatal('TOOL_DEFINITION_INTEGRITY_FAILURE');return 'Workflow tool definition changed; execution denied';}
      return undefined;
    }catch(error){fatal('GUARD_HEALTH_FAILURE',error);return 'Workflow guard failed; execution denied';}
  });
  // Core receipts are meaningful only if the native runtime actually returns
  // those bytes. Observer exceptions are contained by DSH, so explicitly
  // abort/cancel on mismatch rather than relying on a thrown listener error.
  host.on('tools/result',(exec,result)=>{
    const expected=pendingDelivery.get(exec.token);
    if(expected===undefined) return;
    pendingDelivery.delete(exec.token);
    if(result.isError || JSON.stringify(result.content)!==JSON.stringify([{type:'text',text:expected}])) fatal('TOOL_DELIVERY_INTEGRITY_FAILURE');
  });
  const names=new Set();
  for(const schema of controller.toolSchemas) {
    if(!schema || typeof schema.name!=='string' || !/^workflow_[a-z0-9_]+$/.test(schema.name)
      || names.has(schema.name) || !schema.inputSchema || typeof schema.description!=='string')
      throw new Error('Invalid or duplicate workflow tool schema');
    names.add(schema.name);
    if(host.tools.get(schema.name)) throw new Error(`Workflow tool already exists: ${schema.name}`);
    const definition={name:schema.name,description:schema.description,parameters:schema.inputSchema,
      output:{schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
      execute:async(args,exec)=>{
        try {
          service.assertActive();
          const result=await controller.dispatch(schema.name,args,{callId:String(exec.callId)});
          if(!result || typeof result.ok!=='boolean') throw new Error('Malformed workflow dispatcher result');
          if(result.fatal===true){fatal('DISPATCH_INTEGRITY_FAILURE');throw new Error('Workflow integrity failure; task aborted');}
          pendingDelivery.set(exec.token,JSON.stringify(result));
          return result;
        }catch(error){fatal('DISPATCH_EXCEPTION',error);throw new Error('Workflow dispatcher failed; task aborted without fallback');}
      }};
    ctx.tools.register(definition);
    definitions.set(schema.name,host.tools.get(schema.name));
  }
  ctx.provide(SERVICE,service);
}
