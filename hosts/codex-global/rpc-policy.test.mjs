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
test('gateway OAuth readiness read is parameterless while login, cancellation and argument injection remain denied',()=>{
 for(const input of [undefined,null,{}])assert.deepEqual(readParams('account/gatewayOAuth/read',input),{});
 for(const input of [{url:'https://untrusted.invalid/'},{resourceUrl:'https://untrusted.invalid/'},{token:'fixture-only'},
  {provider:'other'},{providerId:'other'},{refresh:true},{refreshToken:true},{includeToken:true},[],['unexpected'],'unexpected',1])assert.throws(()=>readParams('account/gatewayOAuth/read',input),/does not accept parameters/);
 for(const method of ['account/gatewayOAuth/login','account/gatewayOAuth/cancel','account/gatewayOAuth/read/extra','account/unknown/read'])assert.throws(()=>readParams(method,{}),/Host denied RPC/);
});
test('Windows sandbox readiness is an exact parameterless read and cannot request setup or alter OS policy',()=>{
 for(const input of [undefined,null,{}])assert.deepEqual(readParams('windowsSandbox/readiness',input),{});
 for(const input of [{mode:'unelevated'},{autoSetup:true},{setup:true},{force:true},{cwd:'C:/untrusted'},
  {resourceUrl:'https://untrusted.invalid/'},{refresh:true},[],['unexpected'],'unexpected',1])assert.throws(()=>readParams('windowsSandbox/readiness',input),/does not accept parameters/);
 for(const method of ['windowsSandbox/setupStart','windowsSandbox/setup','windowsSandbox/readiness/extra'])assert.throws(()=>readParams(method,{}),/Host denied RPC/);
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
 assert.equal(classifyRoute({id:'local',display_name:'Local',kind:'local'},'local').allowed,true);
 for(const h of [{id:'durable',kind:'local'},{id:'local'},...['ssh','wsl','remote-control','unknown'].map(kind=>({id:'local',kind})),
  {id:'local',kind:'local',distro:'Ubuntu'},{id:'local',kind:'local',transportKind:'remote-control'},
  {id:'local',kind:'local',transport_kind:'ssh-websocket-v0'},{id:'unknown',kind:'local'},
  {id:'local',kind:'local',websocket_url:'ws://evil'},{id:'local',kind:'local',ssh:true},{id:'local',kind:'local',ssh_host:'example.invalid'}])assert.equal(classifyRoute(h,'local').allowed,false,JSON.stringify(h));
 assert.equal(classifyRoute({id:'unknown',kind:'local'},'unknown').allowed,false);
});
test('bounded project identity is retained and settings cwd is accepted only from resolved host argument',()=>{
 const p=threadParams({projectId:'project-123',cwd:'C:/evil'},'C:/safe',schemas,new Set());assert.equal(p.projectId,'project-123');assert.equal(p.cwd,'C:/safe');
 for(const projectId of ['', '../secret','a/b','a'.repeat(201),3,{},'x\n'])assert.throws(()=>threadParams({projectId},'C:/safe',schemas,new Set()),/project/i);
 assert.equal(settingsParams({threadId:'t',cwd:'C:/evil'},new Set(),'C:/safe').cwd,'C:/safe');assert.equal(settingsParams({threadId:'t',cwd:'C:/evil'},new Set()).cwd,undefined);
});
