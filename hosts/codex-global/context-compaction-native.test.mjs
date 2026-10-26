import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createStrictBackend} from './native-backend.mjs';
import {restrictCatalog} from '../codex/strict-config.mjs';
import {observeContextCompaction} from './context-compaction.mjs';
import {createDesktopGateway} from './gateway.mjs';
import {createRequire} from 'node:module';
import {once} from 'node:events';
const {WebSocket}=createRequire(new URL('../codex/package.json',import.meta.url))('ws');

test('installed native config preserves supplied compaction preferences without loosening execution',{skip:!process.env.WORKFLOW_NATIVE_EXE,timeout:30000},async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-native-compact-config-'));let native;
 try{
  native=await createStrictBackend({backendCommand:[process.env.WORKFLOW_NATIVE_EXE,'-c','model_auto_compact_token_limit=120000','-c','model_post_turn_compact_threshold_percent=80','-c','features.async_compaction=true'],strictCatalog:restrictCatalog(process.env.WORKFLOW_MODEL_CATALOG??path.join(os.homedir(),'.codex/models_cache.json')),stateRoot:path.join(root,'state')});
  const {config}=await native.rpc('config/read',{includeLayers:false});assert.equal(config.model_auto_compact_token_limit,120000);assert.equal(config.model_post_turn_compact_threshold_percent,80);assert.equal(config.features.async_compaction,true);assert.equal(config.features.shell_tool,false);assert.equal(config.features.multi_agent,false);assert.equal(config.default_permissions,':read-only');native.assertIntegrity();
 }finally{await native?.close();rmSync(root,{recursive:true,force:true});}
});

// Uses a deterministic loopback provider, never a paid provider or account auth.
test('installed native compaction emits correlated item lifecycle before completion',{skip:!process.env.WORKFLOW_NATIVE_EXE,timeout:30000},async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-native-compact-')),work=path.join(root,'work');mkdirSync(work);
 const events=[],requests=[];const threadState={id:null,turnId:null,active:false,controller:{compactionReady:()=>true}};const server=createServer(async(req,res)=>{
  const parts=[];for await(const b of req)parts.push(b);requests.push({url:req.url,body:JSON.parse(Buffer.concat(parts).toString())});
  if(req.url.endsWith('/compact')){
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'compact-local',object:'response.compaction',output:[{type:'compaction',id:'compact-local-item',encrypted_content:'local-fixture-compaction'}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));return;
  }
  res.writeHead(200,{'content-type':'text/event-stream'});const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  emit('response.created',{response:{id:'local-response'}});emit('response.output_item.done',{output_index:0,item:{type:'message',id:'local-message',role:'assistant',content:[{type:'output_text',text:'Previously observed local fixture history.'}]}});emit('response.completed',{response:{id:'local-response',status:'completed',usage:{input_tokens:64,output_tokens:1,total_tokens:65}}});res.end();
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let native;
 const until=async predicate=>{for(let i=0;i<1000&&!predicate();i++)await new Promise(r=>setTimeout(r,10));assert.ok(predicate(),'installed native lifecycle completed');};
 try{
  // Artificial threshold exercises native compaction, without limiting replies
  // or changing installed/daily settings.
  native=await createStrictBackend({backendCommand:[process.env.WORKFLOW_NATIVE_EXE,'-c','model_auto_compact_token_limit=32','-c','model_provider="probe"','-c',`model_providers.probe={name="local-compaction-test",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false}`],strictCatalog:restrictCatalog(process.env.WORKFLOW_MODEL_CATALOG??path.join(os.homedir(),'.codex/models_cache.json')),stateRoot:path.join(root,'state'),onNotification:m=>{
   if(m.method==='turn/started'){threadState.id=m.params.threadId;threadState.turnId=m.params.turn.id;threadState.active=true;threadState.contextCompaction={toolDelivered:false,pending:null};}
   observeContextCompaction(m,threadState);
   if(m.method==='turn/completed')threadState.active=false;
   events.push(m);
  }});
  const thread=(await native.rpc('thread/start',{cwd:work,ephemeral:false,approvalPolicy:'never',sandbox:'read-only'})).thread;
  await native.rpc('turn/start',{threadId:thread.id,input:[{type:'text',text:'Local provider fixture history.'}]});await until(()=>events.some(e=>e.method==='turn/completed'));
  const autoBefore=events.length;await native.rpc('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue after previously observed local history.'}]});await until(()=>events.slice(autoBefore).some(e=>e.method==='turn/completed'));
  assert.ok(events.slice(autoBefore).some(e=>e.method==='item/completed'&&e.params.item.type==='contextCompaction'),'automatic native compaction crossed the safe guard boundary');
  const before=events.length;assert.deepEqual(await native.rpc('thread/compact/start',{threadId:thread.id}),{});
  await until(()=>events.slice(before).some(e=>e.method==='item/completed'&&e.params.item.type==='contextCompaction'));
  const compaction=events.slice(before),start=compaction.find(e=>e.method==='item/started'&&e.params.item.type==='contextCompaction'),complete=compaction.find(e=>e.method==='item/completed'&&e.params.item.type==='contextCompaction');
  assert.ok(start);assert.equal(start.params.threadId,thread.id);assert.equal(complete.params.threadId,thread.id);assert.equal(start.params.turnId,complete.params.turnId);assert.equal(start.params.item.id,complete.params.item.id);assert.ok(compaction.indexOf(start)<compaction.indexOf(complete));assert.ok(requests.length>=2);
 }finally{await native?.close();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true});}
});

test('desktop gateway permits actual automatic native compaction and subsequent same-chat turns',{skip:!process.env.WORKFLOW_NATIVE_EXE,timeout:30000},async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-gateway-native-compact-')),work=path.join(root,'work');mkdirSync(work);let requests=0,g,ws;
 const provider=createServer(async(req,res)=>{
  for await(const _ of req){}requests++;
  if(req.url.endsWith('/compact')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'local-compact-'+requests,object:'response.compaction',output:[{type:'compaction',id:'local-summary-'+requests,encrypted_content:'local-fixture-compaction'}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}));return;}
  res.writeHead(200,{'content-type':'text/event-stream'});const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);emit('response.created',{response:{id:'local-response-'+requests}});emit('response.output_item.done',{output_index:0,item:{type:'message',id:'local-message-'+requests,role:'assistant',content:[{type:'output_text',text:'Local native automatic compaction transport fixture.'}]}});emit('response.completed',{response:{id:'local-response-'+requests,status:'completed',usage:{input_tokens:64,output_tokens:1,total_tokens:65}}});res.end();
 });await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const schemas=[{name:'workflow_status',description:'status',inputSchema:{type:'object'}}];
 try{
  g=await createDesktopGateway({stateRoot:path.join(root,'state'),strictCatalog:restrictCatalog(process.env.WORKFLOW_MODEL_CATALOG??path.join(os.homedir(),'.codex/models_cache.json')),backendCommand:[process.env.WORKFLOW_NATIVE_EXE,'-c','model_auto_compact_token_limit=32','-c','model_provider="probe"','-c',`model_providers.probe={name="local-auto-compaction",base_url="http://127.0.0.1:${provider.address().port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false}`],toolSchemas:schemas,controllerFactory:async()=>({toolSchemas:schemas,stage:'discovery',complete:false,ready:true,instructions:'Host state remains authoritative after native summaries.',compactionReady:()=>true,assertReady(){},abort(){},dispatch(){throw Error('No tool requested by local fixture');}})});
  ws=new WebSocket(g.url);await once(ws,'open');let next=0;const pending=new Map();ws.on('message',bytes=>{const m=JSON.parse(bytes);if(m.id===undefined)return;const request=pending.get(m.id);pending.delete(m.id);m.error?request?.reject(Error(m.error.message)):request?.resolve(m.result);});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await rpc('initialize');const {thread}=await rpc('thread/start',{cwd:work});
  for(let turn=1;turn<=3;turn++){
   await rpc('turn/start',{threadId:thread.id,input:[{type:'text',text:'Continue current local fixture '+turn}]});
   for(let i=0;i<1000&&!g.exportAudit().failure&&g.exportAudit().events.filter(e=>e.kind==='turn_finished').length<turn;i++)await new Promise(r=>setTimeout(r,10));
   assert.equal(g.exportAudit().failure,null);assert.equal(g.exportAudit().events.filter(e=>e.kind==='turn_finished').length,turn);
  }
  assert.ok(g.exportAudit().events.filter(e=>e.kind==='context_compaction'&&e.method==='item/completed').length>=2);assert.ok(requests>=5);
 }finally{ws?.terminate();await g?.close();await new Promise(r=>provider.close(r));rmSync(root,{recursive:true,force:true});}
});
