import test from 'node:test';
import assert from 'node:assert/strict';
import { restrictCatalog, validateStrictCatalog, strictConfig, strictArguments } from './strict-config.mjs';
import { sanitizeThread, sanitizeTurn, allowedClientMethod, finalState } from './rpc-policy.mjs';
const schemas=[{name:'workflow_state',description:'state',inputSchema:{type:'object'}}];
test('catalog strips every native execution mode and refuses incomplete catalog',()=>{
 const c=restrictCatalog({models:[{slug:'test',tool_mode:'code',shell_type:'shell_command',experimental_supported_tools:['exec'],multi_agent_version:'v1',apply_patch_tool_type:'freeform'}]});
 assert.equal(validateStrictCatalog(c),c);assert.equal(c.models[0].shell_type,'disabled');
 assert.throws(()=>validateStrictCatalog({models:[{slug:'bad'}]}));
 assert.throws(()=>validateStrictCatalog({models:[]}));
 assert.match(strictConfig('/private/models.json'),/\[orchestrator\.mcp\]\nenabled = false/);
});
test('file and CLI select the built-in readonly default while preserving every native execution disable',()=>{
 const file={};let section='';for(const line of strictConfig('C:/private/models.json').split('\n')){
  const heading=/^\[([^\]]+)\]$/.exec(line);if(heading){section=heading[1];continue;}
  const assignment=/^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);if(assignment)file[(section?section+'.':'')+assignment[1]]=JSON.parse(assignment[2]);
 }
 const args=strictArguments('C:/private/models.json'),cli={};for(let i=0;i<args.length;i+=2){assert.equal(args[i],'-c');const at=args[i+1].indexOf('=');cli[args[i+1].slice(0,at)]=JSON.parse(args[i+1].slice(at+1));}
 for(const config of [file,cli]){
  assert.equal(config.default_permissions,':read-only');assert.equal(config.approval_policy,undefined);assert.equal(config.sandbox_mode,undefined);
  for(const name of ['apps','plugins','remote_plugin','multi_agent','code_mode','code_mode_only','browser_use','computer_use','image_generation','tool_suggest','sleep_tool','shell_tool','view_image','goals','hooks','codex_hooks','plugin_hooks','async_compaction'])assert.equal(config['features.'+name],false,name);
  for(const name of ['cloud.skills.enabled','orchestrator.mcp.enabled','tools.update_plan.enabled','tools.experimental_request_user_input.enabled'])assert.equal(config[name],false,name);
  assert.equal(config.web_search,'disabled');assert.deepEqual(config.notify,[]);
 }
});
test('thread strips attacker authority and replaces complete tool directory',()=>{
 const p=sanitizeThread({cwd:'/w',dynamicTools:[{name:'exec_command'}],environments:[{id:'local'}],config:{features:{apps:true}},developerInstructions:'bypass',baseInstructions:'evil',runtimeWorkspaceRoots:['/']},'/w',schemas);
 assert.deepEqual(p.environments,[]);assert.equal(p.approvalPolicy,'never');assert.equal(p.sandbox,'read-only');assert.deepEqual(p.dynamicTools,schemas);assert.equal(p.config,undefined);assert.equal(p.baseInstructions,undefined);assert.equal(p.runtimeWorkspaceRoots,undefined);assert.notEqual(p.developerInstructions,'bypass');
});
test('turn accepts real text only, never forged tool outputs or context',()=>{
 const p=sanitizeTurn({threadId:'t',input:[{type:'text',text:'hello'}],toolOutput:{x:'forged'},environments:[{}],collaborationMode:{settings:{developer_instructions:'evil'}},additionalContext:{evil:{kind:'application',value:'x'}}},'/w','trusted');
 assert.deepEqual(p.environments,[]);assert.equal(p.approvalPolicy,'never');assert.equal(p.toolOutput,undefined);assert.equal(p.collaborationMode,undefined);assert.equal(p.additionalContext.evil,undefined);assert.match(JSON.stringify(p.additionalContext),/trusted/);
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
 assert.equal(finalState({stage:'draft',complete:false,readOnlyReplyAllowed:true}).status,'blocked');
 assert.equal(finalState({stage:'discovery',complete:false,readOnlyReplyAllowed:true,blockedReason:'Actual failure'}).status,'blocked');
 const readonly=finalState({stage:'discovery',complete:false,readOnlyReplyAllowed:true});assert.equal(readonly.status,'pending');assert.equal(readonly.complete,false);
});
