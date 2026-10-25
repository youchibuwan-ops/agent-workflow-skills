import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {createHash} from 'node:crypto';
import {copyFileSync,constants,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';
import {createCodexProxy,isolatedBackendEnv} from './proxy.mjs';
import {restrictCatalog} from './strict-config.mjs';
import {createWorkflowHost,WORKFLOW_TOOL_SCHEMAS} from '../core/workflow-host.mjs';
const inside=(root,value)=>{const rel=path.relative(root,value);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_RESULT=65536;
export function parseTaskClientArgs(args){
 const keys=['workspace','user-message-file','contract-file','runtime-path','catalog-path','auth-path','state-root'];
 const {values}=parseArgs({args,strict:true,allowPositionals:false,options:Object.fromEntries([...keys.map(k=>[k,{type:'string'}]),['run',{type:'boolean',default:false}],['non-interactive',{type:'boolean',default:false}],['help',{type:'boolean',default:false}]])});
 return Object.fromEntries(Object.entries(values).map(([key,value])=>[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),value]));
}
function targetPath(value){let parent=path.resolve(value),tail=[];while(!existsSync(parent)){tail.unshift(path.basename(parent));const next=path.dirname(parent);if(next===parent)throw Error('Cannot resolve private state path');parent=next;}return path.join(realpathSync(parent),...tail);}
function readText(file,maxBytes){const data=readFileSync(file);if(data.length>maxBytes)throw Error('Input file exceeds supported byte limit');return new TextDecoder('utf-8',{fatal:true}).decode(data);}
export function preflightTask(options){
 if(!options?.workspace)throw Error('--workspace is required');
 const workspace=realpathSync(options.workspace);if(!statSync(workspace).isDirectory())throw Error('Workspace must be an existing directory');
 const normalized={workspace};
 for(const key of ['userMessageFile','contractFile','runtimePath','catalogPath','authPath']){
  if(typeof options[key]!=='string'||!options[key])throw Error(`${key} is required explicitly`);
  const lexical=path.resolve(options[key]),actual=realpathSync(lexical);
  if(inside(workspace,lexical)||inside(workspace,actual))throw Error(`${key} must remain outside the actor workspace`);
  if(!statSync(actual).isFile())throw Error(`${key} must be a regular file`);normalized[key]=actual;
 }
 if(typeof options.stateRoot!=='string'||!options.stateRoot)throw Error('--state-root is required');
 normalized.stateRoot=targetPath(options.stateRoot);
 if(inside(workspace,normalized.stateRoot)||inside(normalized.stateRoot,workspace))throw Error('State and workspace must be disjoint');
 if(existsSync(normalized.stateRoot)&&(!statSync(normalized.stateRoot).isDirectory()||readdirSync(normalized.stateRoot).length))throw Error('stateRoot must be a new or empty private directory; resume is unsupported');
 const userMessage=readText(normalized.userMessageFile,MAX_RESULT);if(!userMessage.trim())throw Error('External user message must not be empty');
 const contract=JSON.parse(readText(normalized.contractFile,1048576));if(!contract||typeof contract!=='object'||Array.isArray(contract))throw Error('External contract must be an object');
 for(const key of ['catalog','references'])if(Array.isArray(contract[key]))contract[key]=contract[key].map(entry=>({...entry,...(typeof entry.path==='string'?{path:path.resolve(path.dirname(normalized.contractFile),entry.path)}:{})}));
 const catalog=restrictCatalog(JSON.parse(readText(normalized.catalogPath,16*1048576)));
 JSON.parse(readText(normalized.authPath,1048576));
 return {options:normalized,userMessage,contract,catalog,userMessageSha256:sha(readFileSync(normalized.userMessageFile)),contractSha256:sha(readFileSync(normalized.contractFile))};
}
function secretRedactor(auth){
 const secrets=[];function visit(value,key=''){if(typeof value==='string'&&/token|api.?key|secret|password/i.test(key)&&value.length>=8)secrets.push(value);else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))visit(v,k);}
 visit(auth);return text=>secrets.reduce((result,secret)=>result.split(secret).join('[REDACTED]'),text);
}
export async function runTaskClient(options,dependencies={}){
 const prepared=preflightTask(options),o=prepared.options;
 const emit=dependencies.emit??(event=>process.stdout.write(JSON.stringify(event)+'\n'));
 if(options.run!==true){const report={type:'preflight',status:'checked',willRun:false,workspace:o.workspace,stateRoot:o.stateRoot,userMessageSha256:prepared.userMessageSha256,contractSha256:prepared.contractSha256,modelCount:prepared.catalog.models.length,notice:'No backend or model was started. Pass --run explicitly to execute this task. This is an independent controlled CLI; desktop is unchanged.'};emit(report);return report;}
 const sourceAuth=readFileSync(o.authPath),sourceAuthHash=sha(sourceAuth),redact=secretRedactor(JSON.parse(sourceAuth.toString('utf8')));
 mkdirSync(o.stateRoot,{recursive:true,mode:0o700});
 const backendRoot=path.join(o.stateRoot,'backend'),env=isolatedBackendEnv(backendRoot),auth=path.join(env.CODEX_HOME,'auth.json');
 const log=(name,value)=>writeFileSync(path.join(o.stateRoot,name),redact(JSON.stringify(value))+'\n',{flag:'a',mode:0o600});
 const safeEmit=value=>emit(JSON.parse(redact(JSON.stringify(value))));
 let proxy,ws,controller,reader,result,latestState={},lastNativeTurn=null,stopRequested=false,authOwned=false,abortReject;
 const beforeHashes=Object.fromEntries(['task-client.mjs','proxy.mjs','rpc-policy.mjs','strict-config.mjs','../core/workflow-host.mjs','../core/tool-schemas.mjs','../../skills/proactive-skill-discovery/scripts/workflow-gate.mjs'].map(file=>[file,sha(readFileSync(new URL(file,import.meta.url)))]));
 const aborted=new Promise((_,reject)=>{abortReject=reject;});aborted.catch(()=>{});
 const stop=()=>{stopRequested=true;abortReject(Error('External task client stopped'));void proxy?.close('External task client stopped');};
 const signal=dependencies.signal;signal?.addEventListener('abort',stop,{once:true});
 try{
  if(signal?.aborted){stopRequested=true;throw Error('Task cancelled before startup');}
  copyFileSync(o.authPath,auth,constants.COPYFILE_EXCL);authOwned=true;
  const factory=dependencies.controllerFactory??createWorkflowHost;
  proxy=await (dependencies.proxyFactory??createCodexProxy)({workspace:o.workspace,stateRoot:backendRoot,backendEnv:env,backendCommand:dependencies.backendCommand??[o.runtimePath],strictCatalog:prepared.catalog,toolSchemas:dependencies.toolSchemas??WORKFLOW_TOOL_SCHEMAS,
   controllerFactory:async args=>{controller=await factory({...args,contract:prepared.contract});return controller;},
   onCard:card=>{log('cards.jsonl',card);safeEmit({type:'card',card});},
   onAudit:event=>log('proxy-audit.jsonl',event),
   onStderr:text=>writeFileSync(path.join(o.stateRoot,'stderr.log'),redact(text),{flag:'a',mode:0o600})});
  ws=new WebSocket(proxy.url,{maxPayload:8*1048576,perMessageDeflate:false});
  let nextId=1,completionWaiter=null;
  const pending=new Map();
  const rejectPending=error=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();completionWaiter?.reject(error);};
  ws.on('error',rejectPending);
  ws.on('close',()=>rejectPending(Error(proxy.exportAudit().failure??'Controlled channel closed')));
  ws.on('message',(bytes,binary)=>{
   try{
    if(binary||bytes.length>8*1048576)throw Error('Invalid controlled RPC frame');
    const message=JSON.parse(bytes.toString());log('rpc.jsonl',{direction:'in',message});
    if(message.id!==undefined&&pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(message.error.message)):p.resolve(message.result);}
    if(message.method==='item/completed'&&message.params?.item?.type==='dynamicToolCall'){
     const item=message.params.item;
     for(const content of item.contentItems??[]){if(content.type==='inputText'&&typeof content.text==='string'){
      if(Buffer.byteLength(content.text)>MAX_RESULT)throw Error('Native tool result exceeded complete-delivery limit');
      const body=JSON.parse(content.text);if(body.state)latestState=body.state;
     }}
    }
    if(message.method==='workflow/state'){latestState={...latestState,...message.params};}
    if(message.method==='turn/completed'){
     lastNativeTurn=message.params;const state=message.params.workflow;
     if(!state||typeof state.complete!=='boolean')throw Error('Authoritative workflow completion is missing');
     latestState={...latestState,...state};completionWaiter?.resolve(message.params);
    }
    if(message.method==='item/agentMessage/delta'&&typeof message.params?.delta==='string')safeEmit({type:'assistant_delta',text:message.params.delta});
   }catch(error){rejectPending(error);void proxy.close(error.message);}
  });
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{
   const id=nextId++,message={id,method,params},timer=setTimeout(()=>{pending.delete(id);reject(Error(`RPC timeout: ${method}`));void proxy.close('RPC timeout');},30000);
   pending.set(id,{resolve,reject,timer});log('rpc.jsonl',{direction:'out',message});ws.send(JSON.stringify(message));
  });
  await rpc('initialize',{clientInfo:{name:'controlled-workflow-task-client',version:'1'}});
  ws.send(JSON.stringify({method:'initialized',params:{}}));
  const thread=await rpc('thread/start',{cwd:o.workspace});
  const sendTurn=async text=>{
   let timer;
   const completed=new Promise((resolve,reject)=>{completionWaiter={resolve,reject};timer=setTimeout(()=>{reject(Error('Model turn timeout'));void proxy.close('Model turn timeout');},dependencies.turnTimeoutMs??600000);});
   completed.catch(()=>{});
   try{await rpc('turn/start',{threadId:thread.thread.id,input:[{type:'text',text}]});return await completed;}
   finally{clearTimeout(timer);completionWaiter=null;}
  };
  let text=prepared.userMessage;
  for(;;){
   const completed=await sendTurn(text),state=completed.workflow;
   if(state.complete){if(controller.complete!==true)throw Error('Proxy/controller completion mismatch');result={status:'complete',stage:state.stage,complete:true,model:thread.model};break;}
   const waiting={type:'waiting',status:state.status,stage:state.stage,complete:false,options:latestState.options??[],reason:state.blockedReason??completed.turn?.error?.message??null};
   safeEmit(waiting);log('waiting.jsonl',waiting);
   if(options.nonInteractive===true){result={...waiting,status:state.status==='needs_input'?'needs_input':'blocked'};break;}
   if(!dependencies.readHuman){reader??=createInterface({input:process.stdin,output:process.stderr});}
   let answer;
   for(;;){
    answer=await Promise.race([(dependencies.readHuman??(prompt=>reader.question(prompt)))(`阶段 ${state.stage}：输入 choose <id>、accept、补充说明，或 quit 停止： `,waiting),aborted]);
    if(answer==null||answer.trim().toLowerCase()==='quit')break;
    text=answer.trim();if(!text)continue;
    if(/^choose\s+/i.test(text))text='/workflow choose '+text.replace(/^choose\s+/i,'');
    else if(text.toLowerCase()==='accept')text='/workflow accept';
    const chosen=text.match(/^\/workflow choose ([a-z0-9_-]+)$/i);
    if(chosen&&(state.stage!=='selection'||!waiting.options.some(option=>option.id===chosen[1]))){safeEmit({type:'input_error',message:'Choose an actually displayed option at selection.'});continue;}
    if(text==='/workflow accept'&&state.stage!=='feedback'){safeEmit({type:'input_error',message:'Accept only a current validated draft at feedback.'});continue;}
    break;
   }
   if(answer==null||answer.trim().toLowerCase()==='quit'){result={status:'aborted',stage:state.stage,complete:false};break;}
   log('human-input.jsonl',{text});
  }
 }catch(error){result={status:stopRequested?'aborted':'failed',stage:controller?.stage??'uninitialized',complete:false,error:redact(error.stack??String(error))};}
 finally{
  reader?.close();signal?.removeEventListener('abort',stop);
  result??={status:'failed',stage:'uninitialized',complete:false,error:'Task ended without a result'};
  result.taskAudit=controller?.exportAudit();
  try{await proxy?.close();}catch(error){result.status='failed';result.shutdownError=redact(String(error));}
  try{if(authOwned&&existsSync(auth))unlinkSync(auth);}catch(error){result.status='failed';result.cleanupError=redact(String(error));}
  result.temporaryAuthRemoved=!existsSync(auth);try{result.authSourceUnchanged=sha(readFileSync(o.authPath))===sourceAuthHash;}catch{result.authSourceUnchanged=false;}
  if(!result.temporaryAuthRemoved||!result.authSourceUnchanged)result.status='failed';
  result.complete=result.status==='complete';result.proxyAudit=proxy?.exportAudit();result.lastNativeTurn=lastNativeTurn;
  result.sourceHashes={before:beforeHashes,after:Object.fromEntries(Object.keys(beforeHashes).map(file=>[file,sha(readFileSync(new URL(file,import.meta.url)))]))};
  if(JSON.stringify(result.sourceHashes.before)!==JSON.stringify(result.sourceHashes.after)){result.status='failed';result.complete=false;result.error='Host source changed during task execution';}
  result.type='final_audit';result.auditPath=path.join(o.stateRoot,'audit.json');
  writeFileSync(result.auditPath,redact(JSON.stringify(result,null,2)),{mode:0o600});
  safeEmit(result);
 }
 return JSON.parse(redact(JSON.stringify(result)));
}
const usage='node hosts/codex/task-client.mjs --workspace DIR --user-message-file FILE --contract-file FILE --runtime-path EXE --catalog-path FILE --auth-path FILE --state-root NEW_DIR [--run] [--non-interactive]\nWithout --run: local preflight only; no model starts. No desktop setting is changed.';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let abort;
 try{
  const options=parseTaskClientArgs(process.argv.slice(2));
  if(options.help){console.log(usage);}else{
   abort=new AbortController();const stop=()=>abort.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
   const result=await runTaskClient(options,{signal:abort.signal});
   process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
   process.exitCode=['complete','checked'].includes(result.status)?0:['needs_input','blocked'].includes(result.status)?2:1;
  }
 }catch(error){console.error(JSON.stringify({type:'client_error',error:error.message}));process.exitCode=1;}
}
