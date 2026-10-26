import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeImporter} from './runtime.mjs';

import {projectToolResultStates,compactSessionToolResultStates} from './context-projection.mjs';
const raw=' { "ok": true, "data" : { "content" : "\\u539f\\u59cb\\r\\n", "source_receipt":"unconfirmed" }, "state" : {"task":"t","revision":2,"stage":"discovery","complete":false,"blockedReason":null,"needs_input":false,"evidence":["e"],"candidates":["large repeated state"]} } ';
const message=(id,text=raw)=>Object.freeze({id:'message-'+id,role:'tool',source:Object.freeze({kind:'tool',callId:id}),toolCallId:id,content:Object.freeze([Object.freeze({type:'text',text}),Object.freeze({type:'image',url:'data:image/png;base64,retained'})])});

test('projects only explicitly eligible delivered calls and keeps exact source JSON text',()=>{
  const old=message('old'),pending=message('pending'),messages=Object.freeze([old,pending]);
  const projected=projectToolResultStates(messages,{eligibleCallIds:new Set(['old','pending']),protectedCallIds:new Set(['pending'])});
  assert.notEqual(projected,messages);
  assert.equal(projected[1],pending);
  assert.equal(old.content[0].text,raw);
  assert.equal(projected[0].content[1],old.content[1]);
  const text=projected[0].content[0].text;
  assert.ok(text.includes('"data" : { "content" : "\\u539f\\u59cb\\r\\n", "source_receipt":"unconfirmed" }'));
  assert.deepEqual(JSON.parse(text).data,JSON.parse(raw).data);
  assert.equal(JSON.parse(text).state.candidates,undefined);
  assert.deepEqual(JSON.parse(text).state.evidence,['e']);
});

test('default deny, invalid JSON, nested state strings, mismatched identities and non-tool messages stay unchanged',()=>{
  const inputs=[message('no'),message('nested','{"ok":true,"data":{"state":{"raw":"keep"}},"state":{"task":"t","candidates":["x"]}}'),message('bad','{"ok":true,"state":broken}'),{...message('mismatch'),toolCallId:'different'},{role:'assistant',content:[{type:'text',text:raw}]}];
  assert.equal(projectToolResultStates(inputs),inputs);
  const projected=projectToolResultStates(inputs,{eligibleCallIds:new Set(['nested','bad','mismatch'])});
  assert.equal(projected[0],inputs[0]);
  assert.equal(projected[2],inputs[2]);
  assert.equal(projected[3],inputs[3]);
  assert.equal(projected[4],inputs[4]);
  assert.ok(projected[1].content[0].text.includes('"data":{"state":{"raw":"keep"}}'));
  assert.equal(JSON.parse(projected[1].content[0].text).state.candidates,undefined);
});

test('ambiguous duplicate state properties are preserved without guessing',()=>{
  const input=[message('duplicate','{"ok":true,"state":{"candidates":["first"]},"state":{"task":"t","candidates":["second"]}}')];
  assert.equal(projectToolResultStates(input,{eligibleCallIds:['duplicate']}),input);
});

test('official frozen DSH messages remain immutable inputs to the pure projection',{skip:!process.env.DSH_RUNTIME_ROOT},async()=>{
  const load=runtimeImporter(process.env.DSH_RUNTIME_ROOT);
  const {createToolResultMessage,ToolCallId}=await load('@deepseek-ai/dsh-llm');
  const original=createToolResultMessage({callId:ToolCallId('native-old'),content:[{type:'text',text:raw}]});
  const inputs=Object.freeze([original]);
  const projected=projectToolResultStates(inputs,{eligibleCallIds:['native-old']});
  assert.equal(original.content[0].text,raw);
  assert.equal(original.source.callId,projected[0].source.callId);
  assert.equal(original.toolCallId,projected[0].toolCallId);
  assert.equal(JSON.parse(projected[0].content[0].text).state.candidates,undefined);
});

test('official Session append-only replacement compacts delivered state and preserves original log and pending data',{skip:!process.env.DSH_RUNTIME_ROOT},async()=>{
  const load=runtimeImporter(process.env.DSH_RUNTIME_ROOT);
  const {Session,SessionId}=await load('@deepseek-ai/dsh-session');
  const {createToolResultMessage,ToolCallId,freezeMessage}=await load('@deepseek-ai/dsh-llm');
  const session=Session.create(SessionId('state-projection-native'));
  for(const id of ['old','pending']) {
    session.append('tool/call',{turn:1,step:1,callId:ToolCallId(id),name:'workflow_read_source',arguments:'{}'});
    session.append('tool/result',{turn:1,step:1,message:createToolResultMessage({callId:ToolCallId(id),isError:false,content:[{type:'text',text:raw}]})},{surfaceOp:'append'});
  }
  const before=session.snapshotEvents(),bytes=JSON.stringify(before),oldSeq=before.find(e=>e.type==='tool/result').seq;
  const result=compactSessionToolResultStates(session,{eligibleCallIds:['old','pending'],protectedCallIds:['pending'],freezeMessage,estimateMessage:()=>123});
  assert.equal(result.replaced.length,1);
  assert.equal(result.replaced[0].callId,'old');
  assert.equal(JSON.stringify(session.snapshotEvents().slice(0,before.length)),bytes);
  assert.equal(session.eventAt(oldSeq).data.message.content[0].text,raw);
  const messages=session.deriveMessages();
  assert.equal(messages.find(m=>m.toolCallId==='pending').content[0].text,raw);
  const text=messages.find(m=>m.toolCallId==='old').content[0].text;
  assert.equal(JSON.parse(text).state.candidates,undefined);
  assert.ok(text.includes('"data" : { "content" : "\\u539f\\u59cb\\r\\n", "source_receipt":"unconfirmed" }'));
  const appended=session.snapshotEvents().slice(before.length);
  assert.equal(appended[0].type,'compaction/prune');
  assert.equal(appended[0].data.shadowedTokenCount,123);
  assert.deepEqual(appended[1].sourceEventSeqs,[oldSeq]);
  const replay=Session.create(session.id,session.snapshotEvents(),session.header);
  assert.deepEqual(replay.deriveMessages(),session.deriveMessages());
  assert.deepEqual(compactSessionToolResultStates(session,{eligibleCallIds:['old'],freezeMessage,estimateMessage:()=>123}).replaced,[]);
});
