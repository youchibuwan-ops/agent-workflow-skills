import {mkdtempSync,lstatSync,realpathSync,openSync,fstatSync,readFileSync,writeFileSync,closeSync,rmSync,constants} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isolatedBackendEnv} from './runtime-env.mjs';
import {strictConfig,restrictCatalog} from '../codex/strict-config.mjs';

const MAX_BYTES=8*1024*1024;
function plain(p,directory=false,maxBytes=MAX_BYTES){
 if(typeof p!=='string'||!path.isAbsolute(p))throw Error('Absolute catalog refresh path required');
 for(let q=p;;){if(lstatSync(q).isSymbolicLink())throw Error('Catalog refresh path redirected');const parent=path.dirname(q);if(parent===q)break;q=parent;}
 const st=lstatSync(p);if(directory?!st.isDirectory():!st.isFile()||st.nlink!==1||st.size>maxBytes)throw Error('Catalog refresh requires bounded plain files');
 return {path:realpathSync.native(p),dev:st.dev,ino:st.ino,size:st.size,mtimeMs:st.mtimeMs};
}
const fingerprint=b=>createHash('sha256').update(b).digest('hex');
export function verifyFreshCatalog(cache,listing,startedAt,now=Date.now()){
 const fetched=Date.parse(cache?.fetched_at);
 if(!Number.isFinite(fetched)||fetched<startedAt-2000||fetched>now+2000)throw Error('Native model catalog is stale');
 if(!Array.isArray(cache.models)||!cache.models.length||cache.models.length>1000||!Array.isArray(listing?.data)||!listing.data.length||listing.nextCursor)throw Error('Incomplete native model catalog');
 const slugs=cache.models.map(m=>m.slug),ids=listing.data.map(m=>m.model);
 if(slugs.some(x=>typeof x!=='string'||!x)||new Set(slugs).size!==slugs.length||new Set(ids).size!==ids.length||ids.length!==slugs.length||ids.some(id=>!slugs.includes(id)))throw Error('Native model list and cache disagree');
 for(const model of cache.models){const listed=listing.data.find(m=>m.model===model.slug);const levels=model.supported_reasoning_levels?.map(x=>x.effort),efforts=listed.supportedReasoningEfforts?.map(x=>x.reasoningEffort);
  if(!Array.isArray(levels)||!Array.isArray(efforts)||JSON.stringify([...levels].sort())!==JSON.stringify([...efforts].sort())||model.default_reasoning_level!==listed.defaultReasoningEffort)throw Error('Native model capabilities disagree');
 }
 return restrictCatalog(cache);
}
/** Only initialize/model-list RPCs. No model execution, turns, or workspace reads. */
export async function refreshNativeCatalog({stateRoot,authPath,backendCommand},{spawnNative=spawn,timeoutMs=20000,now=Date.now}={}){
 if(!Array.isArray(backendCommand)||backendCommand.length!==1||!path.isAbsolute(backendCommand[0]))throw Error('Fixed native catalog executable required');
 plain(backendCommand[0],false,1024*1024*1024);plain(stateRoot,true);const source=plain(authPath),fd=openSync(authPath,constants.O_RDONLY| (constants.O_NOFOLLOW??0));let auth;
 try{const st=fstatSync(fd);if(st.dev!==source.dev||st.ino!==source.ino||st.size!==source.size||st.mtimeMs!==source.mtimeMs||st.nlink!==1)throw Error('Catalog source authentication identity changed');auth=readFileSync(fd);if(auth.length>MAX_BYTES)throw Error('Catalog authentication exceeds bounds');}finally{closeSync(fd);}
 const originalHash=fingerprint(auth),root=mkdtempSync(path.join(stateRoot,'catalog-refresh-'));plain(root,true);
 let child,timer,buffer='',total=0,seq=0,stopped=false;const pending=new Map();
 const cleanup=()=>{plain(root,true);rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});};
 const onExit=()=>{try{child?.kill();}catch{}try{cleanup();}catch{}};process.once('exit',onExit);
 const fail=()=>{for(const p of pending.values())p.reject(Error('Native catalog refresh failed'));pending.clear();};
 const startedAt=now();
 try{
  const env=isolatedBackendEnv(root),target=path.join(env.CODEX_HOME,'auth.json');writeFileSync(target,auth,{flag:'wx',mode:0o600});auth.fill(0);
  writeFileSync(path.join(env.CODEX_HOME,'config.toml'),strictConfig(path.join(root,'unused.json')).replace(/^model_catalog_json[^\n]*\n/,''),{flag:'wx',mode:0o600});
  child=spawnNative(backendCommand[0],['app-server'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  child.stdin.on('error',()=>{stopped=true;fail();});
  child.on('error',()=>{stopped=true;fail();});child.on('close',()=>{stopped=true;fail();});child.stderr.on('data',()=>{});
  child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{try{total+=Buffer.byteLength(s);if(total>MAX_BYTES)throw Error();buffer+=s;let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;const m=JSON.parse(line),p=pending.get(m.id);if(p&&!m.method){pending.delete(m.id);m.error?p.reject(Error('Native catalog RPC refused')):p.resolve(m.result);}}}catch{stopped=true;fail();}});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{if(stopped){reject(Error('Native catalog process closed'));return;}const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n',e=>{if(e){stopped=true;fail();}});});
  const work=(async()=>{await rpc('initialize',{clientInfo:{name:'controlled-model-catalog-refresh',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');const listing=await rpc('model/list',{limit:1000,includeHidden:true});const cachePath=path.join(env.CODEX_HOME,'models_cache.json');plain(cachePath);const cache=JSON.parse(readFileSync(cachePath,'utf8'));const current=plain(authPath);
   if(JSON.stringify(current)!==JSON.stringify(source)||fingerprint(readFileSync(authPath))!==originalHash)throw Error('Catalog source authentication identity changed');return verifyFreshCatalog(cache,listing,startedAt,now());})();
  return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native catalog refresh timeout')),timeoutMs);})]);
 }finally{
  clearTimeout(timer);auth?.fill(0);fail();try{if(child){child.stdin.on('error',()=>{});child.stdin.end();child.kill();await new Promise(resolve=>{if(child.exitCode!=null||child.signalCode!=null){resolve();return;}const stopped=()=>{clearTimeout(wait);resolve();},wait=setTimeout(resolve,500);child.once('close',stopped);});}}
  finally{try{cleanup();}finally{process.removeListener('exit',onExit);}}
 }
}

export async function catalogForLaunch(gateway,dependencies){
 if(gateway.catalogRefresh!==true)return {catalog:gateway.strictCatalog,status:'disabled'};
 try{return {catalog:await refreshNativeCatalog(gateway,dependencies),status:'refreshed'};}
 catch{return {catalog:gateway.strictCatalog,status:'fallback',warning:'Account model catalog refresh failed; using the owner catalog for this launch.'};}
}
