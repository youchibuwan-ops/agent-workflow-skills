import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {userInfo} from 'node:os';

const forbidden=/^--(?:config|home|patch|profile|from-default-profile|dump-config(?:-schema)?|dump-default-config|factory(?:-module)?|controller-config|runtime-root|node-options|open)(?:=|$)/;
const inside=(root,path)=>{const part=relative(root,path);return part===''||(!part.startsWith('..')&&!isAbsolute(part));};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function profileName(value){if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)||['plugin','desktop'].includes(value.toLowerCase()))throw Error('A supported native profile name is required');return value;}
function appArguments(values){if(!Array.isArray(values)||values.some(value=>typeof value!=='string'||value.includes('\0')||forbidden.test(value)))throw Error('App arguments cannot override owner home, profile, patches, factory or runtime policy');return [...values];}
function absolute(value,label){if(typeof value!=='string'||!isAbsolute(value))throw Error(`${label} must be an absolute owner path`);return resolve(value);}
function regular(path,label){if(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==resolve(path))throw Error(`${label} must be a regular unredirected owner file`);return path;}

export function pinVerifierBootstrap(config){
  const policy=config.integrity;if(!policy||!/^[a-f0-9]{64}$/.test(policy.manifestSha256??''))throw Error('Pinned bootstrap source manifest required');
  const manifest=regular(absolute(policy.manifestPath,'source manifest'),'source manifest'),bytes=readFileSync(manifest);if(sha(bytes)!==policy.manifestSha256)throw Error('Pinned source manifest SHA256 mismatch');
  const root=realpathSync(absolute(policy.payloadRoot,'payloadRoot')),data=JSON.parse(bytes),members=new Map();if(data.format!==1||!Array.isArray(data.files)||!data.files.length)throw Error('Incomplete bootstrap source manifest');
  for(const member of data.files){if(typeof member.path!=='string'||isAbsolute(member.path)||/[\\:\0]/.test(member.path)||member.path.split('/').some(part=>!part||part==='.'||part==='..')||!Number.isSafeInteger(member.bytes)||member.bytes<0||!/^[a-f0-9]{64}$/.test(member.sha256??''))throw Error('Invalid bootstrap source member');const path=resolve(root,member.path);if(!inside(root,path)||members.has(path.toLowerCase()))throw Error('Colliding bootstrap source member');members.set(path.toLowerCase(),member);}
  const visited=new Set();
  function visit(file){const path=regular(absolute(file,'bootstrap source'),'bootstrap source');if(!inside(root,path)||lstatSync(path).nlink>1)throw Error('Bootstrap source is outside pinned payload or hard-linked');if(visited.has(path))return;visited.add(path);const member=members.get(path.toLowerCase()),source=readFileSync(path);if(!member||source.length!==member.bytes||sha(source)!==member.sha256)throw Error('Bootstrap source integrity mismatch');for(const match of source.toString('utf8').matchAll(/\b(?:import|export)\s+(?:(?:[^;\n]*?)\s+from\s*)?['"]([^'"]+)['"]/g)){const spec=match[1];if(spec.startsWith('node:'))continue;if(!spec.startsWith('.'))throw Error('Third-party bootstrap import forbidden before verification');visit(resolve(dirnameLocal(path),spec));}}
  visit(config.integrityVerifierModule);return config.integrityVerifierModule;
}
function dirnameLocal(path){return resolve(path,'..');}

export function parseLaunchArguments(argv){
  if(argv[0]==='authorize-resume'){if(argv.length!==2||typeof argv[1]!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(argv[1]))throw Error('authorize-resume requires exactly one native sessionId');return{command:'authorize-resume',sessionId:argv[1],profile:'headless',appArgs:[]};}
  let profile='headless',args=[...argv];
  if(args[0]==='--profile'){profile=profileName(args[1]);args=args.slice(2);}
  else if(args[0]&&!args[0].startsWith('-')){profile=profileName(args[0]);args=args.slice(1);}
  if(args[0]==='--')args=args.slice(1);
  return {profile,appArgs:appArguments(args)};
}

export function ownerConfigurationPath(){return join(userInfo().homedir,'.agent-workflow','global','owner-config.dsh.json');}

export async function prepareGuardedLaunch({config,profile='headless',appArgs=[],workspace=process.cwd(),verifyInstallation,environment=process.env}={}){
  if(typeof verifyInstallation!=='function')throw Error('Trusted installation/dependency verifier is required before loading DSH');
  const verified=await verifyInstallation({config,profile});if(verified?.ok!==true)throw Error('Installation verification refused startup');
  const [{requiredSessionPolicy},{resolveDshRuntime}]=await Promise.all([import('./policy.mjs'),import('./runtime.mjs')]);
  profileName(profile);appArgs=appArguments(appArgs);
  if(environment.NODE_OPTIONS)throw Error('NODE_OPTIONS is incompatible with the controlled DSH runtime');
  const runtimeRoot=absolute(config.runtimeRoot,'runtimeRoot'),home=absolute(config.home,'home'),stateRoot=absolute(config.stateRoot,'stateRoot');
  workspace=realpathSync(workspace);if(inside(workspace,stateRoot))throw Error('Private launch state must be outside the actor workspace');
  const factoryModule=regular(absolute(config.factoryModule,'factoryModule'),'factoryModule');
  const controllerConfigFile=regular(absolute(config.controllerConfigFile,'controllerConfigFile'),'controllerConfigFile');
  if(inside(workspace,controllerConfigFile))throw Error('Controller configuration cannot live in the actor workspace');
  const nodeExecutable=regular(absolute(config.nodeExecutable??process.execPath,'nodeExecutable'),'nodeExecutable');
  if(Number(process.versions.node.split('.')[0])<24)throw Error('Start this launcher with the verified Node 24 runtime');
  mkdirSync(stateRoot,{recursive:true});if(lstatSync(stateRoot).isSymbolicLink()||realpathSync(stateRoot)!==stateRoot)throw Error('Private launch state is redirected');
  const runRoot=mkdtempSync(join(stateRoot,'launch-')),eventFile=join(runRoot,'events.jsonl'),policyFile=join(runRoot,'required-policy.json');writeFileSync(eventFile,'',{flag:'wx',mode:0o600});
  const runtime=resolveDshRuntime(runtimeRoot),version=JSON.parse(readFileSync(runtime.installAnchor,'utf8')).version;
  if(version!=='0.2.1-rc.2')throw Error('The installed DSH version has not been validated by this adapter');
  const {loadProfile,loadOverlayPatches,readProfilePatches,composeEntries}=await runtime.load('@deepseek-ai/dsh-app-boot');
  const original=loadProfile('dsh',profile,runtime.installAnchor,home);if(original.skippedBundles.length)throw Error('A selected native profile bundle is unreadable or incompatible');
  if(!Array.isArray(config.overlays??[]))throw Error('Owner overlays must be an array');
  const overlays=(config.overlays??[]).map(path=>regular(absolute(path,'owner overlay'),'owner overlay'));
  const parsedOverlays=overlays.flatMap(path=>loadOverlayPatches('dsh',path));
  const context={name:profile,dir:original.dir,patchPath:original.patchPath,installAnchor:runtime.installAnchor,cwd:workspace,home,startedBundles:original.layers.map(layer=>layer.packageName),overlays:parsedOverlays,telemetryDisabledEnv:environment.DSH_TELEMETRY_DISABLED};
  const entries=composeEntries([readProfilePatches('dsh',context,original)]);
  const driver=entries.some(row=>row.id==='headless-runner'&&row.disabled!==true)?'headless':entries.some(row=>row.id==='sdk-jsonrpc-server'&&row.disabled!==true)?'sdk':entries.some(row=>row.id==='acp'&&row.disabled!==true)?'acp':entries.some(row=>row.id==='web-runtime'&&row.disabled!==true)?'web':undefined;
  if(!driver)throw Error('This profile has no verified official headless, SDK, ACP or Web driver');
  const policy=requiredSessionPolicy({entries,factoryModule,eventFile});
  writeFileSync(policyFile,JSON.stringify(policy,null,2),{flag:'wx',mode:0o600});
  const policySha256=sha(readFileSync(policyFile));
  if(driver==='web')appArgs.push('--no-open');
  const args=[runtime.bin,'--profile',profile,...overlays.flatMap(path=>['--patch',path]),'--patch',policyFile,'--',...appArgs];
  const env={...environment,DSH_HOME:home,AGENT_WORKFLOW_HOST_CONFIG:controllerConfigFile};delete env.NODE_OPTIONS;
  return {nodeExecutable,args,env,workspace,eventFile,policyFile,runRoot,driver,profile,policySha256,
    verification:{attestation:verified.attestation??null,manifestSha256:verified.source?.manifestSha256??null,dependencies:(verified.dependencies??[]).map(item=>({treeSha256:item.treeSha256,attestation:item.attestation})),testOnly:verified.testOnly===true}};
}

export async function spawnGuardedDsh(options){
  const prepared=await prepareGuardedLaunch(options);
  const child=spawn(prepared.nodeExecutable,prepared.args,{cwd:prepared.workspace,env:prepared.env,stdio:options.stdio??'inherit',windowsHide:true});
  const statuses=new Map(),decoder=new TextDecoder('utf8',{fatal:true});let consumed=0,buffer='',eventFailure;
  const onEvent=options.onEvent??(event=>process.stderr.write(JSON.stringify({type:'workflow_host_event',event})+'\n'));
  function consume(final=false){
    try{
      regular(prepared.eventFile,'Private event sink');const bytes=readFileSync(prepared.eventFile);if(bytes.length>16*1024*1024||bytes.length<consumed)throw Error('Host event sink changed or exceeded its limit');
      buffer+=decoder.decode(bytes.subarray(consumed),{stream:!final});consumed=bytes.length;
      let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line)continue;const event=JSON.parse(line);if(!['plugin:workflow/card','plugin:workflow/status'].includes(event.type)||typeof event.sessionId!=='string')throw Error('Invalid host event record');if(event.type==='plugin:workflow/status')statuses.set(event.sessionId,event.data);onEvent(event);}
      if(final&&buffer.trim())throw Error('Host event sink ended with partial JSON');
    }catch(error){eventFailure=error;child.kill();}
  }
  const timer=setInterval(()=>consume(),75);timer.unref();
  const finished=new Promise((fulfill,reject)=>{
    child.once('error',error=>{clearInterval(timer);reject(error);});
    child.once('close',(nativeExitCode,signal)=>{
      clearInterval(timer);consume(true);if(eventFailure){reject(eventFailure);return;}
      const sessions=[...statuses.values()];const pending=sessions.some(status=>status.complete!==true);
      const businessStatus=sessions.some(status=>status.status==='blocked')?'blocked':pending?'pending':'complete';
      let exitCode=nativeExitCode??1,status=exitCode?'native-error':sessions.length?businessStatus:'no-task';
      if(prepared.driver==='headless'&&exitCode===0){
        if(!sessions.length&&!options.appArgs?.some(arg=>['--help','-h'].includes(arg))){exitCode=1;status='missing-host-status';}
        else if(pending){exitCode=2;status=businessStatus;}
      }
      const outcome={type:'workflow_outcome',profile:prepared.profile,driver:prepared.driver,nativeExitCode,signal,exitCode,status,sessions};
      try{onEvent(outcome);fulfill(outcome);}catch(error){reject(error);}
    });
  });
  return {child,prepared,finished};
}

export async function runOwnerCli({ownerConfigPath=ownerConfigurationPath(),argv=process.argv.slice(2)}={}){
  const {profile,appArgs,command,sessionId}=parseLaunchArguments(argv),configPath=regular(absolute(ownerConfigPath,'launcher config'),'launcher config');
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  const modulePath=regular(absolute(config.integrityVerifierModule,'integrityVerifierModule'),'integrity verifier');
  if(!/^[a-f0-9]{64}$/.test(config.integrityVerifierSha256??'')||sha(readFileSync(modulePath))!==config.integrityVerifierSha256)throw Error('Pinned installation verifier SHA256 mismatch');
  pinVerifierBootstrap(config);
  const module=await import(pathToFileURL(modulePath).href);if(typeof module.verifyInstallation!=='function')throw Error('Trusted verifier module lacks verifyInstallation');
  if(command==='authorize-resume'){
    const verified=await module.verifyInstallation({config,profile});if(verified?.ok!==true)throw Error('Installation verification refused resume authorization');
    try{
      if(process.env.NODE_OPTIONS)throw Error('Unsafe preload environment');
      const ownerRoot=realpathSync.native(dirnameLocal(configPath)),controllerFile=regular(absolute(config.controllerConfigFile,'controllerConfigFile'),'controllerConfigFile');
      if(lstatSync(controllerFile).nlink!==1||!inside(ownerRoot,realpathSync.native(controllerFile)))throw Error('Controller config is not owned');
      const conversation=JSON.parse(readFileSync(controllerFile,'utf8')),state=realpathSync.native(absolute(conversation.stateRoot,'conversation stateRoot'));
      if(!inside(ownerRoot,state)||(config.conversation&&realpathSync.native(config.conversation.stateRoot)!==state))throw Error('Conversation authority differs');
      const helper=regular(join(absolute(config.integrity.payloadRoot,'payloadRoot'),'hosts/conversation/resume-authorization.mjs'),'resume authority helper');
      if(lstatSync(helper).nlink!==1)throw Error('Resume authority helper must have a single owned file identity');
      const {authorizeResume}=await import(pathToFileURL(helper).href),report=authorizeResume({stateRoot:state,workspace:process.cwd(),sessionId});
      process.stdout.write(JSON.stringify(report)+'\n');return{...report,exitCode:0};
    }catch{throw Error('Resume authorization refused: a current trusted paused session in this workspace is required');}
  }
  const run=await spawnGuardedDsh({config,profile,appArgs,verifyInstallation:module.verifyInstallation});
  let interrupted;const interrupt=signal=>{interrupted=signal==='SIGINT'?130:143;run.child.kill(signal);};
  const stopInt=()=>interrupt('SIGINT'),stopTerm=()=>interrupt('SIGTERM');process.once('SIGINT',stopInt);process.once('SIGTERM',stopTerm);
  try{const outcome=await run.finished;return {...outcome,exitCode:interrupted??outcome.exitCode};}finally{process.off('SIGINT',stopInt);process.off('SIGTERM',stopTerm);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runOwnerCli().then(outcome=>{process.exitCode=outcome.exitCode;}).catch(error=>{process.stderr.write(`Controlled DSH refused: ${error.message}\n`);process.exitCode=1;});
