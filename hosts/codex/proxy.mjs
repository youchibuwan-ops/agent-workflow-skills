import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {validateStrictCatalog,strictConfig,strictArguments} from './strict-config.mjs';
import {allowedClientMethod,sanitizeThread,sanitizeTurn,finalState} from './rpc-policy.mjs';
const MAX=8*1024*1024;
const inside=(root,p)=>{const r=path.relative(root,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
const digest=value=>createHash('sha256').update(value).digest('hex');
export function isolatedBackendEnv(root){
 const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','PROGRAMFILES','PROGRAMFILES(X86)']);
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));
 for(const sub of ['home','state','temp','cache','home/AppData/Roaming','home/AppData/Local'])mkdirSync(path.join(root,sub),{recursive:true});
 return {...env,HOME:path.join(root,'home'),USERPROFILE:path.join(root,'home'),CODEX_HOME:path.join(root,'state'),APPDATA:path.join(root,'home/AppData/Roaming'),LOCALAPPDATA:path.join(root,'home/AppData/Local'),XDG_CONFIG_HOME:path.join(root,'home/.config'),XDG_CACHE_HOME:path.join(root,'cache'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),TMPDIR:path.join(root,'temp'),GIT_CONFIG_GLOBAL:path.join(root,'home/.gitconfig'),GIT_CONFIG_NOSYSTEM:'1',DO_NOT_TRACK:'1',DISABLE_TELEMETRY:'1',NO_COLOR:'1'};
}
function validateSchemas(schemas){
 if(!Array.isArray(schemas)||!schemas.length)throw new Error('Nonempty toolSchemas required');
 const seen=new Set();for(const s of schemas){if(!/^workflow_[a-z0-9_]{1,55}$/.test(s.name)||seen.has(s.name)||typeof s.description!=='string'||s.inputSchema?.type!=='object'||s.deferLoading===true||s.namespace)throw new Error('Unsafe workflow tool schema');seen.add(s.name);}
 return structuredClone(schemas);
}
export async function createCodexProxy(options={}){
 const {controllerFactory,backendCommand,workspace,stateRoot,tokenPath='/workflow/'+randomBytes(32).toString('hex'),port=0,onAudit,onCard}=options;
 if(typeof controllerFactory!=='function')throw new Error('controllerFactory required; refusing unguarded startup');
 const schemas=validateSchemas(options.toolSchemas),catalog=validateStrictCatalog(options.strictCatalog);
 if(!Array.isArray(backendCommand)||!backendCommand.length||backendCommand.some(x=>typeof x!=='string'||!x))throw new Error('backendCommand argv required');
 if(!workspace||!stateRoot)throw new Error('Fixed workspace and separate private stateRoot required');
 const cwd=realpathSync(workspace);mkdirSync(stateRoot,{recursive:true});const privateRoot=realpathSync(stateRoot);
 if(inside(cwd,privateRoot)||inside(privateRoot,cwd))throw new Error('stateRoot and workspace must be disjoint');
 if(!/^\/workflow\/[a-zA-Z0-9_-]{32,}$/.test(tokenPath))throw new Error('Opaque tokenPath of at least 32 characters required');
 const defaultEnv=isolatedBackendEnv(privateRoot),env={...defaultEnv,...options.backendEnv};
 // No desktop bridge, external server, config injection or model-routing environment.
 for(const k of Object.keys(env))if(/^(CODEX_APP_|CODEX_CLI_|CODEX_SERVER_|OPENAI_|AZURE_|RUST_LOG)/i.test(k))delete env[k];
 for(const k of ['HOME','USERPROFILE','CODEX_HOME','APPDATA','LOCALAPPDATA','XDG_CONFIG_HOME','XDG_CACHE_HOME','TEMP','TMP','TMPDIR','GIT_CONFIG_GLOBAL'])env[k]=defaultEnv[k];
 const version=spawnSync(backendCommand[0],[...backendCommand.slice(1),'--version'],{cwd:privateRoot,env,windowsHide:true,encoding:'utf8',timeout:10000});
 if(version.status!==0||version.stdout?.trim()!=='codex-cli 0.164.0-alpha.11.1')throw new Error('Backend must be verified Codex 0.164.0-alpha.11.1 runtime');
 const catalogPath=path.join(privateRoot,'strict-models.json'),configPath=path.join(env.CODEX_HOME,'config.toml');
 for(const dir of [env.CODEX_HOME,env.HOME,env.APPDATA,env.LOCALAPPDATA])if(!inside(privateRoot,realpathSync(dir)))throw new Error('Private runtime directory escaped through symlink');
 for(const file of [catalogPath,configPath])if(existsSync(file)&&(lstatSync(file).isSymbolicLink()||!inside(privateRoot,realpathSync(file))))throw new Error('Private runtime file escaped through symlink');
 const catalogBytes=JSON.stringify(catalog),configBytes=strictConfig(catalogPath);writeFileSync(catalogPath,catalogBytes,{mode:0o600});writeFileSync(configPath,configBytes,{mode:0o600});
 const catalogHash=digest(catalogBytes),configHash=digest(configBytes);
 const integrity=()=>{if(digest(readFileSync(catalogPath))!==catalogHash||digest(readFileSync(configPath))!==configHash)throw new Error('Strict runtime files changed');};
 const audit={runtime:version.stdout.trim(),catalogHash,configHash,events:[],failure:null,closed:false};
 const record=(kind,data={})=>{const event={at:new Date().toISOString(),kind,...data};audit.events.push(event);const collected=onAudit?.(event);if(collected&&typeof collected.then==='function'){Promise.resolve(collected).catch(()=>{});throw new Error('onAudit collector must be synchronous');}};
 let child=null,client=null,used=false,closing=false,closePromise=null,backendBuffer='',clientChain=Promise.resolve(),serverChain=Promise.resolve();
 const requests=new Map(),threads=new Map(),serverIds=new Set(),clientIds=new Set(),callIds=new Set();let upstreamId=1;
 const http=createServer((req,res)=>{res.writeHead(404);res.end();});
 const wss=new WebSocketServer({noServer:true,maxPayload:MAX,perMessageDeflate:false});
 const send=m=>{if(client?.readyState===WebSocket.OPEN)client.send(JSON.stringify(m));};
 const write=m=>{if(!child||child.killed||!child.stdin.writable)throw new Error('Backend unavailable');child.stdin.write(JSON.stringify(m)+'\n');};
 function close(reason){
  if(closePromise)return closePromise;
  closing=true;audit.closed=true;
  closePromise=(async()=>{
   if(reason){audit.failure=String(reason);try{record('fatal',{reason:String(reason)});}catch{}}
   for(const t of threads.values())try{t.controller?.abort(reason??'Host connection closed');}catch{}
   const stopped=child&&child.exitCode===null&&child.signalCode===null?once(child,'close').catch(()=>{}):Promise.resolve();
   client?.terminate();child?.stdin.destroy();child?.kill();wss.close();
   await Promise.all([stopped,new Promise(resolve=>http.close(()=>resolve()))]);
  })();return closePromise;
 }
 const fatal=e=>void close(e?.message??String(e));
 const replyError=(id,message,code=-32001)=>send({id,error:{code,message}});
 const forward=(m,params=m.params)=>{const id=upstreamId++;requests.set(id,{clientId:m.id,method:m.method,params});write({id,method:m.method,params});};
 async function clientMessage(m){
  if(closing)return;
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.method!=='string')throw new Error('Client responses or malformed RPC forbidden');
  if(m.id===undefined){if(m.method!=='initialized')throw new Error('Unknown client notification');write({method:'initialized',params:{}});return;}
  if(!['string','number'].includes(typeof m.id))throw new Error('Invalid client request id');
  if(clientIds.has(m.id))throw new Error('Duplicate client request id');clientIds.add(m.id);
  if(!allowedClientMethod(m.method)){replyError(m.id,`Host denies method: ${m.method}`);record('client_denied',{method:m.method});return;}
  const p=m.params??{};
  if(m.method==='initialize'){forward(m,{clientInfo:p.clientInfo??{name:'workflow-host',version:'1'},capabilities:{experimentalApi:true}});return;}
  if(m.method==='thread/start'){
   integrity();if(p.cwd&&realpathSync(p.cwd)!==cwd){replyError(m.id,'Workspace override denied');return;}
   if(p.model&&!catalog.models.some(x=>x.slug===p.model)){replyError(m.id,'Unknown model denied');return;}
   forward(m,sanitizeThread(p,cwd,schemas));return;
  }
  if(['turn/start','turn/interrupt','thread/read'].includes(m.method)){
   const t=threads.get(p.threadId);if(!t){replyError(m.id,'Foreign or inherited thread denied');return;}
   if(m.method==='thread/read'){forward(m,{threadId:p.threadId,includeTurns:p.includeTurns===true});return;}
   if(m.method==='turn/interrupt'){forward(m,{threadId:p.threadId,turnId:p.turnId});return;}
   integrity();if(t.active){replyError(m.id,'Concurrent turn denied');return;}
   let params;try{params=sanitizeTurn(p,cwd,'');}catch(e){replyError(m.id,e.message);return;}
   const userMessage=params.input.map(x=>x.text).join('\n');
   const card=async value=>{t.cards??=[];t.cards.push(structuredClone(value));record('card',{threadId:p.threadId,card:value});await onCard?.(value);send({method:'workflow/card',params:{threadId:p.threadId,...value}});};
   if(!t.controller){t.controller=await controllerFactory({workspace:cwd,userMessage,taskId:p.threadId,stateRoot:path.join(privateRoot,'workflow',p.threadId.replaceAll(/[^a-zA-Z0-9_-]/g,'_')),onCard:card});
    if(!t.controller||JSON.stringify(t.controller.toolSchemas)!==JSON.stringify(schemas))throw new Error('Controller schema mismatch');
   }else await t.controller.acceptUserMessage(userMessage);
   await t.controller.assertReady();if(t.controller.ready!==true)throw new Error('Controller not ready');
   t.active=true;params=sanitizeTurn(p,cwd,t.controller.instructions);record('turn_allowed',{threadId:p.threadId,stage:t.controller.stage});forward(m,params);return;
  }
  if(m.method==='config/read'){forward(m,{includeLayers:false,cwd});return;}
  if(m.method==='thread/list'){forward(m,{...p,cwd,archived:false});return;}
  forward(m,{});
 }
 async function backendMessage(m){
  if(closing)return;
  if(!m||typeof m!=='object'||Array.isArray(m))throw new Error('Malformed backend RPC');
  if(m.method&&m.id!==undefined){
   const p=m.params??{},t=threads.get(p.threadId);
   if(m.method!=='item/tool/call'||!t?.controller||!t.active||p.namespace||p.turnId!==t.turnId||!schemas.some(x=>x.name===p.tool))throw new Error(`Unknown backend request/tool: ${m.method}/${p.tool??''}`);
   if(serverIds.has(m.id)||!p.callId||!p.arguments||typeof p.arguments!=='object'||Array.isArray(p.arguments))throw new Error('Malformed/replayed tool call');serverIds.add(m.id);if(callIds.has(p.callId))throw new Error('Replayed tool callId');callIds.add(p.callId);
   await t.controller.assertReady();const result=await t.controller.dispatch(p.tool,p.arguments,{callId:p.callId});
   if(!result||typeof result.ok!=='boolean'||result.fatal===true)throw new Error(result?.reason??'Fatal controller result');
   record('dispatch',{threadId:p.threadId,tool:p.tool,callId:p.callId,stage:t.controller.stage,ok:result.ok===true});
   const response={...result,...(t.cards?.length?{hostCards:t.cards.splice(0)}:{})};const text=JSON.stringify(response);if(Buffer.byteLength(text)>65536)throw new Error('Tool result exceeds 64KiB complete-delivery boundary');
   write({id:m.id,result:{contentItems:[{type:'inputText',text}],success:result.ok===true}});return;
  }
  if(m.id!==undefined){const r=requests.get(m.id);if(!r)throw new Error('Unmatched backend response');requests.delete(m.id);
   if(r.method==='thread/start'&&!m.error){const id=m.result?.thread?.id;if(typeof id!=='string'||threads.has(id))throw new Error('Invalid backend thread identity');threads.set(id,{controller:null,active:false});}
   if(r.method==='turn/start'&&!m.error){const t=threads.get(r.params.threadId);if(!t||typeof m.result?.turn?.id!=='string')throw new Error('Invalid backend turn identity');t.turnId=m.result.turn.id;}
   if(r.method==='turn/start'&&m.error){const t=threads.get(r.params.threadId);if(t)t.active=false;}
   send({...m,id:r.clientId});return;
  }
  if(typeof m.method!=='string')throw new Error('Invalid backend notification');
  if(/compact/i.test(m.method)||/compact/i.test(m.params?.item?.type??''))throw new Error('Context compaction is not permitted in a guarded workflow');
  if(m.method==='turn/completed'){
   const t=threads.get(m.params?.threadId);if(!t?.controller)throw new Error('Completion from unowned thread');t.active=false;
   const state=finalState(t.controller);record('turn_finished',{threadId:m.params.threadId,...state});
   send({method:'workflow/state',params:{threadId:m.params.threadId,...state}});
   m={...m,params:{...m.params,workflow:state,turn:{...m.params.turn}}};
   if(state.status==='blocked'){m.params.turn.status='failed';m.params.turn.error={message:`Workflow incomplete at ${state.stage}`,codexErrorInfo:null,additionalDetails:state.blockedReason};}
  }
  send(m);
 }
 http.on('upgrade',(req,socket,head)=>{
  if(used||req.url!==tokenPath||req.headers.origin||!['127.0.0.1','::ffff:127.0.0.1'].includes(socket.remoteAddress)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  used=true;wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  client=ws;try{integrity();child=spawn(backendCommand[0],[...backendCommand.slice(1),...strictArguments(catalogPath),'app-server','--strict-config'],{cwd:privateRoot,env,windowsHide:true,stdio:['pipe','pipe','pipe']});record('backend_started');}catch(e){fatal(e);return;}
  child.on('error',fatal);child.on('exit',(code,signal)=>{if(!closing)fatal(new Error(`Backend exited ${code??signal}`));});child.stdin.on('error',fatal);
  child.stderr.on('data',data=>{if(audit.stderrBytes===undefined)audit.stderrBytes=0;audit.stderrBytes+=data.length;try{const collected=options.onStderr?.(data.toString());if(collected&&typeof collected.then==='function'){Promise.resolve(collected).catch(()=>{});throw new Error('onStderr collector must be synchronous');}}catch(e){fatal(e);}});
  child.stdout.on('data',data=>{backendBuffer+=data.toString();if(Buffer.byteLength(backendBuffer)>MAX){fatal(new Error('Backend message exceeds limit'));return;}
   let end;while((end=backendBuffer.indexOf('\n'))>=0){const line=backendBuffer.slice(0,end);backendBuffer=backendBuffer.slice(end+1);if(!line.trim())continue;serverChain=serverChain.then(()=>backendMessage(JSON.parse(line))).catch(fatal);}
  });
  ws.on('message',(data,binary)=>{if(binary){fatal(new Error('Binary client messages forbidden'));return;}clientChain=clientChain.then(()=>clientMessage(JSON.parse(data.toString()))).catch(fatal);});
  ws.on('error',fatal);ws.on('close',()=>{if(!closing)fatal(new Error('Client disconnected; no fallback'));});
 });
 await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(port,'127.0.0.1',resolve);});
 const address=http.address();return {url:`ws://127.0.0.1:${address.port}${tokenPath}`,tokenPath,port:address.port,close,exportAudit:()=>structuredClone(audit)};
}
