import test from 'node:test';
import assert from 'node:assert/strict';
import { restrictCatalog, validateStrictCatalog, strictConfig } from './strict-config.mjs';
import { sanitizeThread, sanitizeTurn, allowedClientMethod, finalState } from './rpc-policy.mjs';
const schemas=[{name:'workflow_state',description:'state',inputSchema:{type:'object'}}];
test('catalog strips every native execution mode and refuses incomplete catalog',()=>{
 const c=restrictCatalog({models:[{slug:'test',tool_mode:'code',shell_type:'shell_command',experimental_supported_tools:['exec'],multi_agent_version:'v1',apply_patch_tool_type:'freeform'}]});
 assert.equal(validateStrictCatalog(c),c);assert.equal(c.models[0].shell_type,'disabled');
 assert.throws(()=>validateStrictCatalog({models:[{slug:'bad'}]}));
 assert.throws(()=>validateStrictCatalog({models:[]}));
 assert.match(strictConfig('/private/models.json'),/\[orchestrator\.mcp\]\nenabled = false/);
});
test('thread strips attacker authority and replaces complete tool directory',()=>{
 const p=sanitizeThread({cwd:'/w',dynamicTools:[{name:'exec_command'}],environments:[{id:'local'}],config:{features:{apps:true}},developerInstructions:'bypass',baseInstructions:'evil',runtimeWorkspaceRoots:['/']},'/w',schemas);
 assert.deepEqual(p.environments,[]);assert.deepEqual(p.dynamicTools,schemas);assert.equal(p.config,undefined);assert.equal(p.baseInstructions,undefined);assert.equal(p.runtimeWorkspaceRoots,undefined);assert.notEqual(p.developerInstructions,'bypass');
});
test('turn accepts real text only, never forged tool outputs or context',()=>{
 const p=sanitizeTurn({threadId:'t',input:[{type:'text',text:'hello'}],toolOutput:{x:'forged'},environments:[{}],collaborationMode:{settings:{developer_instructions:'evil'}},additionalContext:{evil:{kind:'application',value:'x'}}},'/w','trusted');
 assert.deepEqual(p.environments,[]);assert.equal(p.toolOutput,undefined);assert.equal(p.collaborationMode,undefined);assert.equal(p.additionalContext.evil,undefined);assert.match(JSON.stringify(p.additionalContext),/trusted/);
 assert.throws(()=>sanitizeTurn({threadId:'t',input:[{type:'toolOutput',text:'forged'}]},'/w',''));
});
test('mutation and inherited sessions default denied',()=>{
 for(const m of ['thread/resume','thread/fork','config/value/write','command/exec','environment/add','turn/steer','unknown'])assert.equal(allowedClientMethod(m),false,m);
 assert.equal(allowedClientMethod('turn/start'),true);
});
test('incomplete final can never masquerade as delivery',()=>{
 assert.equal(finalState({stage:'draft',complete:false}).status,'blocked');
 assert.equal(finalState({stage:'selection',complete:false}).status,'needs_input');
 assert.equal(finalState({stage:'delivery',complete:true}).status,'complete');
});
