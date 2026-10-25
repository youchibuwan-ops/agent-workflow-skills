import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import * as plugin from './index.mjs';
import { bindController } from './binding.mjs';

// Core is under concurrent implementation. Only this controller boundary is
// doubled; every tool execution below uses the real native ToolRuntime.
async function fixture(dispatch=async()=>({ok:true,value:'accepted'})) {
  let aborted, calls=0, faults=0;
  const controller={toolSchemas:[{name:'workflow_action',description:'Constrained action',inputSchema:{type:'object',properties:{},additionalProperties:false}}],instructions:'Follow workflow',stage:'scope',complete:false,ready:true,
    assertReady(){if(!this.ready) throw new Error('controller unhealthy');},
    async dispatch(name,args,meta){calls++;return dispatch(name,args,meta);},abort(reason){aborted=reason;},exportAudit(){return {};}};
  const release=bindController(controller,{onFatal(){faults++;}});
  const ctx=new Context();
  await ctx.plugin(SystemPrompt,{});await ctx.plugin(ToolRuntime);
  const fiber=await ctx.plugin(plugin);
  const run=(name,args={},parent)=>ctx.tools.execute({name,arguments:args,callId:ToolCallId('test-call'),signal:new AbortController().signal,...parent?{parent}:{}});
  return {ctx,fiber,controller,run,get calls(){return calls;},get aborted(){return aborted;},get faults(){return faults;},async close(){await ctx.fiber.dispose();release();}};
}

test('only controller schema tools reach constrained dispatcher, with call identity',async()=>{
  let received;
  const f=await fixture(async(...args)=>{received=args;return {ok:true,value:'accepted'};});
  try {const result=await f.run('workflow_action');assert.equal(result.isError,false);assert.equal(received[0],'workflow_action');assert.deepEqual(received[1],{});assert.equal(received[2].callId,'test-call');}finally{await f.close();}
});
test('native raw shell and newly registered unknown tools never enter their bodies',async()=>{
  const f=await fixture();let writes=0;
  try {
    for(const name of ['pwsh','unknown_dynamic']) f.ctx.tools.register({name,description:'Forbidden',parameters:{type:'object',properties:{}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{writes++;return 'written';}});
    for(const name of ['pwsh','unknown_dynamic']) assert.equal((await f.run(name)).isError,true);
    assert.equal(writes,0);assert.equal(f.calls,0);
  }finally{await f.close();}
});
test('managed plugin unload leaves a root-owned rejection, without dispatcher fallback',async()=>{
  const f=await fixture();
  try {await f.fiber.dispose();let escaped=0;f.ctx.tools.register({name:'workflow_action',description:'Replacement',parameters:{type:'object',properties:{}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{escaped++;return 'escaped';}});assert.equal((await f.run('workflow_action')).isError,true);assert.equal(escaped,0);assert.equal(f.calls,0);assert(f.aborted);assert.equal(f.faults,1);}finally{await f.close();}
});
test('guard health exceptions deny before dispatch and trigger fatal host abort',async()=>{
  const f=await fixture();
  try {f.controller.ready=false;assert.equal((await f.run('workflow_action')).isError,true);assert.equal(f.calls,0);assert.match(f.aborted,/controller unhealthy/);assert.equal(f.faults,1);}finally{await f.close();}
});
test('ordinary rejected workflow actions remain correctable without host abort',async()=>{
  let first=true;
  const f=await fixture(async()=>first?(first=false,{ok:false,error:'missing source',missing:['source'],state:{stage:'discovery',complete:false}}):({ok:true,state:{stage:'selection',complete:false}}));
  try {const denied=await f.run('workflow_action');assert.equal(denied.isError,false);assert.equal(denied.value.ok,false);assert.equal(f.aborted,undefined);assert.equal((await f.run('workflow_action')).value.ok,true);}finally{await f.close();}
});
test('dispatcher exceptions and explicit fatal results close subsequent execution',async()=>{
  for(const dispatch of [async()=>{throw new Error('collector fault');},async()=>({ok:false,fatal:true,error:'integrity failure'})]){
    const f=await fixture(dispatch);
    try {const failure=await f.run('workflow_action');assert.equal(failure.isError,true);assert(f.aborted);assert.equal((await f.run('workflow_action')).isError,true);assert.equal(f.calls,1);}finally{await f.close();}
  }
});
test('nested calls are denied even when they name an allowed dispatcher tool',async()=>{
  const f=await fixture();
  try {assert.equal((await f.run('workflow_action')).isError,false);assert.equal((await f.run('workflow_action',{},Symbol('parent'))).isError,true);assert.equal(f.calls,1);}finally{await f.close();}
});
test('downstream source-content replacement aborts before a second dispatcher call',async()=>{
  const f=await fixture();
  try {
    f.ctx.on('tools/post-execute',async()=>({kind:'accept',content:[{type:'text',text:'replaced with summary'}]}));
    await f.run('workflow_action');
    assert(f.aborted);assert.equal((await f.run('workflow_action')).isError,true);assert.equal(f.calls,1);
  }finally{await f.close();}
});
