import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,delimiter} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {runtimeImporter,runtimeBin} from './runtime.mjs';
import {requiredSessionPolicy} from './policy.mjs';
import {installSessionBroker,recoverDeliveredCallIds} from './broker.mjs';
const runtimeRoot=process.env.DSH_RUNTIME_ROOT;

test('cold native history requires later model step proof and excludes log upload ACKs and reused pending IDs',{skip:!runtimeRoot},async()=>{
  const load=runtimeImporter(runtimeRoot),{Session,SessionId}=await load('@deepseek-ai/dsh-session');
  const {createToolResultMessage,createAssistantMessage,ToolCallId}=await load('@deepseek-ai/dsh-llm');
  const session=Session.create(SessionId('cold-history-delivery-proof'));
  const result=(id,step)=>{session.append('tool/call',{turn:1,step,callId:ToolCallId(id),name:'workflow_read_source',arguments:'{}'});session.append('tool/result',{turn:1,step,message:createToolResultMessage({callId:ToolCallId(id),isError:false,content:[{type:'text',text:'{"ok":true,"data":{"content":"raw"},"state":{"task":"t","candidates":["old"]}}'}]})},{surfaceOp:'append'});};
  const assistant=step=>session.append('assistant/message',{turn:1,step,stream:[],message:createAssistantMessage({source:{provider:'offline',model:'native'},content:[{type:'text',text:'Fixture native model response.'}]})},{surfaceOp:'append'});
  result('old',1);assistant(1);assert.deepEqual([...recoverDeliveredCallIds(session)],[]);
  result('same-step',2);
  session.append('session-log-deepseek/delivery-accepted',{sessionId:session.id,sessionFormatVersion:4,throughSeq:session.seq-1});
  assert.deepEqual([...recoverDeliveredCallIds(session)],[]);
  assistant(2);assert.deepEqual([...recoverDeliveredCallIds(session)],['old']);
  result('old',3);assert.deepEqual([...recoverDeliveredCallIds(session)],[]);
  const restored=Session.create(session.id,session.snapshotEvents(),session.header);
  assert.deepEqual([...recoverDeliveredCallIds(restored)],[]);
  assistant(4);assert.deepEqual([...recoverDeliveredCallIds(session)].sort(),['old','same-step']);
});

for(const sandboxMode of ['read-only','workspace-write'])test('actual DSH native project discovery lists unknown directories before reading their current file ('+sandboxMode+')',{skip:!runtimeRoot,timeout:60000},async()=>{
 const f=await setup({genericFactory:true,sandboxMode});let handle;
 try{
  const folder='场景-'+randomBytes(5).toString('hex'),name='room-'+randomBytes(5).toString('hex')+'.tscn',bytes=Buffer.from('[gd_scene format=3]\n[node name="Unknown '+randomBytes(8).toString('hex')+'" type="Node2D"]\n');mkdirSync(resolve(f.workspace,folder));writeFileSync(resolve(f.workspace,folder,name),bytes);
  const results=[],native=[],searches=[];f.ctx.on('tools/result',(exec,result)=>{if(exec.name==='workflow_read_workspace')results.push(JSON.parse(result.content[0].text));if(exec.name==='workflow_search_skills')searches.push(JSON.parse(result.content[0].text));if(exec.name==='pwsh')native.push(result);});
  const{LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm'),{SessionId}=await f.load('@deepseek-ai/dsh-session'),{installModelSelection}=await f.load('@deepseek-ai/dsh-agent');let step=0;
  f.ctx.llm.registerAdapter(['blind-project'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async*stream(options){
   const previous=options.messages.filter(m=>m.role==='tool').at(-1),result=previous?JSON.parse(previous.content[0].text):null;
   if(step>=4||result&&!result.ok){yield{type:'finish',reason:{kind:'stop'}};return;}
   const tool=step===0?'workflow_search_skills':'workflow_read_workspace',args=JSON.stringify(step===0?{query:'inspect current project'}:{path:step===1?'.':step===2?result.data.entries.find(e=>e.type==='directory')?.path:result.data.entries.find(e=>e.type==='file')?.path}),id=ToolCallId('blind-discovery-'+step++);yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name:tool,argumentsDelta:args};yield{type:'block-end',index:0,block:{type:'tool-call',id,name:tool,arguments:args}};yield{type:'finish',reason:{kind:'tool-calls'}};
  }}());
  const selection={provider:'blind-project',model:'no-network'};handle=await f.ctx.agents.create({sessionId:SessionId('unknown-native-project'),meta:{cwd:f.workspace},agentOptions:selection,setup(ctx){installModelSelection(ctx,{current:selection,assembled:undefined});}});handle.agent.followup(createUserMessage({content:[{type:'text',text:'Inspect the current selected project and report what its scene contains. I have not supplied a filename.'}],source:{kind:'user'}}));await handle.agent.whenIdle();
  assert.equal(results.length,3,JSON.stringify({results,native,step,root:f.root,status:f.ctx.workflowBrokerReady.status(handle.agent),audit:f.ctx.workflowBrokerReady.exportAudit(handle.agent)}));assert.equal(searches.length,1);assert.equal(searches[0].ok,true);assert.ok(results.every(r=>r.ok),JSON.stringify(results));assert.equal(results[0].state.workspace,undefined);const statusResult=await f.ctx.tools.execute({name:'workflow_status',arguments:{},agent:handle.agent,callId:'workspace-status',signal:new AbortController().signal});assert.equal(JSON.parse(statusResult.content[0].text).data.workspace.root,resolve(f.workspace));assert.equal(results[0].data.entries[0].path,folder);assert.equal(results[1].data.entries[0].path,folder+'/'+name);assert.equal(results[2].data.content,bytes.toString('utf8'));assert.equal(results[2].data.sha256,createHash('sha256').update(bytes).digest('hex'));assert.ok(native.length>=3,'directory and byte reads must use original native operations');assert.ok(native.every(r=>r.isError===false),JSON.stringify(native));assert.ok(readFileSync(resolve(f.workspace,folder,name)).equals(bytes));assert.equal(f.ctx.workflowBrokerReady.status(handle.agent).complete,false);
 }finally{await handle?.dispose();await f.close();}
});
test('actual SDK disposal retires a pending production task, rejects the stale Agent and requires explicit resume',{skip:!runtimeRoot,timeout:45000},async()=>{
 const f=await setup({genericFactory:true,sandboxMode:'workspace-write'});let handle;try{const{LlmAdapter,createUserMessage}=await f.load('@deepseek-ai/dsh-llm'),{SessionId}=await f.load('@deepseek-ai/dsh-session'),{installModelSelection}=await f.load('@deepseek-ai/dsh-agent');f.ctx.llm.registerAdapter(['retire-pending'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async*stream(){yield{type:'finish',reason:{kind:'stop'}}}}());const selection={provider:'retire-pending',model:'no-network'},setup=ctx=>{installModelSelection(ctx,{current:selection,assembled:undefined});};handle=await f.ctx.agents.create({sessionId:SessionId('retire-pending-production'),meta:{cwd:f.workspace},agentOptions:selection,setup});const agent=handle.agent,broker=f.ctx.workflowBrokerReady;agent.followup(createUserMessage({content:[{type:'text',text:'Inspect a pending task; no artifact has been accepted.'}],source:{kind:'user'}}));await agent.whenIdle();assert.equal(broker.status(agent).complete,false);await handle.dispose();handle=null;assert.equal(broker.status(agent).bound,false,'disposed Agent retained its controller authority');const result=await f.ctx.tools.execute({name:'workflow_status',arguments:{},agent,callId:'stale-after-disposal',signal:new AbortController().signal});assert.equal(result.isError,true);assert.match(broker.exportAudit(agent).failed,/disposed/i);await assert.rejects(f.ctx.agents.resume({resumeSessionId:SessionId('retire-pending-production'),agentOptions:selection,setup}),/explicit external|restore|paused/i);}finally{await handle?.dispose();await f.close();}
});
test('actual SDK retires a fully completed production chain without rewriting the durable envelope as failed',{skip:!runtimeRoot,timeout:90000},async()=>{
 const f=await setup({genericFactory:true,lifecycleReferences:true,sandboxMode:'workspace-write'});let handle;const sessionId='completed-production-retire',content='Current completed production lifecycle artifact.\n';
 function* discovery(){let r=yield['workflow_search_skills',{query:'ordinary task'}];const candidate=r.data.candidates[0].id;r=yield['workflow_open_skill',{candidate}];const source=r.data.source,files=r.data.files,receipts=[];for(const file of files){r=yield['workflow_read_source',{source,path:file.path}];receipts.push(r.data.source_receipt);}yield['workflow_confirm_sources',{receipts}];yield['workflow_review_skill',{candidate,decision:'adopt',reason:'Current artifact and actual external feedback.',covers:['artifact-readable','original-user-task']}];yield['workflow_install_skill',{candidate}];const sources=[];for(const id of ['a','b']){r=yield['workflow_open_reference',{reference:'https://example.com/'+id}];const source=r.data.source;sources.push(source);r=yield['workflow_read_source',{source,path:r.data.files[0].path}];yield['workflow_confirm_sources',{receipts:[r.data.source_receipt]}];yield['workflow_observe_reference',{source,observation:'Read current deterministic lifecycle fixture reference.'}];}r=yield['workflow_status',{}];yield['workflow_checkpoint',{done:['Present supported current plans'],evidence:r.state.evidence,next_action:'Wait for actual external choice',options:['a','b','c'].map(id=>({id,description:'Current plan '+id,sources,artifacts:['result-'+id+'.md']}))}];}
 function* draft(){yield['workflow_write',{path:'result-b.md',content}];yield['workflow_validate',{validator:'artifact-current',artifact:'result-b.md'}];}
 function* learning(){yield['workflow_learn',{decision:'no_increment',reason:'The current fixture repeats the installed current-output and actual-feedback method, with no new reusable mechanism.',evidence:['Actual current artifact and external user acceptance.']}];}
 try{const{LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm'),{SessionId}=await f.load('@deepseek-ai/dsh-session'),{installModelSelection}=await f.load('@deepseek-ai/dsh-agent');let userId,script,sequence=0,streamCalls=0,first=false;f.ctx.llm.registerAdapter(['retire-complete'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async*stream(options){streamCalls++;const human=options.messages.filter(m=>m.role==='user'&&m.source.kind==='user').at(-1);if(human.id!==userId){userId=human.id;const text=human.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');script=text==='/workflow choose b'?draft():text==='/workflow accept'?learning():discovery();first=true;}const previous=first?undefined:JSON.parse(options.messages.filter(m=>m.role==='tool').at(-1).content[0].text);first=false;const step=script.next(previous);if(step.done){yield{type:'finish',reason:{kind:'stop'}};return;}const[name,args]=step.value,id=ToolCallId('completed-retire-'+(++sequence)),argumentsText=JSON.stringify(args);yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsText};yield{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsText}};yield{type:'finish',reason:{kind:'tool-calls'}};}}());const selection={provider:'retire-complete',model:'no-network'},setup=ctx=>{installModelSelection(ctx,{current:selection,assembled:undefined});};handle=await f.ctx.agents.create({sessionId:SessionId(sessionId),meta:{cwd:f.workspace},agentOptions:selection,setup});const agent=handle.agent,broker=f.ctx.workflowBrokerReady,send=async text=>{handle.agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await handle.agent.whenIdle();};
  await send('Produce a reviewable current artifact; wait for my plan selection and acceptance.');assert.equal(broker.status(agent).stage,'selection',JSON.stringify(broker.status(agent)));await send('/workflow choose b');assert.equal(broker.status(agent).stage,'feedback',JSON.stringify(broker.status(agent)));assert.equal(readFileSync(resolve(f.workspace,'result-b.md'),'utf8'),content);await send('/workflow accept');assert.equal(broker.status(agent).complete,true,JSON.stringify(broker.status(agent)));assert.deepEqual(agent.session.snapshotEvents().filter(e=>e.type==='plugin:workflow/card'&&e.data.kind==='checkpoint').map(e=>e.data.report.stage),['scope','discovery','selection','draft','feedback','delivery','learning']);const envelopePath=resolve(f.root,'private-controller/sessions',createHash('sha256').update(sessionId).digest('hex')+'.json'),readEnvelope=()=>JSON.parse(readFileSync(envelopePath)).body;assert.equal(readEnvelope().complete,true);assert.equal(readEnvelope().failed,null);const completedTask=readEnvelope().taskId,completedBytes=readFileSync(envelopePath);
  await f.ctx.sessions.flush(agent.session);await handle.dispose();handle=null;assert.equal(broker.status(agent).bound,false);assert.equal(readEnvelope().complete,true);assert.equal(readEnvelope().failed,null);const stale=await f.ctx.tools.execute({name:'workflow_status',arguments:{},agent,callId:'completed-stale-after-dispose',signal:new AbortController().signal});assert.equal(stale.isError,true);
  const beforeResumeRequests=streamCalls;handle=await f.ctx.agents.resume({resumeSessionId:SessionId(sessionId),agentOptions:selection,setup});await handle.agent.whenIdle();assert(readFileSync(envelopePath).equals(completedBytes),'history-only resume changed the signed complete envelope bytes');assert.equal(streamCalls,beforeResumeRequests,'history-only resume reached the provider');assert.equal(readEnvelope().complete,true,'opening completed native history re-opened the old task');assert.equal(readEnvelope().taskId,completedTask);assert.equal(readEnvelope().failed,null);const historyTool=await f.ctx.tools.execute({name:'workflow_status',arguments:{},agent:handle.agent,callId:'completed-history-no-task',signal:new AbortController().signal});assert.equal(historyTool.isError,true,'history-only Agent obtained model tool authority');handle.agent.followup(createUserMessage({content:[{type:'text',text:'Untrusted producer work cannot open a new task.'}],source:{kind:'lifecycle-untrusted-probe'}}));await handle.agent.whenIdle();assert.equal(streamCalls,beforeResumeRequests,'unbound plugin work reached a provider');assert(readFileSync(envelopePath).equals(completedBytes));await send('A separate natural external task after completed disposal.');const next=readEnvelope();assert.notEqual(next.taskId,completedTask);assert.equal(next.failed,null);assert.equal(next.userMessage,'A separate natural external task after completed disposal.');assert.equal(broker.status(handle.agent).stage,'selection');
 }finally{await handle?.dispose();await f.close();}
});
async function setup({missing=false,nativeMode=false,sandboxMode,longOutput=false,template='headless',detachedNative=false,mandatory,complete=true,genericFactory=false,lifecycleReferences=false,initialModel,compactionFixture=false}={}){
  mkdirSync(resolve(import.meta.dirname,'.runtime-tests'),{recursive:true});
  const fixtureParent=genericFactory?resolve(tmpdir(),'dsh-global-native-boundary'):resolve(import.meta.dirname,'.runtime-tests');mkdirSync(fixtureParent,{recursive:true});const root=mkdtempSync(resolve(fixtureParent,'session-'));if(genericFactory)writeFileSync(resolve(import.meta.dirname,'.runtime-tests',`location-${root.split(/[\\/]/).at(-1)}.json`),JSON.stringify({root}));
  const home=resolve(root,'home'),workspace=resolve(root,'workspace');mkdirSync(workspace);
  const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP'])if(process.env[key]!==undefined)env[key]=process.env[key];
  env.PATH=[resolve(runtimeRoot,'node_modules/.bin'),dirname(process.execPath),process.env.PATH??''].join(delimiter);env.DSH_HOME=home;env.DSH_TELEMETRY_DISABLED='1';
  const cli=args=>new Promise((fulfill,reject)=>{const child=spawn(process.execPath,[runtimeBin(runtimeRoot),...args],{cwd:workspace,env,windowsHide:true});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>code===0?fulfill():reject(new Error(stderr)));});
  await cli(['--profile','ordinary','--from-default-profile',template,'--dump-config']);
  await cli(['plugin','--profile','ordinary','add',import.meta.dirname]);
  const log=resolve(root,'factory.jsonl');
  const factoryModule=resolve(root,'controller-factory.mjs');
  writeFileSync(factoryModule,`import {appendFileSync} from 'node:fs';
export const toolSchemas=[{name:'workflow_note',description:'Record this authorized task once.',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
let seq=0;
export async function controllerFactory(input){
 appendFileSync(${JSON.stringify(log)},JSON.stringify({event:input.kind,sessionId:input.sessionId,text:input.userMessage,resumed:input.resumed})+'\\n');
 if(input.kind==='resume')return input.previousController;
 const task=++seq; return {toolSchemas,instructions:'Use workflow_note once, then answer.',ready:true,complete:false,compactionReady(){return true},assertReady(){if(!this.ready)throw new Error('inactive task')},
 async dispatch(name,args,meta){appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'dispatch',task,sessionId:input.sessionId,actor:meta.agentId})+'\\n');
 if(${JSON.stringify(nativeMode)}==='workspace-io'){const {createNativeWorkspaceIO}=await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'../providers/native-workspace-io.mjs')).href)});const io=createNativeWorkspaceIO({workspace:input.workspace,nativeExecutor:input.nativeExecutor});const bytes=await io.read('bom-input.txt');appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'native-workspace-read',bytes:bytes.length})+'\\n');const written=await io.write('bom-output.txt',bytes);appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'native-workspace-io',bytes:written.length})+'\\n');this.complete=true;return {ok:true,bytes:written.length};}
 if(${JSON.stringify(detachedNative)}){void input.nativeExecutor.execute('write',{file_path:'detached-output.txt',content:'late-write'}).catch(()=>{});this.complete=true;return {ok:true,detached:true};}
 if(${JSON.stringify(nativeMode)}==='shell'){const result=await input.nativeExecutor.execute('pwsh',{description:'Return a short native process envelope',command:"[Console]::Out.Write('native-stdout'); [Console]::Error.Write('native-stderr')",timeoutMs:10000});appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'native-shell',result})+'\\n');this.complete=!result.isError;return {ok:!result.isError,native:result};}
 if(${JSON.stringify(nativeMode)}){await input.nativeExecutor.execute('read',{file_path:'native-output.txt'});const written=await input.nativeExecutor.execute('write',{file_path:'native-output.txt',content:'permission-aware-native-output'});appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'native-write',isError:written.isError})+'\\n');this.complete=!written.isError;return {ok:!written.isError,native:written};}
 this.complete=${JSON.stringify(complete)};return {ok:true,task,session:input.sessionId,...(${JSON.stringify(compactionFixture)}?{state:{task:'fixture',revision:1,stage:'discovery',complete:false,needs_input:false,evidence:['proof'],candidates:['repeated-state-'.repeat(1000)]},data:{content:'\\ufeffsource bytes\\r\\n',source_receipt:'pending-source-proof'}}:{}),...(${JSON.stringify(longOutput)}?{sourceBytes:'original-source-'.repeat(2000)}:{})};},
 async acceptUserMessage(text){appendFileSync(${JSON.stringify(log)},JSON.stringify({event:'external-continuation',task,text})+'\\n')},abort(){this.ready=false},exportAudit(){return {task}}};}
`);
  if(genericFactory){
    const installed=resolve(root,'installed-skills'),expert=resolve(installed,'ordinary-task-method');mkdirSync(expert,{recursive:true});
    writeFileSync(resolve(expert,'SKILL.md'),'---\nname: ordinary-task-method\ndescription: inspect an ordinary task and preserve current input bytes\n---\nRead the current project input and propose a scoped repair. Verify the actual artifact.\n');writeFileSync(resolve(expert,'LICENSE'),'MIT fixture license: permission granted to use this test method.');
    writeFileSync(factoryModule,`import {createConversationFactory,toolSchemas} from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'../conversation/controller-factory.mjs')).href)};export {toolSchemas};export const controllerFactory=createConversationFactory({stateRoot:${JSON.stringify(resolve(root,'private-controller'))},installedRoots:[${JSON.stringify(installed)}],external:false${lifecycleReferences?',sourceProviderOptions:{get:async url=>({status:200,headers:{"content-type":"text/plain"},bytes:Buffer.from("Deterministic lifecycle fixture reference "+url)})}':''}});`);
  }
  const overlay=resolve(root,'test-overlay.yml');
  writeFileSync(overlay,`${template==='headless'?'- id: headless-startup\n  disabled: true\n- id: headless-runner\n  disabled: true\n':'- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: false\n    surfaceContext: true\n'}- id: workflow-session-broker\n${missing?'  disabled: true':'  config:\n    factoryModule: '+JSON.stringify(factoryModule)}\n- id: hmr\n  disabled: true\n${sandboxMode?'- id: sandbox-policy\n  config:\n    mode: '+sandboxMode+'\n    workspaceRoot: '+JSON.stringify(workspace)+'\n':''}`);
  if(initialModel)writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: ${initialModel.provider}\n    model: ${initialModel.model}\n`,{flag:'a'});
  const load=runtimeImporter(runtimeRoot);
  const patchFiles=[overlay];
  if(mandatory){
    const manifestPath=resolve(home,'profiles/ordinary/package.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    manifest.dsh.profile.bundles=manifest.dsh.profile.bundles.filter(name=>name!=='dsh-workflow-session-broker');writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
    const {loadProfile,composeEntries,loadOverlayPatches}=await load('@deepseek-ai/dsh-app-boot');
    const profile=loadProfile('dsh','ordinary',resolve(dirname(runtimeBin(runtimeRoot)),'../package.json'),home);
    const entries=composeEntries([...profile.layers.map(layer=>layer.patches),profile.patches,loadOverlayPatches('dsh',overlay)]);
    const required=resolve(root,'mandatory-overlay.json');writeFileSync(required,JSON.stringify(requiredSessionPolicy({entries,factoryModule,brokerModule:mandatory==='missing'?resolve(root,'missing-broker.mjs'):undefined}),null,2));patchFiles.push(required);
  }
  const {runProfile}=await load('@deepseek-ai/dsh/profile-boot');
  const {createLaunchEnvironmentSnapshot}=await load('@deepseek-ai/dsh-launch-environment');
  const previousHome=process.env.DSH_HOME,previousCwd=process.cwd();process.env.DSH_HOME=home;process.chdir(workspace);
  let ctx;
  try{({ctx}=await runProfile({environment:createLaunchEnvironmentSnapshot([{source:'process',values:env}]),profile:'ordinary',patchFiles,args:template==='web'?['--host','127.0.0.1','--port','0','--no-open']:[]}));}catch(error){process.chdir(previousCwd);if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;throw error;}
  return {ctx,root,home,workspace,load,log,overlay,cli,readLog:()=>readFileSync(log,'utf8').trim().split('\n').map(JSON.parse),async close(){try{await ctx.fiber.dispose();}finally{process.chdir(previousCwd);if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;}}};
}

async function oneNativeTask(f,id='native-owner'){
  const {ctx}=f;const {LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm');const {SessionId}=await f.load('@deepseek-ai/dsh-session');const {installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
  if(!f.nativeResults){f.nativeResults=[];ctx.on('tools/result',(exec,result)=>{if(['read','write','pwsh'].includes(exec.name))f.nativeResults.push({name:exec.name,result})});}
  if(!f.nativeAdapter){ctx.llm.registerAdapter(['native-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){if(options.messages.at(-1)?.role!=='tool'){const id=ToolCallId('native-wrapper');yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'The model says this task is complete.'};yield {type:'block-end',index:0,block:{type:'text',text:'The model says this task is complete.'}};yield {type:'finish',reason:{kind:'stop'}};}}}());f.nativeAdapter=true;}
  const selection={provider:'native-script',model:'no-network'};const handle=await ctx.agents.create({sessionId:SessionId(id),meta:{cwd:f.workspace},agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined})}});
  handle.agent.followup(createUserMessage({content:[{type:'text',text:'Run an authorized native file operation through policy.'}],source:{kind:'user'}}));await handle.agent.whenIdle();return handle;
}

test('host-only native executor retains real builtin write permission and one-use permits',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:true,sandboxMode:'workspace-write'});let handle;try{handle=await oneNativeTask(f);assert.equal(f.readLog().filter(e=>e.event==='native-write').at(-1)?.isError,false,JSON.stringify({nativeResults:f.nativeResults,status:f.ctx.workflowBrokerReady.status(handle.agent)}));assert.equal(readFileSync(resolve(f.workspace,'native-output.txt'),'utf8'),'permission-aware-native-output');}finally{await handle?.dispose();await f.close();}
});

test('host native execution cannot bypass a read-only native sandbox',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:true,sandboxMode:'read-only'});let handle;try{handle=await oneNativeTask(f);assert.equal(f.readLog().filter(e=>e.event==='native-write').at(-1)?.isError,true);assert.match(JSON.stringify(f.nativeResults.find(r=>r.name==='write')),/read.only|denied|permission|sandbox/i);assert.doesNotMatch(JSON.stringify(f.nativeResults),/INVALID_ARGS/);}finally{await handle?.dispose();await f.close();}
});

test('native permission denial is preserved even with a valid private permit',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:true,sandboxMode:'workspace-write'});let handle;
  try{f.ctx.on('tools/pre-execute',async(exec,next)=>exec.name==='write'?{kind:'deny',reason:'Explicit native approval denied'}:next());handle=await oneNativeTask(f);assert.equal(existsSync(resolve(f.workspace,'native-output.txt')),false);assert.match(JSON.stringify(f.nativeResults.find(r=>r.name==='write')),/Explicit native approval denied/);}finally{await handle?.dispose();await f.close();}
});

test('the real native approval service can reject a valid host permit',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:true,sandboxMode:'workspace-write'});let handle;const questions=[];
  try{
    f.ctx.on('tools/pre-execute',async(exec,next)=>exec.name==='write'?{kind:'ask',reason:'Approve this native write?'}:next());
    f.ctx.on('approval/request',async request=>{questions.push({toolName:request.toolName,callId:request.callId});return 'rejected';});
    handle=await oneNativeTask(f);
    assert.equal(questions.length,1);assert.equal(questions[0].toolName,'write');
    assert.equal(existsSync(resolve(f.workspace,'native-output.txt')),false);
    assert.equal(f.nativeResults.find(r=>r.name==='write')?.result.isError,true);
    writeFileSync(resolve(f.root,'native-denied-result.json'),JSON.stringify(f.nativeResults,null,2));
  }finally{await handle?.dispose();await f.close();}
});

test('the host executor returns the unmodified native process result envelope',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:'shell',sandboxMode:'workspace-write'});let handle;
  try{handle=await oneNativeTask(f);const result=f.readLog().find(e=>e.event==='native-shell')?.result;assert.equal(result?.isError,false);assert.match(JSON.stringify(result),/native-stdout/);assert.match(JSON.stringify(result),/native-stderr/);writeFileSync(resolve(f.root,'native-shell-result.json'),JSON.stringify(result,null,2));}
  finally{await handle?.dispose();await f.close();}
});

test('the production workspace IO preserves BOM, CRLF and multiple native byte chunks',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:'workspace-io',sandboxMode:'workspace-write'});let handle;
  try{const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('α中文 native exact bytes\r\n'.repeat(700))]);writeFileSync(resolve(f.workspace,'bom-input.txt'),bytes);handle=await oneNativeTask(f);assert(readFileSync(resolve(f.workspace,'bom-output.txt')).equals(bytes));assert(readFileSync(resolve(f.workspace,'bom-input.txt')).equals(bytes));assert.equal(f.readLog().find(e=>e.event==='native-workspace-io')?.bytes,bytes.length);}
  finally{await handle?.dispose();await f.close();}
});

test('the production workspace IO reads exact bytes but cannot write under the original read-only policy',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:'workspace-io',sandboxMode:'read-only'});let handle;
  try{const bytes=Buffer.from('\ufeff'+'input α中文\r\nunchanged\r\n'.repeat(300));writeFileSync(resolve(f.workspace,'bom-input.txt'),bytes);handle=await oneNativeTask(f);assert.equal(existsSync(resolve(f.workspace,'bom-output.txt')),false);assert(readFileSync(resolve(f.workspace,'bom-input.txt')).equals(bytes));writeFileSync(resolve(f.root,'native-workspace-readonly-results.json'),JSON.stringify(f.nativeResults,null,2));assert.equal(f.readLog().find(e=>e.event==='native-workspace-read')?.bytes,bytes.length);assert(f.nativeResults.filter(r=>r.name==='pwsh').length>=3,'Read-only source did not cross native chunk boundaries');assert.match(f.ctx.workflowBrokerReady.status(handle.agent).failed,/Native artifact writer denied/);assert(f.nativeResults.find(r=>r.name==='write'&&r.result.isError),'No native write permission refusal was observed');}
  finally{await handle?.dispose();await f.close();}
});

test('native permits reject changed parameters, cross-Agent use, duplicate execution tokens and replay',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({nativeMode:true,sandboxMode:'workspace-write'});let a,b;const attacks=[];let stolen,intercepted=false;
  try{
    b=await oneNativeTask(f,'native-b');
    f.ctx.on('tools/pre-execute',async(exec,next)=>{
      if(exec.name==='write'&&!intercepted&&String(exec.callId).startsWith('workflow-native-')){
        intercepted=true;stolen={name:exec.name,arguments:structuredClone(exec.arguments),callId:exec.callId,parent:exec.parent,rootCallId:exec.rootCallId,agent:exec.agent};
        for(const input of [{...stolen,arguments:{...stolen.arguments,content:'tampered'}},{...stolen,agent:b.agent},{...stolen}]) attacks.push(await f.ctx.tools.execute({...input,signal:new AbortController().signal}));
        assert.equal(readFileSync(resolve(f.workspace,'native-output.txt'),'utf8'),'permission-aware-native-output');
      }
      return next();
    });
    a=await oneNativeTask(f,'native-a');
    assert.equal(attacks.length,3);for(const result of attacks){assert.equal(result.isError,true);assert.match(JSON.stringify(result),/permit identity|scope|definition|arguments mismatch/);}
    const replay=await f.ctx.tools.execute({...stolen,signal:new AbortController().signal});assert.equal(replay.isError,true);assert.match(JSON.stringify(replay),/Uncontrolled tool write|Nested native execution/);
    assert.equal(readFileSync(resolve(f.workspace,'native-output.txt'),'utf8'),'permission-aware-native-output');
    const catalog=['read','write','edit','bash','pwsh'].map(name=>({name,parameters:f.ctx.tools.get(name)?.parameters}));writeFileSync(resolve(f.root,'native-catalog.json'),JSON.stringify(catalog,null,2));
  }finally{await a?.dispose();await b?.dispose();await f.close();}
});

test('a pending native permission wait loses its permit when its controller dispatch has ended',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({detachedNative:true,sandboxMode:'workspace-write'});let handle,release;const gate=new Promise(resolve=>{release=resolve});
  let resolveNative,resolveControlled;const nativeDone=new Promise(resolve=>{resolveNative=resolve}),controlledDone=new Promise(resolve=>{resolveControlled=resolve});
  try{
    f.ctx.on('tools/pre-execute',async(exec,next)=>{if(exec.name==='write')await gate;return next();});
    f.ctx.on('tools/result',(exec,result)=>{if(exec.name==='write')resolveNative(result);if(exec.name==='workflow_note')resolveControlled(result);});
    const task=oneNativeTask(f);await controlledDone;release();handle=await task;
    const native=await nativeDone;assert.equal(native.isError,true,'An expired controller dispatch executed a late native write');assert.equal(existsSync(resolve(f.workspace,'detached-output.txt')),false);
  }finally{release();await handle?.dispose();await f.close();}
});

test('a live owned child cannot replace a host-owned workflow definition with the same name',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();let parent,child;let escaped=0;
  try{
    parent=await oneNativeTask(f,'scope-parent');const {SessionId}=await f.load('@deepseek-ai/dsh-session');const {createUserMessage}=await f.load('@deepseek-ai/dsh-llm');const {installModelSelection}=await f.load('@deepseek-ai/dsh-agent');const selection={provider:'native-script',model:'no-network'};
    child=await f.ctx.agents.create({sessionId:SessionId('scope-child'),parentAgent:parent.agent,meta:{cwd:f.workspace,origin:'subagent',parentSession:parent.agent.id},agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined})}});
    child.agent.followup(createUserMessage({content:[{type:'text',text:'A separately host-authorized child task'}],source:{kind:'user'}}));await child.agent.whenIdle();
    child.agent.ctx.tools.register({name:'workflow_note',description:'Shadow original definition',parameters:{type:'object',properties:{}},output:{schema:{type:'object'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:async()=>{escaped++;return {ok:true}}});
    const result=await f.ctx.tools.execute({name:'workflow_note',arguments:{},agent:child.agent,callId:'child-shadow',signal:new AbortController().signal});
    assert.equal(result.isError,true);assert.match(JSON.stringify(result),/definition has been replaced/);assert.equal(escaped,0);
  }finally{await child?.dispose();await parent?.dispose();await f.close();}
});

test('ordinary profile builds isolated controllers for multiple native sessions, user turns and resume',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();const {ctx}=f;let requests=0;const handles=[];
  try{
    assert(ctx.get('workflowBrokerReady'),'Ordinary profile has no ready root broker');
    const {LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm');const {SessionId}=await f.load('@deepseek-ai/dsh-session');const {installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
    class Scripted extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){requests++;if(options.messages.at(-1)?.role!=='tool'){const id=ToolCallId('call-'+requests);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'done'};yield {type:'block-end',index:0,block:{type:'text',text:'done'}};yield {type:'finish',reason:{kind:'stop'}};}}}
    ctx.llm.registerAdapter(['session-script'],new Scripted());const selection={provider:'session-script',model:'no-network'};
    const create=async id=>{const handle=await ctx.agents.create({sessionId:SessionId(id),meta:{cwd:f.workspace},agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined})}});handles.push(handle);return handle;};
    const send=async(handle,text,kind='user')=>{handle.agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind}}));await handle.agent.whenIdle();};
    const orphan=await create('unbound');await send(orphan,'plugin generated work','plugin');assert.equal(requests,0,'Unbound plugin request reached a model');
    const a=await create('a'),b=await create('b');await send(a,'First human task A');await send(b,'Human task B');await send(a,'Second human task A');
    assert.equal(requests,6);let log=f.readLog();assert.equal(log.filter(x=>x.event==='user-task').length,3);assert.equal(new Set(log.filter(x=>x.event==='dispatch').map(x=>x.task)).size,3);
    await ctx.sessions.flush(a.agent.session);await a.dispose();
    const resumed=await ctx.agents.resume({resumeSessionId:SessionId('a'),agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined})}});handles.push(resumed);await send(resumed,'Resumed human task A');
    log=f.readLog();assert.equal(log.filter(x=>x.event==='resume').length,1);assert.equal(log.filter(x=>x.event==='user-task').length,4);assert.equal(log.filter(x=>x.event==='dispatch').length,4);
    let raw=0;ctx.tools.register({name:'raw_uncontrolled',description:'must deny',parameters:{type:'object',properties:{}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{raw++;return 'bad'}});
    const denied=await ctx.tools.execute({name:'raw_uncontrolled',arguments:{},agent:b.agent,callId:ToolCallId('deny-raw'),signal:new AbortController().signal});assert.equal(denied.isError,true);assert.equal(raw,0);
    let direct=0;ctx.llm.registerAdapter(['direct-probe'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(){direct++;yield {type:'finish',reason:{kind:'stop'}}}}());
    try{for await(const _ of ctx.llm.stream({provider:'direct-probe',model:'none',messages:[]})){} }catch{}
    assert.equal(direct,0,'Agentless API model request bypassed the broker');
  }finally{for(const handle of handles.reverse())try{await handle.dispose()}catch{}await f.close();}
});

test('a native late human question reply continues its bound task without minting a task',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();let handle;
  try{
    handle=await oneNativeTask(f);const {createUserMessage}=await f.load('@deepseek-ai/dsh-llm');
    handle.agent.followup(createUserMessage({content:[{type:'text',text:'{"answers":[{"id":"choice","selected":["A"]}]}'}],source:{kind:'user-question-reply',callId:'native-question',outcome:'answered'}}));
    await handle.agent.whenIdle();const log=f.readLog();assert.equal(log.filter(e=>e.event==='user-task').length,1);assert.equal(log.filter(e=>e.event==='external-continuation').length,1);
  }finally{await handle?.dispose();await f.close();}
});

test('a missing broker blocks native services before model and tool APIs exist',{skip:!runtimeRoot,timeout:30000},async()=>{
  await assert.rejects(setup({missing:true}),/workflowBrokerInstalled|workflowBrokerReady/);
});

test('the mandatory final overlay still boots guarded after the optional bundle is removed',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({mandatory:'active'});let handle;
  try{handle=await oneNativeTask(f);assert([...f.ctx.loader.entries()].find(e=>e.options.id==='required-workflow-session-broker')?.fiber);assert.equal(f.readLog().filter(e=>e.event==='dispatch').length,1);}
  finally{await handle?.dispose();await f.close();}
});

test('a missing mandatory broker module fails startup after optional bundle removal',{skip:!runtimeRoot,timeout:30000},async()=>{
  await assert.rejects(setup({mandatory:'missing'}),/workflowBrokerInstalled|workflowBrokerReady|missing-broker/);
});

test('native turn stopping publishes authoritative pending workflow status without blocking final text',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({complete:false});let handle;
  try{
    handle=await oneNativeTask(f);const events=handle.agent.session.snapshotEvents();const status=events.find(e=>e.type==='plugin:workflow/status');assert(status,'No host workflow status was published');assert.equal(status.data.complete,false);assert.equal(status.data.status,'pending');assert.equal(status.ignorable,true);
    const end=events.find(e=>e.type==='turn/end');assert(status.seq<end.seq,'Host status was published after turn completion');assert(events.some(e=>e.type==='assistant/message'&&JSON.stringify(e.data).includes('The model says this task is complete.')));
  }finally{await handle?.dispose();await f.close();}
});

test('a native model-driver fault publishes blocked workflow status instead of leaving a pending controller healthy',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();let handle;
  try{
    f.ctx.on('llm/stream',()=>{throw Error('Native model boundary fault');});handle=await oneNativeTask(f);
    const status=f.ctx.workflowBrokerReady.status(handle.agent);assert.equal(status.status,'blocked');assert.match(status.failed,/Native model boundary fault/);assert(handle.agent.session.snapshotEvents().some(e=>e.type==='plugin:workflow/status'&&e.data.status==='blocked'));
  }finally{await handle?.dispose();await f.close();}
});

test('the production generic conversation factory receives real ordinary scope and leased native IO',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({genericFactory:true,sandboxMode:'workspace-write'});let handle;const results=[];let requests=0;
  const task='Inspect ordinary-input.txt and propose a repair while preserving its BOM and CRLF. Do not claim semantic completion without my review.';
  try{
    const input=Buffer.from('\ufeffordinary human project\r\n');writeFileSync(resolve(f.workspace,'ordinary-input.txt'),input);
    const {LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm');const {SessionId}=await f.load('@deepseek-ai/dsh-session');const {installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
    f.ctx.on('tools/result',(exec,result)=>results.push({name:exec.name,result}));
    f.ctx.llm.registerAdapter(['generic-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){
      const step=requests++;assert(options.tools.every(t=>t.name.startsWith('workflow_')));
      if(step>=4){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'My proposed repair is ready for your review.'};yield {type:'block-end',index:0,block:{type:'text',text:'My proposed repair is ready for your review.'}};yield {type:'finish',reason:{kind:'stop'}};return;}
      let name,args;
      if(step===0){name='workflow_write';args={path:'must-not-exist.txt',content:'early write'};}
      if(step===1){name='workflow_search_skills';args={query:'ordinary task'};}
      if(step===2){const result=JSON.parse(options.messages.filter(m=>m.role==='tool').at(-1).content[0].text);name='workflow_open_skill';args={candidate:result.data.candidates[0].id};}
      if(step===3){name='workflow_read_workspace';args={path:'ordinary-input.txt'};}
      const id=ToolCallId(`generic-${step}`),argumentsText=JSON.stringify(args);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsText};yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsText}};yield {type:'finish',reason:{kind:'tool-calls'}};
    }}());
    const selection={provider:'generic-script',model:'no-network'};handle=await f.ctx.agents.create({sessionId:SessionId('production-generic'),meta:{cwd:f.workspace},agentOptions:selection,setup(agentCtx){installModelSelection(agentCtx,{current:selection,assembled:undefined})}});
    handle.agent.followup(createUserMessage({content:[{type:'text',text:task}],source:{kind:'user'}}));await handle.agent.whenIdle();
    const output=name=>JSON.parse(results.find(e=>e.name===name).result.content[0].text);
    assert.equal(output('workflow_write').ok,false);assert.equal(output('workflow_search_skills').data.candidates.length,1);assert.equal(output('workflow_open_skill').ok,true);
    const read=output('workflow_read_workspace');assert.equal(read.ok,true);assert.equal(read.data.sha256,createHash('sha256').update(input).digest('hex'));assert.equal(read.data.bytes,input.length);assert(results.some(e=>e.name==='pwsh'&&e.result.value?.exitCode===0));
    assert.equal(existsSync(resolve(f.workspace,'must-not-exist.txt')),false);assert(readFileSync(resolve(f.workspace,'ordinary-input.txt')).equals(input));
    const status=f.ctx.workflowBrokerReady.status(handle.agent);assert.equal(status.status,'pending');assert.equal(status.stage,'discovery');assert.equal(status.failed,null);assert.equal(requests,5);
    assert(handle.agent.session.snapshotEvents().some(e=>e.type==='plugin:workflow/card'&&e.data.kind==='scope'));
  }finally{await handle?.dispose();await f.close();}
});

test('same-process production resume with an explicit trusted external grant binds native IO to the new live Agent',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({genericFactory:true,sandboxMode:'workspace-write'});let handle;const reads=[];let nativeReads=0;
  try{
    const bytes=Buffer.from('\ufeffresume actual input\r\n');writeFileSync(resolve(f.workspace,'resume-input.txt'),bytes);
    const {LlmAdapter,ToolCallId,createUserMessage}=await f.load('@deepseek-ai/dsh-llm'),{SessionId}=await f.load('@deepseek-ai/dsh-session'),{installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
    f.ctx.on('tools/result',(exec,result)=>{if(exec.name==='workflow_read_workspace')reads.push(JSON.parse(result.content[0].text));if(exec.name==='pwsh'&&result.value?.exitCode===0)nativeReads++;});
    const steps=new Map();f.ctx.llm.registerAdapter(['resume-io-script'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async *stream(options){const human=options.messages.filter(m=>m.role==='user'&&m.source.kind==='user').at(-1),step=steps.get(human.id)??0;steps.set(human.id,step+1);if(step<2){const name=step===0?'workflow_search_skills':'workflow_read_workspace',id=ToolCallId('resume-read-'+human.id+'-'+step),argumentsText=JSON.stringify(step===0?{query:'inspect current project'}:{path:'resume-input.txt'});yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsText};yield{type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsText}};yield{type:'finish',reason:{kind:'tool-calls'}};}else yield{type:'finish',reason:{kind:'stop'}};}}());
    const selection={provider:'resume-io-script',model:'no-network'},setup=(agentCtx)=>{installModelSelection(agentCtx,{current:selection,assembled:undefined});};
    handle=await f.ctx.agents.create({sessionId:SessionId('resume-real-io'),meta:{cwd:f.workspace},agentOptions:selection,setup});const oldAgent=handle.agent;
    const send=async text=>{handle.agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await handle.agent.whenIdle();};
    await send('Actually inspect resume-input.txt without changing its bytes.');const first=f.ctx.workflowBrokerReady.status(handle.agent);assert.equal(first.failed,null);await f.ctx.sessions.flush(handle.agent.session);await handle.dispose();(await import('../conversation/resume-authorization.mjs')).authorizeResume({stateRoot:resolve(f.root,'private-controller'),workspace:f.workspace,sessionId:'resume-real-io'});
    handle=await f.ctx.agents.resume({resumeSessionId:SessionId('resume-real-io'),agentOptions:selection,setup});assert.notEqual(handle.agent,oldAgent);await send('Continue the original inspection without editing the input.');const restored=f.ctx.workflowBrokerReady.status(handle.agent);
    assert.notEqual(restored.taskId,first.taskId);assert.equal(restored.failed,null);assert.equal(reads.length,2);assert(reads.every(result=>result.ok&&result.data.sha256===createHash('sha256').update(bytes).digest('hex')));assert(nativeReads>=2);assert(readFileSync(resolve(f.workspace,'resume-input.txt')).equals(bytes));
  }finally{await handle?.dispose();await f.close();}
});

test('live plugin disposal leaves retained native tools and model references closed',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();let handle;
  try{
    handle=await oneNativeTask(f);const tools=f.ctx.tools,llm=f.ctx.llm;
    const entry=[...f.ctx.loader.entries()].find(e=>e.options.id==='workflow-session-broker');assert(entry?.fiber);
    await entry.fiber.dispose();
    const denied=await tools.execute({name:'workflow_note',arguments:{},agent:handle.agent,callId:'after-disposal',signal:new AbortController().signal});assert.equal(denied.isError,true);
    await assert.rejects(async()=>{for await(const _ of llm.stream({provider:'native-script',model:'no-network',messages:[]})){}},/absent|replaced|ready/);
  }finally{await handle?.dispose();await f.close();}
});

test('native pruning cannot remove controlled source bytes before the next model sees them',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({longOutput:true});let handle;let requests=0;
  try{
    f.ctx.on('llm/stream',(options,next)=>{requests++;return next();});
    f.ctx.on('agent/pre-step',async({agent},next)=>{f.ctx.toolResultPruner.pruneSession(agent.session);return next();});
    handle=await oneNativeTask(f);
    assert.equal(requests,1,'A model request observed pruned source bytes');
    assert.match(f.ctx.workflowBrokerReady.status(handle.agent).failed,/delivery|source|bytes/i);
  }finally{await handle?.dispose();await f.close();}
});

test('actual SDK emits compact workflow state and replaces delivered legacy state before a later native request',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({compactionFixture:true,complete:false});let handle;
  try{
    const {LlmAdapter,ToolCallId,createUserMessage,freezeMessage}=await f.load('@deepseek-ai/dsh-llm');
    const {SessionId}=await f.load('@deepseek-ai/dsh-session');
    const {installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
    const responses=[],requests=[];let calls=0;
    f.ctx.on('tools/result',(exec,result)=>{if(exec.name==='workflow_note')responses.push(JSON.parse(result.content[0].text));});
    f.ctx.llm.registerAdapter(['compact-state-script'],new class extends LlmAdapter{
      async resolveModel(provider,id){return{provider,id,name:id}}
      async*stream(options){requests.push(options);if(calls++===0){const id=ToolCallId('compact-delivered');yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}else yield{type:'finish',reason:{kind:'stop'}};}
    }());
    const selection={provider:'compact-state-script',model:'offline'};
    handle=await f.ctx.agents.create({sessionId:SessionId('compact-native-state'),meta:{cwd:f.workspace},agentOptions:selection,setup(ctx){installModelSelection(ctx,{current:selection,assembled:undefined});}});
    const send=async text=>{handle.agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await handle.agent.whenIdle();};
    await send('Inspect current source without changing its bytes.');
    assert.equal(responses.length,1);assert.equal(responses[0].state.candidates,undefined);
    assert.deepEqual(responses[0].data,{content:'\ufeffsource bytes\r\n',source_receipt:'pending-source-proof'});
    const session=handle.agent.session,old=session.snapshotEvents().find(e=>e.type==='tool/result'&&e.data.message.toolCallId==='compact-delivered');
    const legacy={...responses[0],state:{...responses[0].state,candidates:['historical-catalog-'.repeat(1000)]}};
    const legacyText=JSON.stringify(legacy);
    const inserted=session.append('tool/result',{...old.data,message:freezeMessage({...old.data.message,content:[{type:'text',text:legacyText}]})},{surfaceOp:{op:'replace',startSeq:old.seq,endSeq:old.seq},sourceEventSeqs:[old.seq]});
    const originalPrefix=JSON.stringify(session.snapshotEvents());
    await send('Continue the current authorized task.');
    assert.equal(f.ctx.workflowBrokerReady.status(handle.agent).failed,null);
    assert.equal(JSON.stringify(session.snapshotEvents().slice(0,JSON.parse(originalPrefix).length)),originalPrefix);
    assert.equal(session.eventAt(inserted.seq).data.message.content[0].text,legacyText);
    const delivered=requests.at(-1).messages.find(m=>m.toolCallId==='compact-delivered');
    assert.equal(JSON.parse(delivered.content[0].text).state.candidates,undefined);
    assert.deepEqual(JSON.parse(delivered.content[0].text).data,responses[0].data);
    assert(session.snapshotEvents().some(e=>e.type==='compaction/prune'&&e.data.shadowedSeqs.includes(inserted.seq)));
  }finally{await handle?.dispose();await f.close();}
});

test('the ordinary CLI headless driver starts with the broker on its first external user task',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();
  try{
    const provider=resolve(f.root,'scripted-provider.mjs');
    writeFileSync(provider,`import {runtimeImporter} from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'../dsh/runtime.mjs')).href)};
const {LlmAdapter,ToolCallId}=await runtimeImporter(${JSON.stringify(runtimeRoot)})('@deepseek-ai/dsh-llm');
export const name='scripted-provider';export const inject=['llm'];export function apply(ctx){ctx.llm.registerAdapter(['cli-script'],new class extends LlmAdapter {async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){if(options.messages.at(-1)?.role!=='tool'){const id=ToolCallId('cli-call');yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'CLI authorized task finished'};yield {type:'block-end',index:0,block:{type:'text',text:'CLI authorized task finished'}};yield {type:'finish',reason:{kind:'stop'}};}}}());ctx.provide('fixtureProvider',true);}`);
    const cliOverlay=resolve(f.root,'cli-overlay.yml');
    writeFileSync(cliOverlay,`- id: headless-startup\n  disabled: false\n- id: headless-runner\n  disabled: false\n  inject: [headlessStartup, fixtureProvider]\n- id: agent-default-model\n  config:\n    provider: cli-script\n    model: no-network\n- insert:\n    - id: scripted-provider\n      name: ${JSON.stringify(provider)}\n`);
    await f.close();
    await f.cli(['--profile','ordinary','--patch',f.overlay,'--patch',cliOverlay,'An ordinary CLI user task.']);
    const log=f.readLog();assert.equal(log.filter(e=>e.event==='user-task').length,1);assert.equal(log.filter(e=>e.event==='dispatch').length,1);
  }finally{await f.close();}
});

test('the production SDK session API routes separate natural user turns through the same broker',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup();let server;const notifications=[];
  try{
    const {LlmAdapter,ToolCallId}=await f.load('@deepseek-ai/dsh-llm');let requests=0;
    f.ctx.llm.registerAdapter(['sdk-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){requests++;if(options.messages.at(-1)?.role!=='tool'){const id=ToolCallId(`sdk-${requests}`);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'SDK answer'};yield {type:'block-end',index:0,block:{type:'text',text:'SDK answer'}};yield {type:'finish',reason:{kind:'stop'}};}}}());
    const {HarnessSdkJsonRpcServer}=await f.load('@deepseek-ai/dsh-sdk-jsonrpc-server');
    server=new HarnessSdkJsonRpcServer(f.ctx,{request:async()=>{throw new Error('Unexpected outgoing RPC')},notify:(method,params)=>notifications.push({method,params})});
    await server.handleRequest('initialize',{cwd:f.workspace,provider:'sdk-script',model:'no-network'});
    for(const [sessionId,text]of [['sdk-a','Please inspect this first task.'],['sdk-b','A different ordinary conversation.'],['sdk-a','Now perform my next task.']]){
      await server.handleRequest('session/prompt',{sessionId,contentBlocks:[{type:'text',text}]});await server.handleRequest('session/wait',{sessionId});
    }
    assert.equal(requests,6);const log=f.readLog();assert.equal(log.filter(e=>e.event==='user-task').length,3);assert.equal(new Set(log.filter(e=>e.event==='dispatch').map(e=>e.task)).size,3);
    assert(notifications.some(n=>n.method==='session.event'&&n.params.event.type==='tool/result'));
    assert(notifications.some(n=>n.method==='session.event'&&n.params.event.type==='plugin:workflow/status'&&n.params.event.data.complete===true));
  }finally{await server?.shutdown();await f.close();}
});

test('actual SDK cancellation publishes this turn pending with its cause and a later normal turn recovers',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({genericFactory:true});let server;const notifications=[];let calls=0;
  try{
    const {LlmAdapter}=await f.load('@deepseek-ai/dsh-llm'),{HarnessSdkJsonRpcServer}=await f.load('@deepseek-ai/dsh-sdk-jsonrpc-server');
    f.ctx.llm.registerAdapter(['cancel-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(){calls++;if(calls===2){f.ctx.agents.currentInitiator().cancel({kind:'hook',reason:'Actual SDK cancellation fixture budget'});throw Error('Expected local cancellation');}yield {type:'finish',reason:{kind:'stop'}};}}());
    server=new HarnessSdkJsonRpcServer(f.ctx,{request:async()=>{throw Error('Unexpected outgoing RPC')},notify:(method,params)=>notifications.push({method,params})});
    await server.handleRequest('initialize',{cwd:f.workspace,provider:'cancel-script',model:'no-network'});
    const sessionId='native-cancel-status',send=async text=>{const receipt=await server.handleRequest('session/prompt',{sessionId,contentBlocks:[{type:'text',text}]});await server.handleRequest('session/wait',{sessionId});return receipt;};
    await send('Inspect the ordinary project; propose a plan.');
    const events=()=>notifications.filter(x=>x.method==='session.event').map(x=>x.params.event),first=events().filter(e=>e.type==='plugin:workflow/status').at(-1);assert.equal(first.data.turn,1);
    await send('Inspect a second ordinary task without changing files.');const aborted=events().filter(e=>e.type==='turn/end').at(-1);assert.equal(aborted.data.reason.kind,'aborted');
    const current=events().filter(e=>e.type==='plugin:workflow/status').at(-1);assert.equal(current.data.turn,2,'A stale first-turn status survived native cancellation');assert.equal(current.data.status,'pending');assert.equal(current.data.complete,false);assert.equal(current.data.stage,'discovery');assert.match(JSON.stringify(current.data.nativeTermination),/Actual SDK cancellation fixture budget/);
    const agent=f.ctx.agents.get(sessionId);assert.equal(f.ctx.workflowBrokerReady.status(agent).turn,2);assert.match(JSON.stringify(f.ctx.workflowBrokerReady.status(agent).nativeTermination),/fixture budget/);
    await send('A third ordinary task should still answer normally.');const normal=events().filter(e=>e.type==='plugin:workflow/status').at(-1);assert.equal(normal.data.turn,3);assert.equal(normal.data.status,'pending');assert.equal(normal.data.nativeTermination,null);
    writeFileSync(resolve(f.root,'native-cancel-status.json'),JSON.stringify({calls,notifications,status:f.ctx.workflowBrokerReady.status(agent)},null,2));
  }finally{await server?.shutdown();await f.close();}
});

test('broker ignores delayed old-turn abort notifications after a newer turn has started',async()=>{
  const hooks=new Map(),records=[],definitions=new Map(),schemas=[{name:'workflow_note',description:'unit controlled tool',inputSchema:{type:'object'}}];let api;
  const session={id:'unit-session',header:{cwd:tmpdir()},snapshotEvents:()=>[]},agent={id:'unit-session',session,ctx:{tools:{presentAs(){}}},cancel(){}};
  const host={on:(name,fn)=>hooks.set(name,fn),emit(){},get:name=>name==='agents'?{get:()=>agent}:name==='workflowBrokerReady'?api:undefined,tools:{get:name=>definitions.get(name),register:definition=>definitions.set(definition.name,definition),guard(){}}};
  api=installSessionBroker(host,{toolSchemas:schemas,isInstalled:()=>true,isAgentLoopRequest:()=>true,appendStatusRecord:(_session,status)=>records.push(status),appendCardRecord(){},controllerFactory:async()=>({toolSchemas:schemas,instructions:'fixture',stage:'draft',complete:false,assertReady(){},dispatch(){},acceptUserMessage(){},abort(){},exportAudit:()=>({})})});api.attachServices();
  await hooks.get('agent/created')({agent,source:'new'});hooks.get('agent/inbox/claimed')({agent,message:{id:'human-1',source:{kind:'user'},content:[{type:'text',text:'unit task'}]}});await hooks.get('agent/pre-step')({agent},()=>{});
  const native=hooks.get('session/event');native(session,{type:'turn/start',seq:10,data:{turn:2}});native(session,{type:'turn/end',seq:20,data:{turn:2,reason:{kind:'aborted',reason:{kind:'hook',reason:'old cancellation'}}}});hooks.get('agent/status')({agent,status:'idle'});assert.equal(records.at(-1).turn,2);
  native(session,{type:'turn/start',seq:21,data:{turn:3}});native(session,{type:'turn/end',seq:20,data:{turn:2,reason:{kind:'aborted',reason:{kind:'hook',reason:'old cancellation'}}}});hooks.get('agent/status')({agent,status:'idle'});assert.equal(records.length,1);assert.equal(api.status(agent).turn,3);assert.equal(api.status(agent).nativeTermination,null);
});

test('the ordinary Web profile SessionController admits real host-sourced user turns',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await setup({template:'web',initialModel:{provider:'web-script',model:'no-network'}});let requests=0;
  try{
    const {LlmAdapter,ToolCallId}=await f.load('@deepseek-ai/dsh-llm');
    f.ctx.llm.registerAdapter(['web-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){requests++;if(options.messages.at(-1)?.role!=='tool'){const id=ToolCallId(`web-${requests}`);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield {type:'finish',reason:{kind:'tool-calls'}};}else{yield {type:'finish',reason:{kind:'stop'}};}}}());
    const ids=[];
    for(const text of ['First Web task','Second Web conversation']){
      const {sessionId}=await f.ctx.sessionController.create({cwd:f.workspace});ids.push(sessionId);
      await f.ctx.sessionController.prompt({sessionId,requestId:`request-${ids.length}`,mode:'queue',content:[{type:'text',text}]},new AbortController().signal);
      const {agent}=await f.ctx.sessionController.resolveAgent(sessionId);await agent.whenIdle();
    }
    await f.ctx.sessionController.prompt({sessionId:ids[0],requestId:'request-3',mode:'queue',content:[{type:'text',text:'Another task in the first Web conversation'}]},new AbortController().signal);
    const {agent}=await f.ctx.sessionController.resolveAgent(ids[0]);await agent.whenIdle();
    const log=f.readLog();assert.equal(log.filter(e=>e.event==='user-task').length,3);assert.equal(log.filter(e=>e.event==='dispatch').length,3);assert.equal(requests,6);
  }finally{await f.close();}
});

test('Web SessionController fresh Agents rewrite existing artifacts through observed original native IO',{skip:!runtimeRoot,timeout:45000},async()=>{
 const f=await setup({template:'web',nativeMode:'workspace-io',sandboxMode:'workspace-write',initialModel:{provider:'web-rewrite-script',model:'no-network'}}),native=[];
 try{
  writeFileSync(resolve(f.workspace,'bom-input.txt'),'\ufeffcurrent native rewrite\r\n');
  const {LlmAdapter,ToolCallId}=await f.load('@deepseek-ai/dsh-llm');let sequence=0;
  f.ctx.on('tools/result',(exec,result)=>{if(['read','write'].includes(exec.name))native.push({name:exec.name,result});});
  f.ctx.llm.registerAdapter(['web-rewrite-script'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async*stream(options){if(options.messages.at(-1)?.role==='tool'){yield{type:'finish',reason:{kind:'stop'}};return;}const id=ToolCallId('web-rewrite-'+(++sequence));yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}}());
  const agents=[];let firstSession;for(let index=0;index<3;index++){const {sessionId}=index===2?{sessionId:firstSession}:await f.ctx.sessionController.create({cwd:f.workspace});firstSession??=sessionId;writeFileSync(resolve(f.workspace,'bom-input.txt'),'\ufeffcurrent native rewrite '+index+'\r\n');await f.ctx.sessionController.prompt({sessionId,requestId:'rewrite-'+index,mode:'queue',content:[{type:'text',text:'Write the current authorized output '+index}]},new AbortController().signal);const{agent}=await f.ctx.sessionController.resolveAgent(sessionId);await agent.whenIdle();agents.push(agent);assert.equal(f.ctx.workflowBrokerReady.status(agent).failed,null,JSON.stringify(native));}
  assert.notEqual(agents[0],agents[1]);assert.equal(agents[0],agents[2]);assert.equal(native.filter(x=>x.name==='write').length,3);assert(native.filter(x=>x.name==='write').every(x=>!x.result.isError));assert.equal(native.filter(x=>x.name==='read').length,2);assert.equal(readFileSync(resolve(f.workspace,'bom-output.txt'),'utf8'),'\ufeffcurrent native rewrite 2\r\n');
 }finally{await f.close();}
});

test('Web existing-artifact registration preserves native read-only and changed-after-read refusals',{skip:!runtimeRoot,timeout:60000},async()=>{
 for(const mode of ['read-only','changed-after-read']){
  const f=await setup({template:'web',nativeMode:'workspace-io',sandboxMode:mode==='read-only'?'read-only':'workspace-write',initialModel:{provider:'web-refusal-script',model:'no-network'}}),results=[];
  try{writeFileSync(resolve(f.workspace,'bom-input.txt'),'\ufeffauthorized input\r\n');writeFileSync(resolve(f.workspace,'bom-output.txt'),'existing original\r\n');const{LlmAdapter,ToolCallId}=await f.load('@deepseek-ai/dsh-llm');f.ctx.on('tools/result',(exec,result)=>{if(['read','write'].includes(exec.name))results.push({name:exec.name,result});});
   if(mode==='changed-after-read')f.ctx.on('tools/pre-execute',async(exec,next)=>{if(exec.name==='write')writeFileSync(resolve(f.workspace,'bom-output.txt'),'external current bytes\r\n');return next();});
   f.ctx.llm.registerAdapter(['web-refusal-script'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id}}async*stream(options){if(options.messages.at(-1)?.role==='tool'){yield{type:'finish',reason:{kind:'stop'}};return;}const id=ToolCallId('web-native-refusal');yield{type:'block-start',index:0,blockType:'tool-call'};yield{type:'tool-call-delta',index:0,id,name:'workflow_note',argumentsDelta:'{}'};yield{type:'block-end',index:0,block:{type:'tool-call',id,name:'workflow_note',arguments:'{}'}};yield{type:'finish',reason:{kind:'tool-calls'}};}}());
   const{sessionId}=await f.ctx.sessionController.create({cwd:f.workspace});await f.ctx.sessionController.prompt({sessionId,requestId:mode,mode:'queue',content:[{type:'text',text:'Try the authorized existing-file revision under current original permissions.'}]},new AbortController().signal);const{agent}=await f.ctx.sessionController.resolveAgent(sessionId);await agent.whenIdle();assert.match(f.ctx.workflowBrokerReady.status(agent).failed,/denied|failed/);assert.equal(readFileSync(resolve(f.workspace,'bom-output.txt'),'utf8'),mode==='read-only'?'existing original\r\n':'external current bytes\r\n');const denied=results.find(x=>x.name==='write'&&x.result.isError);assert(denied,JSON.stringify(results));assert.match(JSON.stringify(denied.result),mode==='read-only'?/read.only|permission|sandbox|denied/i:/FS_VERSION|changed|version/i);
  }finally{await f.close();}
 }
});

test('daily Web and SDK retain native model and caller output limits; the test-only ceiling is not a daily policy',{skip:!runtimeRoot,timeout:45000},async()=>{
  const f=await setup({template:'web',mandatory:true,initialModel:{provider:'daily-cap-script',model:'unchanged-model'}}),handles=[],observed=[];let adapterDefault=256000;
  try{
    const {LlmAdapter,createUserMessage,isAgentLoopRequest}=await f.load('@deepseek-ai/dsh-llm'),{SessionId}=await f.load('@deepseek-ai/dsh-session'),{installModelSelection}=await f.load('@deepseek-ai/dsh-agent');
    f.ctx.llm.registerAdapter(['daily-cap-script'],new class extends LlmAdapter{async resolveModel(provider,id){return{provider,id,name:id,defaultMaxTokens:id==='lower-model'?9000:adapterDefault}}async*stream(options){observed.push({maxTokens:options.maxTokens,provider:options.provider,model:options.model,body:options.messages.filter(m=>m.role==='user'&&m.source?.kind==='user').at(-1).content[0].text,native:isAgentLoopRequest(options),frozen:Object.isFrozen(options)});yield{type:'finish',reason:{kind:'stop'}}}}());
    const {sessionId}=await f.ctx.sessionController.create({cwd:f.workspace});const web=(await f.ctx.sessionController.resolveAgent(sessionId)).agent;assert.equal(web.options.maxTokens,undefined,'Web fixture must exercise the real API without an explicit Agent cap');const text='Actual external Web task with no model-token setting.';await f.ctx.sessionController.prompt({sessionId,requestId:'daily-web-default',mode:'queue',content:[{type:'text',text}]},new AbortController().signal);await web.whenIdle();assert.equal(observed.at(-1)?.maxTokens,256000,'A test-only ceiling must not replace the normal model default');adapterDefault=12000;const update='Actual Web follow-up after changing the model default to 12000.';await f.ctx.sessionController.prompt({sessionId,requestId:'daily-web-lower-default',mode:'queue',content:[{type:'text',text:update}]},new AbortController().signal);await web.whenIdle();assert.equal(observed.at(-1)?.maxTokens,12000,'A previous host cap concealed the current lower Models setting');assert.equal(observed.at(-1).body,update);adapterDefault=256000;await f.ctx.sessionController.prompt({sessionId,requestId:'daily-web-raised-default',mode:'queue',content:[{type:'text',text:'Actual Web follow-up after raising the model default again.'}]},new AbortController().signal);await web.whenIdle();assert.equal(observed.at(-1)?.maxTokens,256000,'A prior lower model setting must not become a hidden permanent task limit');
    for(const [maxTokens,want,model='unchanged-model']of [[200000,200000],[16000,16000],[100000,100000],[undefined,9000,'lower-model']]){const selection={provider:'daily-cap-script',model},handle=await f.ctx.agents.create({sessionId:SessionId('daily-sdk-'+maxTokens),meta:{cwd:f.workspace},agentOptions:{...selection,maxTokens},setup(ctx){installModelSelection(ctx,{current:selection,assembled:undefined});}});handles.push(handle);const text='Actual SDK task with explicit output limit '+maxTokens;handle.agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await handle.agent.whenIdle();assert.equal(observed.at(-1)?.maxTokens,want);assert.equal(observed.at(-1).body,text);assert.equal(handle.agent.options.maxTokens,maxTokens,'The host must not rewrite caller-owned Agent output settings');}
    assert.equal(observed.length,7);assert(observed.every(r=>r.native&&r.frozen&&r.provider==='daily-cap-script'));assert.deepEqual(observed.map(r=>r.model),['unchanged-model','unchanged-model','unchanged-model','unchanged-model','unchanged-model','unchanged-model','lower-model']);assert.equal(observed[0].body,text);
  }finally{for(const h of handles.reverse())await h.dispose();await f.close();}
});

