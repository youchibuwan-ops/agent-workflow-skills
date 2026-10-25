import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createWorkflowHost } from '../core/workflow-host.mjs';
import { installDshProfile } from './install.mjs';
import { bootGuardedDsh } from './launcher.mjs';

test('real native scheduler rejects same-response read/review then accepts next-response opaque confirmation',{skip:!process.env.DSH_RUNTIME_ROOT,timeout:30000},async()=>{
  const root=mkdtempSync(resolve(process.env.DSH_TEST_ROOT??tmpdir(),'dsh-native-source-proof-'));
  const workspace=resolve(root,'workspace'),mirror=resolve(root,'mirror');mkdirSync(workspace);mkdirSync(mirror);
  writeFileSync(resolve(mirror,'SKILL.md'),'---\nname: proof-probe\ndescription: Test source delivery and confirmation.\n---\nRead LICENSE before adoption.\n');
  writeFileSync(resolve(mirror,'LICENSE'),readFileSync(new URL('./LICENSE',import.meta.url)));
  const controller=await createWorkflowHost({workspace,userMessage:'Inspect and adopt the permitted method.',stateRoot:resolve(root,'state'),contract:{requirements:['license'],catalog:[{id:'proof-probe',path:mirror,version:'current-proof-test'}],selection:{mode:'fixed',instruction:'Use this method.'}}});
  const home=resolve(root,'home');await installDshProfile({home,runtimeRoot:process.env.DSH_RUNTIME_ROOT});
  const boot=await bootGuardedDsh({controller,workspace,home,runtimeRoot:process.env.DSH_RUNTIME_ROOT});
  const {ctx}=boot;let handle;
  const events=[];
  try {
    const {LlmAdapter,ToolCallId,createUserMessage}=await boot.importRuntime('@deepseek-ai/dsh-llm');
    const {SessionId}=await boot.importRuntime('@deepseek-ai/dsh-session');
    const {installModelSelection}=await boot.importRuntime('@deepseek-ai/dsh-agent');
    let call=0;
    const native=async(name,args={})=>(await ctx.tools.execute({name,arguments:args,callId:ToolCallId(`prelude-${++call}`),signal:new AbortController().signal})).value;
    assert.equal((await native('workflow_search_skills',{query:'proof'})).ok,true);
    const opened=await native('workflow_open_skill',{candidate:'proof-probe'});
    const read=await native('workflow_read_source',{source:opened.data.source,path:'SKILL.md'});
    if(read.data.source_receipt) assert.equal((await native('workflow_confirm_sources',{receipts:[read.data.source_receipt]})).ok,true);
    const review={candidate:'proof-probe',decision:'adopt',reason:'The full method and license were returned and then confirmed.',covers:['license']};
    let rounds=0;
    class ScriptedAdapter extends LlmAdapter {
      async resolveModel(provider,model){return {provider,id:model,name:model};}
      async *stream(options){
        rounds++;
        let calls;
        if(rounds===1) calls=[{id:'last-read',name:'workflow_read_source',args:{source:opened.data.source,path:'LICENSE'}},{id:'too-early-review',name:'workflow_review_skill',args:review}];
        else if(rounds===2){
          const delivered=options.messages.find(m=>m.role==='tool'&&m.toolCallId==='last-read');
          const payload=JSON.parse(delivered.content.filter(b=>b.type==='text').map(b=>b.text).join(''));
          calls=[{id:'confirm-real-proof',name:'workflow_confirm_sources',args:{receipts:[payload.data.source_receipt??'old-core-has-no-proof']}},{id:'review-after-confirmation',name:'workflow_review_skill',args:review}];
        } else {
          yield {type:'block-start',index:0,blockType:'text'};
          yield {type:'text-delta',index:0,text:'Native scheduler probe finished.'};
          yield {type:'block-end',index:0,block:{type:'text',text:'Native scheduler probe finished.'}};
          yield {type:'finish',reason:{kind:'stop'}};return;
        }
        for(let i=0;i<calls.length;i++){
          const item=calls[i],args=JSON.stringify(item.args),id=ToolCallId(item.id);
          yield {type:'block-start',index:i,blockType:'tool-call'};
          yield {type:'tool-call-delta',index:i,id,name:item.name,argumentsDelta:args};
          yield {type:'block-end',index:i,block:{type:'tool-call',id,name:item.name,arguments:args}};
        }
        yield {type:'finish',reason:{kind:'tool-calls'}};
      }
    }
    ctx.llm.registerAdapter(['native-proof-script'],new ScriptedAdapter());
    const selection={provider:'native-proof-script',model:'scripted-no-http'};
    handle=await ctx.agents.create({sessionId:SessionId(`proof-${Date.now()}`),meta:{cwd:workspace},agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined});agentCtx.tools.restrict({allow:controller.toolSchemas.map(s=>s.name)});agentCtx.systemPrompt.section({name:'proof-script',order:0,text:controller.instructions,complete:true,interpolate:false});}});
    const stop=ctx.on('session/event',(session,event)=>{if(session===handle.agent.session&&['tool/call','tool/result','assistant/message','turn/end'].includes(event.type))events.push(event);});
    try {handle.agent.followup(createUserMessage({content:[{type:'text',text:'Run the native read/confirmation ordering probe.'}],source:{kind:'user'}}));await handle.agent.whenIdle();await ctx.sessions.flush(handle.agent.session);}finally{stop();}
    writeFileSync(resolve(root,'native-model-events.json'),JSON.stringify(events,null,2));
    writeFileSync(resolve(root,'host-audit.json'),JSON.stringify(controller.exportAudit(),null,2));
    const payloadFor=id=>JSON.parse(events.find(e=>e.type==='tool/result'&&e.data.message.toolCallId===id).data.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''));
    assert.equal(payloadFor('too-early-review').ok,false,'Same response reviewed bytes it had not received yet');
    assert.equal(payloadFor('confirm-real-proof').ok,true);
    assert.equal(payloadFor('review-after-confirmation').ok,true);
    assert.equal(controller.exportAudit().events.filter(e=>e.event==='observed'&&e.kind==='skill_review').length,1);
    assert.equal(rounds,3);
  }finally{await handle?.dispose();await boot.close();}
});
