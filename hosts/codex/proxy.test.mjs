import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';
import {createCodexProxy} from './proxy.mjs';
import {restrictCatalog} from './strict-config.mjs';
const schemas=[{name:'workflow_state',description:'state',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
async function setup(mode='normal',dispatch=async()=>({ok:false,reason:'Stage scope: draft forbidden'}),extra={}){
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-proxy-')),workspace=path.join(root,'workspace');mkdirSync(workspace);
 const calls=[],controller={ready:true,stage:'draft',complete:false,toolSchemas:schemas,instructions:'trusted-controller',assertReady(){},dispatch:async(...args)=>{calls.push(args);return dispatch(...args);},acceptUserMessage:async()=>{},abort(){}};
 const proxy=await createCodexProxy({controllerFactory:async()=>controller,toolSchemas:schemas,backendCommand:[process.execPath,fileURLToPath(new URL('./fixtures/backend.mjs',import.meta.url)),mode],strictCatalog:restrictCatalog({models:[{slug:'fixture-model'}]}),workspace,stateRoot:path.join(root,'private'),...extra});
 await extra.beforeConnect?.(proxy.url);
 const ws=new WebSocket(proxy.url),messages=[],pending=new Map();let next=1;
 ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const rpc=(method,params={})=>new Promise(resolve=>{const id=next++;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));});
 const wait=async(predicate)=>{for(let i=0;i<100;i++){const m=messages.find(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw new Error('timeout '+JSON.stringify(messages));};
 const close=async()=>{await proxy.close();rmSync(root,{recursive:true,force:true});};
 return {proxy,ws,rpc,messages,wait,close,calls,controller};
}
test('startup fails closed without controller or catalog',async()=>{
 await assert.rejects(createCodexProxy({}),/controllerFactory/);
});
test('WS transport replaces hostile thread params; dispatch refusal remains recoverable',async()=>{
 const t=await setup();try{
  await t.rpc('initialize',{clientInfo:{name:'test',version:'1'}});
  const denied=await t.rpc('thread/resume',{threadId:'foreign'});assert.equal(denied.error.code,-32001);
  const thread=await t.rpc('thread/start',{dynamicTools:[{name:'exec_command'}],environments:[{id:'local'}],config:{model_catalog_json:'evil'}});
  assert.deepEqual(thread.result.observed.environments,[]);assert.deepEqual(thread.result.observed.dynamicTools,schemas);
  assert.equal(t.calls.length,0);
  await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  const result=await t.wait(m=>m.method==='fixture/result');assert.equal(result.params.success,false);assert.equal(t.calls.length,1);
  const complete=await t.wait(m=>m.method==='turn/completed');assert.equal(complete.params.turn.status,'failed');assert.equal(complete.params.workflow.status,'blocked');assert.equal(t.ws.readyState,WebSocket.OPEN);
 }finally{await t.close();}
});
test('unknown server tool is never delegated and terminates backend',async()=>{
 const t=await setup('unknown');try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.equal(t.calls.length,0);assert.match(t.proxy.exportAudit().failure,/Unknown backend request\/tool/);
 }finally{await t.close();}
});
test('controller exception terminates channel',async()=>{
 const t=await setup('normal',async()=>{throw new Error('controller unavailable');});try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.match(t.proxy.exportAudit().failure,/controller unavailable/);
 }finally{await t.close();}
});

test('token mismatch fails HTTP upgrade without consuming valid slot',async()=>{
 const t=await setup('normal',undefined,{beforeConnect:async url=>{const bad=new WebSocket(url+'wrong');await new Promise(resolve=>bad.once('error',resolve));}});try{
  assert.equal(t.ws.readyState,WebSocket.OPEN);
 }finally{await t.close();}
});
test('fatal controller result terminates channel',async()=>{
 const t=await setup('normal',async()=>({ok:false,fatal:true,reason:'integrity mismatch'}));try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.match(t.proxy.exportAudit().failure,/integrity mismatch/);
 }finally{await t.close();}
});
test('collector failure aborts rather than forwarding model turn',async()=>{
 const t=await setup('normal',undefined,{onAudit(event){if(event.kind==='turn_allowed')throw new Error('audit unavailable');}});try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});t.ws.send(JSON.stringify({id:300,method:'turn/start',params:{threadId:'owned-thread',input:[{type:'text',text:'try'}]}}));
  if(t.ws.readyState===WebSocket.OPEN)await new Promise(resolve=>t.ws.once('close',resolve));assert.match(t.proxy.exportAudit().failure,/audit unavailable/);
 }finally{await t.close();}
});
test('foreign turn and client response spoof are rejected before dispatch',async()=>{
 const t=await setup();try{
  await t.rpc('initialize',{});const foreign=await t.rpc('turn/start',{threadId:'foreign',input:[{type:'text',text:'try'}]});assert.match(foreign.error.message,/Foreign/);
  t.ws.send(JSON.stringify({id:900,result:{success:true}}));await new Promise(resolve=>t.ws.once('close',resolve));assert.equal(t.calls.length,0);assert.match(t.proxy.exportAudit().failure,/Client responses/);
 }finally{await t.close();}
});

test('async audit collector is rejected synchronously before model forwarding',async()=>{
 const t=await setup('normal',undefined,{onAudit:event=>event.kind==='turn_allowed'?Promise.reject(new Error('async failure')):undefined});try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});t.ws.send(JSON.stringify({id:301,method:'turn/start',params:{threadId:'owned-thread',input:[{type:'text',text:'try'}]}}));
  await new Promise(resolve=>t.ws.once('close',resolve));assert.match(t.proxy.exportAudit().failure,/synchronous/);assert.equal(t.calls.length,0);
 }finally{await t.close();}
});

test('raw execution schemas cannot be installed as guard tools',async()=>{
 await assert.rejects(createCodexProxy({controllerFactory:async()=>({}),toolSchemas:[{name:'exec_command',description:'raw',inputSchema:{type:'object'}}],strictCatalog:restrictCatalog({models:[{slug:'fixture-model'}]})}),/Unsafe workflow tool schema/);
});

test('oversized result is fatal before native context can truncate evidence',async()=>{
 const t=await setup('normal',async()=>({ok:true,data:'x'.repeat(65537)}));try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.match(t.proxy.exportAudit().failure,/result exceeds/);
 }finally{await t.close();}
});
test('compaction closes before a queued business call can execute',async()=>{
 const t=await setup('compaction');try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.equal(t.calls.length,0);assert.match(t.proxy.exportAudit().failure,/compaction/i);
 }finally{await t.close();}
});
test('messages queued after fatal unknown request never execute',async()=>{
 const t=await setup('unknown-followed-valid');try{
  await t.rpc('initialize',{});await t.rpc('thread/start',{});await t.rpc('turn/start',{threadId:'owned-thread',input:[{type:'text',text:'try'}]});
  await new Promise(resolve=>t.ws.once('close',resolve));assert.equal(t.calls.length,0);
 }finally{await t.close();}
});
