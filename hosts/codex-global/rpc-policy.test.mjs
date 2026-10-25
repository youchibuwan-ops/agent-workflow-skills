import test from 'node:test';
import assert from 'node:assert/strict';
import {readParams,threadParams,turnParams,settingsParams,classifyRoute} from './rpc-policy.mjs';
const schemas=[{name:'workflow_status',description:'status',inputSchema:{type:'object'}}];
test('actual desktop startup reads have bounded exact argument whitelist',()=>{
 assert.deepEqual(readParams('getAuthStatus',{includeToken:true,refreshToken:true,config:{evil:true}}),{includeToken:true,refreshToken:false});
 assert.deepEqual(readParams('configRequirements/read',{config:{evil:true}}),{});
 assert.deepEqual(readParams('config/read',{includeLayers:true,cwd:'C:/secret'}),{includeLayers:false});
 assert.deepEqual(readParams('model/list',{limit:999999,cursor:'a',config:{evil:true}}),{cursor:'a',limit:100});
 assert.throws(()=>readParams('fs/readFile',{path:'auth.json'}),/denied/);
});
test('every execution-bearing parameter is host-owned',()=>{
 const p=threadParams({dynamicTools:[{name:'evil'}],config:{evil:true},environments:[{}],model:'known',baseInstructions:'evil'},'C:/work',schemas,new Set(['known']));
 assert.deepEqual(p.environments,[]);assert.deepEqual(p.dynamicTools,schemas);assert.equal(p.config,undefined);assert.equal(p.baseInstructions,undefined);assert.equal(p.approvalPolicy,'never');
 assert.throws(()=>threadParams({model:'unknown'},'C:/work',schemas,new Set(['known'])),/model/);
 const t=turnParams({threadId:'t',input:[{type:'text',text:'actual'}],config:{evil:true},environments:[{}]},'C:/work','trusted');
 assert.deepEqual(t.environments,[]);assert.equal(t.config,undefined);assert.equal(t.additionalContext.workflow_host.value,'trusted');
 assert.throws(()=>turnParams({input:[{type:'image',url:'x'}]},'C:/work',''),/text/);
 assert.deepEqual(settingsParams({threadId:'t',permissions:'full-access',cwd:'C:/else',effort:'ultra',model:'known'},new Set(['known'])),{threadId:'t',approvalPolicy:'never',sandboxPolicy:{type:'readOnly'},model:'known'});
});
test('connection classification denies every unsupported transport before creation',()=>{
 assert.equal(classifyRoute({id:'local'},'local').allowed,true);
 for(const h of [{id:'durable'},{id:'local',distro:'Ubuntu'},{id:'local',transportKind:'remote-control'},{id:'local',transportKind:'ssh-websocket-v0'},{id:'unknown'},{id:'local',websocket_url:'ws://evil'}])assert.equal(classifyRoute(h,'local').allowed,false);
});
