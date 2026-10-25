#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve,relative,isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { bindController } from './binding.mjs';
import { SERVICE } from './index.mjs';
import { runtimeImporter } from './runtime.mjs';

export function classifyOutcome(controller,reason,failure) {
  const stage=controller.stage;
  if(failure || reason?.kind!=='completed') return {status:'blocked',complete:false,stage,reason:failure??reason?.kind??'No durable completed turn'};
  if(controller.complete!==true) return {status:'waiting',complete:false,stage,reason:'Workflow remains incomplete; resolve the reported prerequisites or supply the required human choice.'};
  return {status:'complete',complete:true,stage};
}
export function assertHostIsolation(workspace,hostPaths) {
  for(const path of hostPaths.filter(Boolean)) {
    const rel=relative(resolve(workspace),resolve(path));
    if(rel==='' || (!rel.startsWith('..')&&!isAbsolute(rel))) throw new Error('Trusted DSH host, profile, runtime and audit paths must remain outside the actor workspace');
  }
}

function validateProfile(home,profile) {
  if(!home || !/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('Explicit DSH home and safe profile name required');
  const profileDir=resolve(home,'profiles',profile);
  const manifest=JSON.parse(readFileSync(resolve(profileDir,'package.json'),'utf8'));
  const bundles=manifest.dsh?.profile?.bundles;
  if(JSON.stringify(bundles)!==JSON.stringify(['@deepseek-ai/dsh-base','@deepseek-ai/dsh-headless','dsh-proactive-workflow'])) throw new Error('Use the dedicated, installed workflow profile with exactly the verified bundle list');
  // Trusted composition is not model input. Reject customization before it
  // could run privileged plugin code outside the model-facing ToolRuntime.
  for(const path of [resolve(home,'cordis.patch.yml'),resolve(profileDir,'cordis.patch.yml')]) {
    if(existsSync(path) && readFileSync(path,'utf8').replace(/^\s*#.*$/gm,'').trim().replace(/^\[\]$/,'')!=='') throw new Error(`Unreviewed profile customization is not allowed: ${path}`);
  }
  return profileDir;
}

export async function bootGuardedDsh({controller,workspace,home,profile='proactive-workflow',runtimeRoot,maxTokens=4096,credentialFree=false,onFatal=()=>{}}) {
  workspace=resolve(workspace);home=resolve(home);
  assertHostIsolation(workspace,[home,runtimeRoot,import.meta.dirname]);
  const profileDir=validateProfile(home,profile);
  if(!Number.isSafeInteger(maxTokens) || maxTokens<128 || maxTokens>8192) throw new Error('maxTokens must be an integer from 128 through 8192');
  controller.assertReady();
  const importRuntime=runtimeImporter(runtimeRoot);
  const {runProfile}=await importRuntime('@deepseek-ai/dsh/profile-boot');
  const {loadLayeredEnv}=await importRuntime('@deepseek-ai/dsh-app-boot');
  const {ToolCallId}=await importRuntime('@deepseek-ai/dsh-llm');
  const release=bindController(controller,{onFatal});
  const previousCwd=process.cwd();
  const previousHome=process.env.DSH_HOME;
  const previousTelemetry=process.env.DSH_TELEMETRY_DISABLED;
  const overlay=resolve(profileDir,`controlled-launch-${randomUUID()}.patch.yml`);
  const immutablePolicy=readFileSync(new URL('./cordis.patch.yml',import.meta.url),'utf8').split('- insert:')[0];
  const modelPolicy=credentialFree?'- id: llm-deepseek\n  disabled: true\n- id: llm-deepseek-account\n  disabled: true\n- id: llm-pi-ai\n  disabled: true\n':`- id: llm-deepseek\n  config:\n    apiKeyEnv: DEEPSEEK_API_KEY\n    thinking: disabled\n    maxTokens: ${maxTokens}\n    streamIdleTimeoutMs: 60000\n`;
  writeFileSync(overlay,`${immutablePolicy}\n- id: llm-retry\n  disabled: true\n${modelPolicy}`);
  process.chdir(workspace);process.env.DSH_HOME=home;process.env.DSH_TELEMETRY_DISABLED='1';
  let ctx;
  const close=async()=>{
    try {if(ctx) await ctx.fiber.dispose();}
    finally {
      release();process.chdir(previousCwd);
      if(previousHome===undefined) delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;
      if(previousTelemetry===undefined) delete process.env.DSH_TELEMETRY_DISABLED;else process.env.DSH_TELEMETRY_DISABLED=previousTelemetry;
      try {unlinkSync(overlay);}catch{}
    }
  };
  try {
    let environment;
    if(credentialFree){
      const {createLaunchEnvironmentSnapshot}=await importRuntime('@deepseek-ai/dsh-launch-environment');
      const values={};for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','PATH'])if(process.env[key]!==undefined)values[key]=process.env[key];
      environment=createLaunchEnvironmentSnapshot([{source:'process',values}]);
    } else environment=loadLayeredEnv('dsh');
    ({ctx}=await runProfile({environment,profile,patchFiles:[overlay],args:[]}));
    const service=ctx.get(SERVICE);
    assert(service?.ownership==='root-context' && service.controller===controller,'Required root guard did not load from the installed bundle');
    service.assertActive();
    const entry=[...ctx.loader.entries()].find(e=>e.options.id==='proactive-workflow-guard');
    assert(entry?.fiber,'Required workflow Loader entry is inactive');
    for(const id of ['headless-runner','headless-startup','hmr','tool-plugin-manager','config-editor','spill-policy','tool-result-pruner','compaction-basic']) assert(![...ctx.loader.entries()].find(e=>e.options.id===id)?.fiber,`Unsafe startup entry active: ${id}`);
    let bodies=0;
    const probeName=`workflow_startup_unknown_${randomUUID().replaceAll('-','')}`;
    const disposeProbe=ctx.tools.register({name:probeName,description:'Trusted startup denial probe',parameters:{type:'object',properties:{}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>{bodies++;return 'FORBIDDEN';}});
    try {
      for(const name of [probeName,'write','pwsh','bash','run_code','plugin_manager']) {
        const result=await ctx.tools.execute({name,arguments:{},callId:ToolCallId(`startup-${randomUUID()}`),signal:new AbortController().signal});
        assert.equal(result.isError,true,`Startup probe was allowed: ${name}`);
        // Schema failures are also closed, but unknown-name rejection must be
        // attributable to this root guard rather than absence of a tool body.
        if(name===probeName) assert.match(JSON.stringify(result),/Raw or unknown tool/);
      }
      assert.equal(bodies,0,'Denied startup body was entered');
    }finally {disposeProbe();}
    controller.assertReady();
    return {ctx,service,importRuntime,close,startup:{nativeDenials:6,forbiddenBodies:bodies}};
  }catch(error){await close();throw error;}
}

export async function runDshWorkflow({controller,userMessage,workspace,home,profile,runtimeRoot,model='deepseek-flash',maxTokens=4096,maxRequests=48,timeoutMs=120000,onEvent=()=>{}}) {
  if(typeof userMessage!=='string' || !userMessage.trim()) throw new Error('External human userMessage is required');
  if(!Number.isSafeInteger(maxRequests) || maxRequests<1 || maxRequests>64) throw new Error('maxRequests must be between 1 and 64');
  if(!Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>600000) throw new Error('timeoutMs must be between 1000 and 600000');
  let handle,failure,timeout;
  const fatal=reason=>{failure??=reason;try{handle?.agent.cancel({kind:'hook'});}catch{}};
  const boot=await bootGuardedDsh({controller,workspace,home,profile,runtimeRoot,maxTokens,onFatal:fatal});
  const {ctx}=boot;
  const events=[];
  let output='',reason,requestCount=0;
  const disposers=[];
  try {
    const {SessionId}=await boot.importRuntime('@deepseek-ai/dsh-session');
    const {createUserMessage}=await boot.importRuntime('@deepseek-ai/dsh-llm');
    const {installModelSelection}=await boot.importRuntime('@deepseek-ai/dsh-agent');
    const selection={provider:'deepseek-official',model};
    handle=await ctx.agents.create({sessionId:SessionId(`workflow-${randomUUID()}`),meta:{cwd:resolve(workspace)},agentOptions:selection,
      setup(agentCtx){
        installModelSelection(agentCtx,{current:selection,assembled:undefined});
        agentCtx.tools.presentAs('native');
        agentCtx.tools.restrict({allow:controller.toolSchemas.map(s=>s.name)});
        agentCtx.systemPrompt.section({name:'workflow-host',order:0,text:controller.instructions,complete:true,interpolate:false});
      }});
    const agent=handle.agent;
    const offered=ctx.tools.schemas(agent).map(s=>s.name).sort();
    assert.deepEqual(offered,controller.toolSchemas.map(s=>s.name).sort(),'Model tool schemas include an unapproved capability');
    disposers.push(ctx.on('session/event',(session,event)=>{
      if(session!==agent.session) return;
      // Persist only authoritative durable events; request headers may hold
      // endpoint metadata, so expose the bounded event types needed for audit.
      if(['tool/call','tool/result','assistant/message','turn/end'].includes(event.type)) {
        events.push(event);onEvent(event);
      }
      if(event.type==='assistant/message') output=event.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');
      if(event.type==='turn/end') reason=event.data.reason;
    }));
    disposers.push(ctx.on('agent/error',({agent:subject})=>{if(subject===agent) fatal('Model driver error');}));
    disposers.push(agent.ctx.on('agent/pre-step',async(_step,next)=>{
      if(++requestCount>maxRequests){controller.abort('Model request budget exhausted');fatal('Model request budget exhausted');return {kind:'reject'};}
      boot.service.assertActive();return next();
    }));
    await agent.whenIdle();
    timeout=setTimeout(()=>{controller.abort('Model run timed out');fatal('Model run timed out');},timeoutMs);
    agent.followup(createUserMessage({content:[{type:'text',text:userMessage}],source:{kind:'user'}}));
    await agent.whenIdle();
    clearTimeout(timeout);
    await ctx.sessions.flush(agent.session);
    boot.service.assertActive();
    return {...classifyOutcome(controller,reason,failure),provider:selection.provider,model,requestCount,output,events,startup:boot.startup,audit:controller.exportAudit()};
  }finally {
    clearTimeout(timeout);for(const dispose of disposers) dispose();
    try {await handle?.dispose();}finally{await boot.close();}
  }
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const {values}=parseArgs({options:{check:{type:'boolean'},workspace:{type:'string'},home:{type:'string'},profile:{type:'string'},'runtime-root':{type:'string'},'core-module':{type:'string'},'user-message-file':{type:'string'},contract:{type:'string'},'state-root':{type:'string'},'audit-file':{type:'string'},model:{type:'string'},'max-tokens':{type:'string'},'max-requests':{type:'string'},'timeout-ms':{type:'string'}}});
  const emit=value=>console.log(JSON.stringify(value));
  let cliController;
  (async()=>{
    if(!values.workspace || !values.home || !values['user-message-file']) throw new Error('--workspace, --home and --user-message-file are required');
    assertHostIsolation(values.workspace,[values['audit-file']]);
    const userMessage=readFileSync(resolve(values['user-message-file']),'utf8');
    const contract=values.contract?JSON.parse(readFileSync(resolve(values.contract),'utf8')):undefined;
    if(values.check&&(!contract?.catalog?.length||!contract?.references?.length))throw new Error('--check requires a host-owned contract with an available catalog and references');
    const core=await import(pathToFileURL(resolve(values['core-module']??fileURLToPath(new URL('../core/workflow-host.mjs',import.meta.url)))).href);
    const controller=await core.createWorkflowHost({workspace:resolve(values.workspace),userMessage,stateRoot:values['state-root'],contract,onCard:card=>emit({type:'workflow_card',card})});
    cliController=controller;
    if(values.check){
      const boot=await bootGuardedDsh({controller,workspace:values.workspace,home:values.home,profile:values.profile,runtimeRoot:values['runtime-root'],credentialFree:true});
      const checked={type:'workflow_check',status:'ready',complete:false,stage:controller.stage,enforcement:'host_guarded',...boot.startup,modelStarted:false,credentialsRequired:false};
      await boot.close();if(values['audit-file'])writeFileSync(resolve(values['audit-file']),JSON.stringify({...checked,audit:controller.exportAudit()},null,2));emit(checked);return;
    }
    const result=await runDshWorkflow({controller,userMessage,workspace:values.workspace,home:values.home,profile:values.profile,runtimeRoot:values['runtime-root'],model:values.model,maxTokens:values['max-tokens']?Number(values['max-tokens']):undefined,maxRequests:values['max-requests']?Number(values['max-requests']):undefined,timeoutMs:values['timeout-ms']?Number(values['timeout-ms']):undefined,onEvent:event=>emit({type:'workflow_event',event})});
    if(values['audit-file']) {const path=resolve(values['audit-file']);writeFileSync(path,JSON.stringify(result,null,2));}
    emit({type:'workflow_result',...result,events:undefined,audit:undefined});
    process.exitCode=result.status==='complete'?0:result.status==='waiting'?2:1;
  })().catch(()=>{
    const failure={type:'workflow_result',status:'blocked',complete:false,reason:'Controlled DSH workflow could not start or execute; inspect the private host audit.'};
    if(values['audit-file']&&cliController) {
      try {assertHostIsolation(values.workspace,[values['audit-file']]);writeFileSync(resolve(values['audit-file']),JSON.stringify({...failure,audit:cliController.exportAudit()},null,2));}catch{}
    }
    emit(failure);process.exitCode=1;
  });
}
