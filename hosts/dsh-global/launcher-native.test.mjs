import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname,delimiter} from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {resolveDshRuntime} from './runtime.mjs';
import {prepareGuardedLaunch,spawnGuardedDsh} from './launcher.mjs';

const runtimeRoot=process.env.DSH_RUNTIME_ROOT;
const verifyInstallation=async()=>({ok:true,testOnly:true,attestation:'boundary-test-existing-runtime-not-installation-attestation'});
async function fixture(template){
  const parent=join(tmpdir(),'dsh-global-native-boundary');mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'launcher-'));mkdirSync(resolve(import.meta.dirname,'.runtime-tests'),{recursive:true});writeFileSync(resolve(import.meta.dirname,'.runtime-tests',`location-${root.split(/[\\/]/).at(-1)}.json`),JSON.stringify({root}));
  const workspace=join(root,'workspace'),home=join(root,'home'),privateRoot=join(root,'private'),installed=join(root,'skills'),expert=join(installed,'ordinary-task-method');
  mkdirSync(workspace);mkdirSync(privateRoot);mkdirSync(expert,{recursive:true});
  writeFileSync(join(workspace,'ordinary-input.txt'),'\ufeffordinary project input\r\n');writeFileSync(join(expert,'SKILL.md'),'---\nname: ordinary-task-method\ndescription: inspect ordinary task inputs and preserve original bytes\n---\nInspect current input; propose a bounded repair; verify the actual artifact.\n');writeFileSync(join(expert,'LICENSE'),'MIT test method fixture license.');
  const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','PATH'])if(process.env[key]!==undefined)env[key]=process.env[key];env.PATH=[dirname(process.execPath),process.env.PATH??''].join(delimiter);env.DSH_HOME=home;env.DSH_TELEMETRY_DISABLED='1';
  const runtime=resolveDshRuntime(runtimeRoot),profile='daily-'+template;
  await new Promise((fulfill,reject)=>{const child=spawn(process.execPath,[runtime.bin,'--profile',profile,'--from-default-profile',template,'--dump-config'],{cwd:workspace,env,windowsHide:true});let stderr='';child.stderr.on('data',bytes=>stderr+=bytes);child.stdout.resume();child.once('error',reject);child.once('close',code=>code===0?fulfill():reject(Error(stderr)));});
  const profileFile=join(home,'profiles',profile,'cordis.patch.yml'),manifest=join(home,'profiles',profile,'package.json');
  writeFileSync(profileFile,`# Existing user preferences must survive\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: ${JSON.stringify(workspace)}\n`);
  writeFileSync(join(home,'cordis.patch.yml'),'# Existing machine preferences must survive\n- id: session-title-llm\n  disabled: true\n');
  const journal=join(privateRoot,'provider.jsonl'),provider=join(privateRoot,'scripted-provider.mjs');
  writeFileSync(provider,`import {appendFileSync} from 'node:fs';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';const require=createRequire(${JSON.stringify(resolve(runtimeRoot,'package.json'))});const {LlmAdapter,ToolCallId}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href);export const name='launcher-script-provider';export const inject=['llm','agents','tools'];export function apply(ctx){const steps=new Map();ctx.llm.registerAdapter(['launcher-script'],new class extends LlmAdapter{async resolveModel(provider,id){return {provider,id,name:id}}async *stream(options){const agent=ctx.agents.currentInitiator();const human=options.messages.filter(m=>m.role==='user'&&m.source.kind==='user').at(-1);const key=String(agent.id)+':'+human.id,step=steps.get(key)??0;steps.set(key,step+1);const previous=options.messages.filter(m=>m.role==='tool').at(-1);const result=previous?JSON.parse(previous.content[0].text):null;appendFileSync(${JSON.stringify(journal)},JSON.stringify({sessionId:String(agent.id),step,nativeWriteAvailable:!!ctx.tools.get('write',agent),userText:human.content.filter(b=>b.type==='text').map(b=>b.text).join('\\n'),previous:result,systemText:step===0?options.messages.filter(m=>m.role==='system').map(m=>m.content.filter(b=>b.type==='text').map(b=>b.text).join('\\n')).join('\\n'):undefined})+'\\n');if(step>=5){yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'Here is my proposed repair for your review.'};yield {type:'block-end',index:0,block:{type:'text',text:'Here is my proposed repair for your review.'}};yield {type:'finish',reason:{kind:'stop'}};return;}let name,args;if(step===0){name='workflow_status';args={};}if(step===1){name='workflow_write';args={path:'must-not-exist.txt',content:'premature'};}if(step===2){name='workflow_search_skills';args={query:'ordinary task'};}if(step===3){name='workflow_open_skill';args={candidate:result.data.candidates[0].id};}if(step===4){name='workflow_read_workspace';args={path:'ordinary-input.txt'};}const id=ToolCallId('launcher-'+human.id+'-'+step),text=JSON.stringify(args);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:text};yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:text}};yield {type:'finish',reason:{kind:'tool-calls'}};}}());ctx.provide('launcherFixtureProvider',true);}`);
  const overlay=join(privateRoot,'owner-overlay.yml');
  writeFileSync(overlay,`- id: agent-default-model\n  config:\n    provider: launcher-script\n    model: no-network\n${template==='headless'?'- id: headless-runner\n  inject: [headlessStartup, launcherFixtureProvider]\n':''}${template==='acp'?'- id: acp\n  inject: [acpAppStartup, launcherFixtureProvider]\n  config:\n    provider: launcher-script\n    model: no-network\n':''}${template==='web'?'- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: true\n    surfaceContext: true\n':''}- insert:\n    - id: launcher-script-provider\n      name: ${JSON.stringify(provider)}\n`);
  const controllerConfigFile=join(privateRoot,'controller.json');writeFileSync(controllerConfigFile,JSON.stringify({stateRoot:join(privateRoot,'controllers'),installedRoots:[installed],external:false,privateRoots:[runtimeRoot,home,privateRoot]}));
  const config={runtimeRoot,nodeExecutable:process.execPath,home,stateRoot:join(privateRoot,'launches'),factoryModule:resolve(import.meta.dirname,'../conversation/controller-factory.mjs'),controllerConfigFile,overlays:[overlay]};
  const originals=[profileFile,manifest,join(home,'cordis.patch.yml')].map(path=>({path,bytes:readFileSync(path)}));
  return {root,workspace,home,privateRoot,profile,config,env,journal,originals,events:[],async launch(appArgs=[]){const run=await spawnGuardedDsh({config,profile,appArgs,workspace,verifyInstallation,environment:env,stdio:['pipe','pipe','pipe'],onEvent:event=>this.events.push(event)});let stdout='',stderr='';run.child.stdout.on('data',bytes=>stdout+=bytes);run.child.stderr.on('data',bytes=>stderr+=bytes);run.child.once('close',()=>{writeFileSync(join(run.prepared.runRoot,'native-stdout.txt'),stdout);writeFileSync(join(run.prepared.runRoot,'native-stderr.txt'),stderr);});return {...run,output:()=>({stdout,stderr})};},assertPreserved(){for(const item of originals)assert(readFileSync(item.path).equals(item.bytes),`Existing profile changed: ${item.path}`);assert.equal(existsSync(join(workspace,'must-not-exist.txt')),false);assert.equal(readFileSync(join(workspace,'ordinary-input.txt'),'utf8'),'\ufeffordinary project input\r\n');}};
}

function rpcClient(child){
  let nextId=1,buffer='';const pending=new Map(),notifications=[];
  child.stdout.on('data',bytes=>{buffer+=bytes.toString('utf8');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const message=JSON.parse(line);if(message.id!==undefined&&pending.has(message.id)){const entry=pending.get(message.id);pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(Error(JSON.stringify(message.error))):entry.resolve(message.result);}else notifications.push(message);}});
  return {notifications,request(method,params){const id=nextId++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native RPC timed out: '+method));},15000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}};
}

test('real CLI headless ordinary tasks, separate sessions and cold resume use the production factory',{skip:!runtimeRoot,timeout:45000},async()=>{
  const f=await fixture('headless');let run;
  try{
    run=await f.launch(['Inspect ordinary-input.txt and propose a repair. Preserve the BOM and CRLF.']);let outcome=await run.finished;assert.equal(outcome.nativeExitCode,0,run.output().stderr);assert.equal(outcome.exitCode,2);assert.equal(outcome.status,'pending');const firstSession=outcome.sessions[0].sessionId;
    run=await f.launch(['A separate ordinary conversation: inspect the same project and propose a different repair.']);outcome=await run.finished;assert.equal(outcome.exitCode,2);assert.notEqual(outcome.sessions[0].sessionId,firstSession);
    run=await f.launch(['--session-id',firstSession,'Continue the original request while preserving current input.']);outcome=await run.finished;assert.equal(outcome.exitCode,2);assert.equal(outcome.sessions[0].sessionId,firstSession);
    const journal=readFileSync(f.journal,'utf8').trim().split('\n').map(JSON.parse);assert.equal(journal.length,18);
    const scoped=journal.filter(e=>e.sessionId===firstSession&&e.step===0);assert.equal(scoped.length,2);assert(scoped[1].systemText.includes('Inspect ordinary-input.txt and propose a repair. Preserve the BOM and CRLF.'));assert(scoped[1].systemText.includes('prior read confirmations have been invalidated'));
    assert(journal.filter(e=>e.step===1).every(e=>e.previous.state.candidates.length===0));assert(journal.filter(e=>e.step===2).every(e=>e.previous.ok===false));assert(journal.filter(e=>e.step===5).every(e=>e.previous.ok===true));
    assert(f.events.some(e=>e.type==='plugin:workflow/card'&&e.data.kind==='scope'));assert(f.events.some(e=>e.type==='plugin:workflow/status'&&e.data.status==='pending'));f.assertPreserved();
    writeFileSync(join(f.root,'verification.json'),JSON.stringify({kind:'production-generic-native-cli-no-model',passed:true,requests:journal.length,outcome},null,2));
  }finally{if(run?.child.exitCode===null)run.child.kill();}
});

test('the installed CLI main uses a fixed private configuration and reports pending after native exit zero',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await fixture('headless'),bootstrapPayload=join(f.privateRoot,'test-bootstrap-payload'),configFile=join(f.privateRoot,'launcher.json');mkdirSync(bootstrapPayload);const verifier=join(bootstrapPayload,'test-only-verifier.mjs');
  writeFileSync(verifier,'export async function verifyInstallation(){return {ok:true,testOnly:true,attestation:"existing-runtime-boundary-test-only"};}');
  const bootstrapManifest=join(f.privateRoot,'test-bootstrap-manifest.json'),verifierBytes=readFileSync(verifier),verifierHash=createHash('sha256').update(verifierBytes).digest('hex');writeFileSync(bootstrapManifest,JSON.stringify({format:1,files:[{path:'test-only-verifier.mjs',bytes:verifierBytes.length,sha256:verifierHash}]}));
  writeFileSync(configFile,JSON.stringify({...f.config,integrityVerifierModule:verifier,integrityVerifierSha256:verifierHash,integrity:{payloadRoot:bootstrapPayload,manifestPath:bootstrapManifest,manifestSha256:createHash('sha256').update(readFileSync(bootstrapManifest)).digest('hex')}}));
  const bootstrap=join(f.privateRoot,'trusted-cli-test-bootstrap.mjs');writeFileSync(bootstrap,`import {runOwnerCli} from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'launcher.mjs')).href)};const result=await runOwnerCli({ownerConfigPath:${JSON.stringify(configFile)},argv:${JSON.stringify([f.profile,'Inspect ordinary-input.txt and propose a repair.'])}});process.exitCode=result.exitCode;`);
  const result=await new Promise((fulfill,reject)=>{const child=spawn(process.execPath,[bootstrap],{cwd:f.workspace,env:f.env,windowsHide:true});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.once('error',reject);child.once('close',code=>fulfill({code,stdout,stderr}));});
  assert.equal(result.code,2,result.stderr);assert.match(result.stdout,/proposed repair/);const messages=result.stderr.trim().split('\n').filter(line=>line.startsWith('{')).map(JSON.parse);const final=messages.find(e=>e.event?.type==='workflow_outcome').event;assert.equal(final.nativeExitCode,0);assert.equal(final.status,'pending');assert(messages.some(e=>e.event?.type==='plugin:workflow/card'));f.assertPreserved();
});

test('real SDK stdio conversations carry native user turns and independent host status',{skip:!runtimeRoot,timeout:45000},async()=>{
  const f=await fixture('sdk');const run=await f.launch(),rpc=rpcClient(run.child);
  try{
    await rpc.request('initialize',{cwd:f.workspace,provider:'launcher-script',model:'no-network'});
    for(const [sessionId,text]of [['wire-a','Inspect ordinary-input.txt and propose a repair.'],['wire-b','Another ordinary conversation about this project.'],['wire-a','Also preserve the current CRLF bytes.']]){await rpc.request('session/prompt',{sessionId,contentBlocks:[{type:'text',text}]});await rpc.request('session/wait',{sessionId});}
    assert(rpc.notifications.some(e=>e.method==='session.event'&&e.params.event.type==='plugin:workflow/status'&&e.params.event.data.complete===false));
    await rpc.request('shutdown',{});const outcome=await run.finished;assert.equal(outcome.nativeExitCode,0);assert.equal(outcome.sessions.length,2);assert(outcome.sessions.every(e=>e.complete===false));f.assertPreserved();
  }finally{if(run.child.exitCode===null)run.child.kill();}
});

test('SDK-minimal reports its text-only PTY as blocked without inventing exact process evidence',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await fixture('sdk-minimal');const run=await f.launch(),rpc=rpcClient(run.child);
  try{
    await rpc.request('initialize',{cwd:f.workspace,provider:'launcher-script',model:'no-network'});
    await rpc.request('session/prompt',{sessionId:'minimal-conversation',contentBlocks:[{type:'text',text:'Inspect ordinary-input.txt and propose a repair without changing it.'}]});const waited=await rpc.request('session/wait',{sessionId:'minimal-conversation'});writeFileSync(join(f.root,'minimal-wait.json'),JSON.stringify(waited,null,2));
    await rpc.request('shutdown',{});const outcome=await run.finished;writeFileSync(join(f.root,'minimal-notifications.json'),JSON.stringify(rpc.notifications,null,2));assert.equal(outcome.sessions[0]?.status,'blocked');assert.match(outcome.sessions[0].failed,/Native foreground process failed/);assert.equal(outcome.sessions[0].complete,false);
    const journal=readFileSync(f.journal,'utf8').trim().split('\n').map(JSON.parse);assert.equal(journal.length,5);assert(journal.every(e=>e.nativeWriteAvailable===false));assert.equal(journal.find(e=>e.step===2).previous.ok,false);
    const end=rpc.notifications.find(e=>e.method==='session.event'&&e.params.event.type==='turn/end');assert.equal(end.params.event.data.reason.kind,'aborted');assert.equal(typeof end.params.event.data.reason.reason.reason,'string');f.assertPreserved();
  }finally{writeFileSync(join(f.root,'minimal-notifications.json'),JSON.stringify(rpc.notifications,null,2));if(run.child.exitCode===null)run.child.kill();}
});

test('real ACP stdio enters the same production conversation factory',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await fixture('acp');const run=await f.launch(),rpc=rpcClient(run.child);
  try{
    await rpc.request('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'boundary-test',version:'1'}});
    const session=await rpc.request('session/new',{cwd:f.workspace,mcpServers:[]});
    await rpc.request('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Inspect ordinary-input.txt and propose a repair.'}]});
    run.child.stdin.end();const outcome=await run.finished;assert.equal(outcome.sessions.length,1);assert.equal(outcome.sessions[0].status,'pending');assert(f.events.some(e=>e.type==='plugin:workflow/card'));f.assertPreserved();
  }finally{if(run.child.exitCode===null)run.child.kill();}
});

test('the controlled ordinary Web entry binds loopback without opening a browser',{skip:!runtimeRoot,timeout:30000},async()=>{
  const f=await fixture('web');const prepared=await prepareGuardedLaunch({config:f.config,profile:f.profile,appArgs:['--host','127.0.0.1','--port','0'],workspace:f.workspace,verifyInstallation,environment:f.env});assert.equal(prepared.args.at(-1),'--no-open');
  const run=await f.launch(['--host','127.0.0.1','--port','0']);
  try{
    const url=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Native Web startup timed out')),15000);run.child.stdout.on('data',bytes=>{text+=bytes;const match=text.match(/dsh web: (http[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
    const clean=new URL('/',url);assert.equal((await fetch(clean)).status,401);const bootstrap=await fetch(url,{redirect:'manual'});assert.equal(bootstrap.status,303);const cookie=bootstrap.headers.get('set-cookie').split(';')[0];const response=await fetch(clean,{headers:{cookie}});assert.equal(response.status,200);assert((await response.text()).includes('<html'));
    run.child.kill();await run.finished;f.assertPreserved();
  }finally{if(run.child.exitCode===null)run.child.kill();}
});




