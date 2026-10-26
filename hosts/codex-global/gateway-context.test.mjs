import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createDesktopGateway} from './gateway.mjs';
const {WebSocket}=createRequire(new URL('../codex/package.json',import.meta.url))('ws');
const schemas=[{name:'workflow_read_source',description:'read current source',inputSchema:{type:'object'}}];
const catalog={models:[{slug:'fixture',tool_mode:'direct',multi_agent_version:null,multi_agent_reasoning_effort:null,shell_type:'disabled',apply_patch_tool_type:null,experimental_supported_tools:[]}]};
const backend=`
if(process.argv.includes('--version')){console.log('codex-cli 0.164.0-alpha.11.1');process.exit(0);}
const send=m=>console.log(JSON.stringify(m));let n=0,current;
const compact=(threadId,turnId,id='compact-1')=>{send({method:'item/started',params:{threadId,turnId,item:{type:'contextCompaction',id},startedAtMs:1}});send({method:'item/completed',params:{threadId,turnId,item:{type:'contextCompaction',id},completedAtMs:2}});};
for await(const line of (await import('node:readline')).createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(!m.method){if(m.id==='tool-request'){
  send({method:'item/completed',params:{threadId:current.threadId,turnId:current.turnId,item:{type:'agentMessage',id:'received',text:JSON.stringify(m.result)}}});
  if(current.mode==='after-delivery')compact(current.threadId,current.turnId);
  send({method:'turn/completed',params:{threadId:current.threadId,turn:{id:current.turnId,status:'completed'}}});
  if(current.mode==='idle')compact(current.threadId,current.turnId);
 }continue;}if(m.id===undefined)continue;
 const result=m.method==='initialize'?{}:m.method==='thread/start'?{thread:{id:'thread-'+(++n),cwd:m.params.cwd}}:m.method==='turn/start'?{turn:{id:'turn-'+(++n)}}:m.params;
 send({id:m.id,result});if(m.method==='turn/start'){
  const threadId=m.params.threadId,turnId=result.turn.id,mode=m.params.input[0].text;current={threadId,turnId,mode};
  send({method:'turn/started',params:{threadId,turn:{id:turnId}}});
  if(mode==='before-delivery')compact(threadId,turnId);
  if(mode==='legacy')send({method:'thread/compacted',params:{threadId,turnId}});
  if(mode==='foreign')compact('foreign-thread',turnId);
  if(mode==='unknown')send({method:'thread/compact/unknown',params:{threadId,turnId}});
  if(mode==='mismatched'){
   send({method:'item/started',params:{threadId,turnId,item:{type:'contextCompaction',id:'a'},startedAtMs:1}});
   send({method:'item/completed',params:{threadId,turnId,item:{type:'contextCompaction',id:'b'},completedAtMs:2}});
  }
  if(mode==='tool-during-compaction'||mode==='turn-during-compaction')send({method:'item/started',params:{threadId,turnId,item:{type:'contextCompaction',id:'open'},startedAtMs:1}});
  if(mode==='turn-during-compaction')send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});
  if(mode==='completion-only')send({method:'item/completed',params:{threadId,turnId,item:{type:'contextCompaction',id:'unseen'},completedAtMs:2}});
  send({id:'tool-request',method:'item/tool/call',params:{threadId,turnId,callId:'call-'+n,tool:'workflow_read_source',arguments:{}}});
 }
}`;
async function scenario(mode,{ready=true,largeCard=false,result={ok:true,data:{content:'FULL SOURCE BYTES',source_receipt:'unpredictable-receipt'},state:{stage:'discovery',complete:false,evidence:['private authoritative evidence']}}}={}){
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-context-')),work=path.join(root,'work');mkdirSync(work);const cards=[];
 const g=await createDesktopGateway({toolSchemas:schemas,strictCatalog:catalog,stateRoot:path.join(root,'state'),backendCommand:[process.execPath,'--input-type=module','-e',backend,'--'],onCard:card=>cards.push(card),controllerFactory:async input=>{
  if(largeCard)await input.onCard({stage:'discovery',checkpoint:{evidence:['full card '.repeat(10000)]}});
  return{toolSchemas:schemas,instructions:'host authority',stage:'discovery',complete:false,ready:true,...(ready===undefined?{}:{compactionReady:()=>ready}),assertReady(){},abort(){},dispatch:async()=>result};
 }});
 const ws=new WebSocket(g.url);await once(ws,'open');const events=[],pending=new Map();let next=0;
 ws.on('message',b=>{const m=JSON.parse(b);if(m.id!==undefined){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else events.push(m);});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 try{
  await rpc('initialize');const thread=(await rpc('thread/start',{cwd:work})).thread;
  await rpc('turn/start',{threadId:thread.id,input:[{type:'text',text:mode}]});
  for(let i=0;i<400;i++){if(g.exportAudit().closed||g.exportAudit().events.some(e=>e.kind==='turn_finished')&&(mode!=='idle'||events.some(e=>e.method==='item/completed'&&e.params?.item?.type==='contextCompaction')))break;await new Promise(r=>setTimeout(r,5));}
  return{audit:g.exportAudit(),events,cards};
 }finally{ws.terminate();await g.close();rmSync(root,{recursive:true,force:true});}
}

test('native compaction of observed earlier history can complete before first current-turn tool delivery',async()=>{
 for(const mode of ['before-delivery','legacy','idle']){
  const s=await scenario(mode);assert.equal(s.audit.failure,null,mode);assert.equal(s.audit.events.filter(e=>e.kind==='dispatch').length,1);assert.ok(s.events.some(e=>e.method==='item/completed'&&e.params?.item?.id==='received'));
 }
});

test('unconfirmed sources, delivered current-turn bytes, foreign and unknown compaction events fail closed',async()=>{
 for(const [mode,ready] of [['before-delivery',false],['after-delivery',true],['foreign',true],['unknown',true],['mismatched',true],['tool-during-compaction',true],['completion-only',true]]){
  const s=await scenario(mode,{ready});assert.match(s.audit.failure,/compaction|compact/i,mode);
  assert.equal(s.audit.events.filter(e=>e.kind==='dispatch').length,mode==='after-delivery'?1:0,mode);
 }
});

test('unfinished native compaction cannot be hidden by a turn completion',async()=>{
 const s=await scenario('turn-during-compaction');assert.match(s.audit.failure,/unfinished compaction/i);assert.equal(s.audit.events.filter(e=>e.kind==='turn_finished').length,0);
});

test('dynamic result keeps full source bytes and receipts while full host cards stay in UI and audit only',async()=>{
 const s=await scenario('ordinary',{largeCard:true});assert.equal(s.audit.failure,null);
 const native=s.events.find(e=>e.method==='item/completed'&&e.params?.item?.id==='received');assert.ok(native);
 const response=JSON.parse(native.params.item.text),body=JSON.parse(response.contentItems[0].text);
 assert.equal(response.success,true);assert.equal(body.data.content,'FULL SOURCE BYTES');assert.equal(body.data.source_receipt,'unpredictable-receipt');assert.equal(Object.hasOwn(body,'hostCards'),false);
 assert.equal(s.cards[0].checkpoint.evidence[0].length,100000);assert.equal(s.audit.events.find(e=>e.kind==='card').card.checkpoint.evidence[0].length,100000);
 assert.ok(s.events.some(e=>e.method==='workflow/card'&&e.params.checkpoint.evidence[0].length===100000));
});

test('compact dynamic refusal keeps error data and unsuccessful native status',async()=>{
 const s=await scenario('ordinary',{result:{ok:false,reason:'Explicit operation refusal',data:{error:{code:'missing',path:'current.txt'}},state:{stage:'discovery',complete:false}}});assert.equal(s.audit.failure,null);
 const response=JSON.parse(s.events.find(e=>e.method==='item/completed'&&e.params?.item?.id==='received').params.item.text),body=JSON.parse(response.contentItems[0].text);
 assert.equal(response.success,false);assert.equal(body.reason,'Explicit operation refusal');assert.deepEqual(body.data,{error:{code:'missing',path:'current.txt'}});
});
