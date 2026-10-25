import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflightTask,runTaskClient,parseTaskClientArgs} from './task-client.mjs';
const schemas=[{name:'workflow_status',description:'host status',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
function fixture(t){
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-task-client-')),workspace=path.join(root,'workspace');mkdirSync(workspace);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const options={workspace,userMessageFile:path.join(root,'request.txt'),contractFile:path.join(root,'contract.json'),runtimePath:process.execPath,catalogPath:path.join(root,'models.json'),authPath:path.join(root,'auth.json'),stateRoot:path.join(root,'run')};
 writeFileSync(options.userMessageFile,'An actual external task.');writeFileSync(options.contractFile,JSON.stringify({requirements:['test'],selection:{mode:'pending'},feedback:{mode:'required'}}));writeFileSync(options.catalogPath,JSON.stringify({models:[{slug:'fixture'}]}));writeFileSync(options.authPath,JSON.stringify({tokens:{access_token:'TEST_AUTH_SECRET_MUST_NOT_LEAK'}}));
 return {root,options};
}
function deps(mode='complete'){
 const accepted=[],events=[];let controller;
 return {accepted,events,backendCommand:[process.execPath,fileURLToPath(new URL('./fixtures/task-backend.mjs',import.meta.url)),'normal'],toolSchemas:schemas,
  emit:event=>events.push(event),controllerFactory:async args=>{
   controller={stage:mode==='wait'?'selection':'complete',complete:mode!=='wait',ready:true,toolSchemas:schemas,instructions:'Use workflow_status only.',assertReady(){},abort(){this.ready=false;},
    async dispatch(){return {ok:true,state:{stage:this.stage,complete:this.complete,needs_input:!this.complete,options:[{id:'json',description:'JSON output',sources:['observed-source']}]}};},
    async acceptUserMessage(text){accepted.push(text);if(text==='/workflow choose json')this.stage='feedback';if(text==='/workflow accept'){this.stage='complete';this.complete=true;}},
    exportAudit(){return {stage:this.stage,complete:this.complete,accepted:[...accepted]};}};
   await args.onCard({kind:'scope',report:{stage:'scope'}});return controller;
  }};
}
test('default is local-only preflight, never invokes proxy or copies credentials',async t=>{
 const f=fixture(t);let called=false;
 const r=await runTaskClient(f.options,{proxyFactory:async()=>{called=true;throw Error('must not run');},emit(){}});
 assert.equal(r.status,'checked');assert.equal(called,false);assert.equal(existsSync(f.options.stateRoot),false);
});
test('external user text/contract, state and credential boundaries reject overlap',t=>{
 const f=fixture(t);
 for(const key of ['userMessageFile','contractFile','authPath','catalogPath']){const local=path.join(f.options.workspace,path.basename(f.options[key]));writeFileSync(local,'{}');assert.throws(()=>preflightTask({...f.options,[key]:local}),/outside.*workspace/);}
 assert.throws(()=>preflightTask({...f.options,stateRoot:path.join(f.options.workspace,'private')}),/disjoint/);
});
test('real WS proxy transport supports trusted human choice/accept, saves audit, removes temporary auth',async t=>{
 const f=fixture(t),d=deps('wait'),answers=['choose json','accept'];
 const result=await runTaskClient({...f.options,run:true},{...d,readHuman:async()=>answers.shift()});
 assert.equal(result.status,'complete');assert.deepEqual(d.accepted,['/workflow choose json','/workflow accept']);
 assert.equal(result.temporaryAuthRemoved,true);assert.equal(existsSync(path.join(f.options.stateRoot,'backend/state/auth.json')),false);
 assert.equal(result.authSourceUnchanged,true);assert.equal(result.taskAudit.complete,true);
 assert.ok(d.events.some(x=>x.type==='waiting'&&x.stage==='selection'));assert.ok(d.events.some(x=>x.type==='card'));
 assert.equal(JSON.parse(readFileSync(path.join(f.options.stateRoot,'audit.json'))).status,'complete');
 assert.doesNotMatch(readFileSync(path.join(f.options.stateRoot,'audit.json'),'utf8'),/TEST_AUTH_SECRET/);
});
test('noninteractive task reports actual waiting state and closes cleanly',async t=>{
 const f=fixture(t),d=deps('wait');const result=await runTaskClient({...f.options,run:true,nonInteractive:true},d);
 assert.equal(result.status,'needs_input');assert.equal(result.stage,'selection');assert.equal(result.temporaryAuthRemoved,true);assert.equal(d.accepted.length,0);
});
test('backend startup failure still removes temporary credentials and records failure',async t=>{
 const f=fixture(t),d=deps();d.proxyFactory=async()=>{throw Error('strict startup failed');};
 const r=await runTaskClient({...f.options,run:true},d);assert.equal(r.status,'failed');assert.equal(r.temporaryAuthRemoved,true);assert.match(r.error,/strict startup failed/);
});
test('unknown flags fail and explicit run is required',()=>{
 const args=['--workspace','/w','--user-message-file','/request','--contract-file','/contract','--runtime-path','/runtime','--catalog-path','/catalog','--auth-path','/auth','--state-root','/private'];
 assert.equal(parseTaskClientArgs(args).run,false);assert.equal(parseTaskClientArgs([...args,'--run']).run,true);assert.throws(()=>parseTaskClientArgs([...args,'--allow-raw-tools']),/Unknown option/);
});

test('blank human answer does not start a blank model turn',async t=>{
 const f=fixture(t),d=deps('wait'),answers=['','choose json','accept'];const r=await runTaskClient({...f.options,run:true},{...d,readHuman:async()=>answers.shift()});assert.equal(r.status,'complete');assert.deepEqual(d.accepted,['/workflow choose json','/workflow accept']);
});
test('abort while awaiting human input closes backend and clears temporary login',async t=>{
 const f=fixture(t),d=deps('wait'),abort=new AbortController();
 const r=await runTaskClient({...f.options,run:true},{...d,signal:abort.signal,readHuman:async()=>{queueMicrotask(()=>abort.abort());return new Promise(()=>{});}});
 assert.equal(r.status,'aborted');assert.equal(r.temporaryAuthRemoved,true);
});

test('bad human choice is refused locally without spending another model turn',async t=>{
 const f=fixture(t),d=deps('wait'),answers=['choose invented','choose json','accept'];const r=await runTaskClient({...f.options,run:true},{...d,readHuman:async()=>answers.shift()});assert.equal(r.status,'complete');assert.deepEqual(d.accepted,['/workflow choose json','/workflow accept']);assert.ok(d.events.some(x=>x.type==='input_error'));
});
test('known login secrets are redacted from terminal, audit and returned result',async t=>{
 const f=fixture(t),d=deps(),base=d.controllerFactory;
 d.controllerFactory=async args=>{const c=await base(args),audit=c.exportAudit.bind(c);c.exportAudit=()=>({...audit(),unexpectedEcho:'TEST_AUTH_SECRET_MUST_NOT_LEAK'});return c;};
 const r=await runTaskClient({...f.options,run:true},d);assert.equal(r.status,'complete');assert.doesNotMatch(JSON.stringify(d.events),/TEST_AUTH_SECRET/);assert.doesNotMatch(JSON.stringify(r),/TEST_AUTH_SECRET/);assert.doesNotMatch(readFileSync(path.join(f.options.stateRoot,'audit.json'),'utf8'),/TEST_AUTH_SECRET/);
});
