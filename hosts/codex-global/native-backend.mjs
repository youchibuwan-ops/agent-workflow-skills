import {spawn,spawnSync} from 'node:child_process';import {once} from 'node:events';import {StringDecoder} from 'node:string_decoder';import {createHash} from 'node:crypto';
import {mkdirSync,realpathSync as fsRealpathSync,readFileSync,writeFileSync,existsSync,lstatSync,unlinkSync,copyFileSync} from 'node:fs';import path from 'node:path';
import {isolatedBackendEnv} from './runtime-env.mjs';import {validateStrictCatalog,strictConfig,strictArguments} from '../codex/strict-config.mjs';import {inside} from './legacy-store.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const realpathSync=fsRealpathSync.native;
export async function createStrictBackend(options){
 const {backendCommand,stateRoot,onRequest,onNotification,onFatal,onAudit,authPath}=options;
 const catalog=validateStrictCatalog(structuredClone(options.strictCatalog));
 if(!Array.isArray(backendCommand)||!backendCommand.length||backendCommand.some(x=>typeof x!=='string'||!x))throw Error('Explicit native runtime command required');
 mkdirSync(stateRoot,{recursive:true});const root=realpathSync(stateRoot),env=isolatedBackendEnv(root),catalogPath=path.join(root,'strict-models.json'),configPath=path.join(env.CODEX_HOME,'config.toml'),privateAuth=path.join(env.CODEX_HOME,'auth.json');
 const audit=[];const record=(kind,data={})=>{const event={at:new Date().toISOString(),kind,...data};audit.push(event);const p=onAudit?.(event);if(p&&typeof p.then==='function'){p.catch(()=>{});throw Error('Audit collector must be synchronous');}};
 let authOwned=false,child,closing=false,closePromise,buffer='',next=1,chain=Promise.resolve();const decoder=new StringDecoder('utf8'),requests=new Map();
 const cleanup=()=>{if(authOwned&&existsSync(privateAuth))unlinkSync(privateAuth);authOwned=false;};
 const write=m=>{if(closing||!child?.stdin.writable)throw Error('Private native backend unavailable');child.stdin.write(JSON.stringify(m)+'\n');};
 async function close(reason){if(closePromise)return closePromise;closing=true;closePromise=(async()=>{
  for(const w of requests.values()){clearTimeout(w.timer);w.reject(Error(reason||'Private native backend closed'));}requests.clear();
  if(child&&child.exitCode===null&&child.signalCode===null){const wait=once(child,'close').catch(()=>{});child.stdin.destroy();child.kill();await wait;}cleanup();
 })();return closePromise;}
 const fatal=error=>{if(closing)return;const e=error instanceof Error?error:Error(String(error));try{record('fatal',{reason:e.message});}catch{}void close(e.message).then(()=>{try{onFatal?.(e);}catch{}});};
 function rpc(method,params={}){
  if(closing)return Promise.reject(Error('Backend closed'));
  return new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{requests.delete(id);reject(Error(`Native RPC timeout: ${method}`));fatal(Error('Native RPC timeout'));},options.rpcTimeoutMs??30000);
   requests.set(id,{resolve,reject,timer,method});try{record('rpc',{method});write({id,method,params});}catch(e){clearTimeout(timer);requests.delete(id);reject(e);fatal(e);}
  });
 }
 try{
  for(const file of [catalogPath,configPath,privateAuth])if(existsSync(file)&&(lstatSync(file).isSymbolicLink()||!inside(root,realpathSync(file))))throw Error('Private runtime file symlink escape');
  for(const dir of [env.CODEX_HOME,env.HOME,env.APPDATA,env.LOCALAPPDATA])if(!inside(root,realpathSync(dir)))throw Error('Private runtime directory symlink escape');
  const version=spawnSync(backendCommand[0],[...backendCommand.slice(1),'--version'],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:10000});
  if(version.status!==0||version.stdout.trim()!=='codex-cli 0.164.0-alpha.11.1')throw Error('Exact verified 0.164.0-alpha.11.1 runtime required');
  if(existsSync(privateAuth))throw Error('Refusing unmanaged existing private auth; explicit clean startup required');
  if(authPath){const original=realpathSync(authPath);if(inside(root,original))throw Error('Auth source must be outside private runtime');copyFileSync(original,privateAuth);authOwned=true;}
  const catalogBytes=JSON.stringify(catalog),configBytes=strictConfig(catalogPath);writeFileSync(catalogPath,catalogBytes,{mode:0o600});writeFileSync(configPath,configBytes,{mode:0o600});const catalogHash=digest(catalogBytes),configHash=digest(configBytes);
  const assertIntegrity=()=>{if(digest(readFileSync(catalogPath))!==catalogHash||digest(readFileSync(configPath))!==configHash)throw Error('Strict native configuration changed');};
  child=spawn(backendCommand[0],[...backendCommand.slice(1),...strictArguments(catalogPath),'app-server','--strict-config'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.on('error',fatal);child.on('exit',(code,signal)=>{if(!closing)fatal(Error(`Native backend exited ${code??signal}`));});child.stdin.on('error',fatal);
  child.stderr.on('data',bytes=>{try{const p=options.onStderr?.(bytes);if(p&&typeof p.then==='function'){p.catch(()=>{});throw Error('stderr collector must be synchronous');}}catch(e){fatal(e);}});
  async function handle(m){
   if(closing)return;
   if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Malformed native message');
   if(m.id!==undefined&&typeof m.method==='string'){
    if(typeof onRequest!=='function')throw Error('Unknown native tool call without host controller');assertIntegrity();const result=await onRequest(m);
    if(result===undefined)throw Error('Unhandled native request');write({id:m.id,result});return;
   }
   if(m.id!==undefined){const w=requests.get(m.id);if(!w)throw Error('Unmatched native response');requests.delete(m.id);clearTimeout(w.timer);if(m.error){const e=Error(m.error.message||'Native RPC error');e.rpcError=m.error;w.reject(e);}else w.resolve(m.result);return;}
   if(typeof m.method!=='string')throw Error('Malformed native notification');await onNotification?.(m);
  }
  child.stdout.on('data',bytes=>{buffer+=decoder.write(bytes);if(Buffer.byteLength(buffer)>8*1024*1024){fatal(Error('Native response exceeded complete-message budget'));return;}let end;
   while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;let m;try{m=JSON.parse(line);}catch(e){fatal(e);return;}
    // Responses resolve independently: a notification handler may await a native RPC.
    if(m.id!==undefined&&!m.method)void handle(m).catch(fatal);else chain=chain.then(()=>handle(m)).catch(fatal);
   }
  });
  const initializeResult=await rpc('initialize',{clientInfo:{name:'controlled-desktop-gateway',version:'1'},capabilities:{experimentalApi:true}});write({method:'initialized',params:{}});
  record('ready',{runtime:version.stdout.trim(),catalogHash,configHash});
  return {rpc:(method,params)=>method==='initialize'?Promise.resolve(structuredClone(initializeResult)):rpc(method,params),initializeResult,env,root,assertIntegrity,close,exportAudit:()=>structuredClone(audit)};
 }catch(e){await close(e.message);throw e;}
}
