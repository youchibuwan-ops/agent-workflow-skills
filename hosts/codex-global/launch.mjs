import {readFileSync,lstatSync,existsSync,realpathSync,mkdirSync,openSync,readSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {userInfo} from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
export const DEFAULT_OWNER_CONFIG_PATH=path.join(userInfo().homedir,'.agent-workflow/global/owner-config.codex.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,p)=>{const r=path.relative(root,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
const regular=(p,label)=>{if(typeof p!=='string'||!path.isAbsolute(p)||!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||lstatSync(p).nlink>1)throw Error(`${label}: private absolute regular file required`);return realpathSync.native(p);};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function parseLaunchArgs(argv){if(argv.length>1||argv[0]&&!['prepare','start'].includes(argv[0]))throw Error('Only prepare or start is allowed; configuration and native capabilities are owner-fixed');return{command:argv[0]??'prepare'};}
function pinBootstrap(config){
 const policy=config.integrity,verifier=regular(config.integrityVerifierModule,'Integrity verifier');if(!hex(config.integrityVerifierSha256)||sha(readFileSync(verifier))!==config.integrityVerifierSha256)throw Error('Integrity verifier SHA256 mismatch');
 if(!policy||!hex(policy.manifestSha256))throw Error('Pinned source integrity policy required');const manifest=regular(policy.manifestPath,'Release manifest'),bytes=readFileSync(manifest);if(sha(bytes)!==policy.manifestSha256)throw Error('Pinned release manifest SHA256 mismatch');
 const data=JSON.parse(bytes);if(data.format!==1||!Array.isArray(data.files))throw Error('Invalid release manifest');const root=realpathSync.native(policy.payloadRoot),entries=new Map();
 for(const e of data.files){if(typeof e.path!=='string'||path.isAbsolute(e.path)||/[\\:\0]/.test(e.path)||e.path.split('/').some(x=>!x||x==='.'||x==='..')||!hex(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<0)throw Error('Invalid bootstrap source member');const p=path.resolve(root,e.path);if(!inside(root,p)||entries.has(p.toLowerCase()))throw Error('Colliding bootstrap source member');entries.set(p.toLowerCase(),e);}
 const visited=new Set();function visit(file){const actual=regular(file,'Bootstrap source');if(!inside(root,actual))throw Error('Verifier bootstrap is outside pinned source payload');if(visited.has(actual))return;visited.add(actual);const e=entries.get(actual.toLowerCase()),source=readFileSync(actual);if(!e||source.length!==e.bytes||sha(source)!==e.sha256)throw Error('Bootstrap source integrity mismatch');
  for(const match of source.toString('utf8').matchAll(/\b(?:import|export)\s+(?:(?:[^;\n]*?)\s+from\s*)?['"]([^'"]+)['"]/g)){const spec=match[1];if(spec.startsWith('node:'))continue;if(!spec.startsWith('.'))throw Error('Third-party bootstrap import forbidden before verification');visit(path.resolve(path.dirname(actual),spec));}
 }visit(verifier);return verifier;
}
function fixedConfig(config){
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Owner configuration required');
 const gateway=config.gateway,desktop=config.privateDesktop,conversation=config.conversation;
 if(!gateway||!desktop||!conversation)throw Error('Complete gateway, conversation and privateDesktop configuration required');
 const keys=new Set(['backendCommand','strictCatalog','stateRoot','dependencyRoot','legacyCodexHome','authPath','port','tokenPath']);if(Object.keys(gateway).some(k=>!keys.has(k)))throw Error('Unsupported owner gateway override');
 if(!Array.isArray(gateway.backendCommand)||!gateway.backendCommand.length||gateway.backendCommand.some(x=>typeof x!=='string')||!path.isAbsolute(gateway.backendCommand[0]))throw Error('Explicit absolute owner native runtime required');
 for(const value of [gateway.stateRoot,gateway.dependencyRoot,conversation.stateRoot,desktop.root,desktop.executable,...[gateway.legacyCodexHome,gateway.authPath].filter(Boolean)])if(typeof value!=='string'||!path.isAbsolute(value))throw Error('Absolute owner paths required');
 if(!Number.isInteger(gateway.port)||gateway.port<1||gateway.port>65535||!/^\/workflow\/[A-Za-z0-9_-]{32,}$/.test(gateway.tokenPath))throw Error('Fixed opaque gateway URL required');
 if(!Array.isArray(conversation.installedRoots)||!Array.isArray(conversation.privateRoots??[]))throw Error('Owner conversation capability roots required');
 if(!hex(desktop.expectedExeSha256)||!hex(desktop.expectedAsarHeaderSha256)||!hex(desktop.expectedTreeManifestSha256)||typeof desktop.treeManifestPath!=='string'||!path.isAbsolute(desktop.treeManifestPath))throw Error('Pinned private desktop hashes and complete tree manifest required');
 return `ws://127.0.0.1:${gateway.port}${gateway.tokenPath}`;
}
function verifyDesktop(config,url){
 const root=realpathSync.native(config.root),exe=regular(config.executable,'Private desktop executable');if(!inside(root,exe)||sha(readFileSync(exe))!==config.expectedExeSha256)throw Error('Private desktop executable integrity mismatch');
 const asar=regular(path.join(root,'resources','app.asar'),'Private desktop ASAR'),fd=openSync(asar,'r');
 try{const prefix=Buffer.alloc(16);if(readSync(fd,prefix,0,16,0)!==16)throw Error('Invalid private ASAR');const size=prefix.readUInt32LE(12);if(size<2||size>16*1024*1024)throw Error('Private ASAR header size rejected');const bytes=Buffer.alloc(size);if(readSync(fd,bytes,0,size,16)!==size||sha(bytes)!==config.expectedAsarHeaderSha256)throw Error('Private ASAR header integrity mismatch');const header=JSON.parse(bytes),entry=header.files?.['.vite']?.files?.build?.files?.['main-BPBEjAxi.js'];
  if(!entry||entry.unpacked||entry.link||!Number.isSafeInteger(entry.size)||entry.size<1||entry.size>16*1024*1024||!/^\d+$/.test(entry.offset??''))throw Error('Pinned private main entry required');const main=Buffer.alloc(entry.size);if(readSync(fd,main,0,main.length,8+prefix.readUInt32LE(4)+Number(entry.offset))!==main.length||sha(main)!==entry.integrity?.hash)throw Error('Private main integrity mismatch');
  const anchor=`return new l.E({hostConfig:e.hostConfig,websocketUrl:${JSON.stringify(url)}});`;if(main.toString('utf8').split(anchor).length!==2)throw Error('Private desktop patch and fixed gateway URL differ');return{executable:exe,asarHeaderSha256:sha(bytes),mainSha256:sha(main)};
 }finally{closeSync(fd);}
}
async function verifyDesktopTree(config,verification){
 const file=regular(config.treeManifestPath,'Private desktop tree manifest'),bytes=readFileSync(file);if(bytes.length>128*1024*1024||sha(bytes)!==config.expectedTreeManifestSha256)throw Error('Private desktop tree manifest SHA256 mismatch');const pinned=JSON.parse(bytes),root=realpathSync.native(config.root);
 if(pinned.format!==1||pinned.root!==root||!Array.isArray(pinned.roots)||!Array.isArray(pinned.entries)||!pinned.entries.length)throw Error('Incomplete private desktop tree manifest');
 const url=new URL('../security/dependency-seal.mjs',import.meta.url);if(verification.source&&!inside(realpathSync.native(verification.source.payloadRoot),realpathSync.native(url)))throw Error('Desktop measurement module outside verified source');
 const {measureDependencyTree}=await import(url.href),trustedLinkRoots=pinned.roots.filter(x=>x.id!=='installation').map(({id,path})=>({id,path}));
 const current=measureDependencyTree({root,trustedLinkRoots,maxBytes:4*1024*1024*1024});
 const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 if(canonical(current)!==canonical(pinned))throw Error('Private desktop runtime tree integrity mismatch');return{manifestSha256:sha(bytes),treeSha256:current.treeSha256,entryCount:current.entryCount,totalBytes:current.totalBytes};
}
export async function prepareLaunch(options={}){
 const ownerConfigPath=regular(options.ownerConfigPath??DEFAULT_OWNER_CONFIG_PATH,'Owner configuration'),config=JSON.parse(readFileSync(ownerConfigPath,'utf8')),gatewayUrl=fixedConfig(config),module=pinBootstrap(config);
 const verifier=options.verifyInstallation??(await import(pathToFileURL(module).href)).verifyInstallation;if(typeof verifier!=='function')throw Error('Owner installation verifier export missing');
 const verification=await verifier({config,profile:'codex-global'});if(verification?.ok!==true)throw Error('Installation verification did not succeed');
 const desktop=verifyDesktop(config.privateDesktop,gatewayUrl),desktopTree=await verifyDesktopTree(config.privateDesktop,verification);return{status:'prepared',ownerConfigPath,config,gatewayUrl,verification,desktop,desktopTree};
}
function desktopEnvironment(config){
 const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','PROGRAMFILES','PROGRAMFILES(X86)']);const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));
 const state=config.gateway.stateRoot,home=path.join(state,'desktop-home'),profile=path.join(state,'desktop-profile'),temp=path.join(state,'desktop-temp');for(const dir of [home,profile,temp,path.join(home,'AppData/Roaming'),path.join(home,'AppData/Local')])mkdirSync(dir,{recursive:true});
 return {...env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local'),CODEX_HOME:home,CODEX_ELECTRON_USER_DATA_PATH:profile,CODEX_CHROME_USER_DATA_DIR:profile,CODEX_ELECTRON_START_IN_BACKGROUND:'1',CODEX_APP_RUNTIME_CLI_PATH:config.gateway.backendCommand[0],CODEX_APP_SERVER_WS_URL:`ws://127.0.0.1:${config.gateway.port}${config.gateway.tokenPath}`,TEMP:temp,TMP:temp,TMPDIR:temp};
}
export async function startLaunch(options={}){
 const prepared=await prepareLaunch(options),config=prepared.config;
 const payload=realpathSync.native(config.integrity.payloadRoot);for(const [callback,url]of [[options.loadGateway,new URL('./gateway.mjs',import.meta.url)],[options.loadConversation,new URL('../conversation/controller-factory.mjs',import.meta.url)]])if(!callback&&!inside(payload,realpathSync.native(new URL(url))))throw Error('Runtime module is outside the verified source payload');
 const gatewayModule=await(options.loadGateway?.()??import('./gateway.mjs')),conversationModule=await(options.loadConversation?.()??import('../conversation/controller-factory.mjs'));
 const privateRoots=[...new Set([...(config.conversation.privateRoots??[]),config.gateway.stateRoot,config.gateway.dependencyRoot,config.gateway.legacyCodexHome,config.gateway.authPath,config.privateDesktop.root,path.dirname(prepared.ownerConfigPath),config.integrity.payloadRoot,path.dirname(process.execPath),path.dirname(config.gateway.backendCommand[0])].filter(Boolean))];
 const factory=conversationModule.createConversationFactory({...config.conversation,privateRoots});let gateway,desktop,closed=false,resolveDone,rejectDone,fatalReason=null;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});const session={status:'starting',done,async close(reason){if(closed)return done;closed=true;try{if(desktop&&desktop.exitCode==null&&desktop.signalCode==null)desktop.kill();await gateway?.close(reason);if(fatalReason){session.status='failed';rejectDone(Error(fatalReason));}else{session.status='stopped';resolveDone({status:'stopped',reason:reason??null});}}catch(e){session.status='failed';rejectDone(e);throw e;}return done;},exportAudit:()=>gateway?.exportAudit()??null};
 const fail=reason=>{if(closed)return;fatalReason=String(reason);void session.close(fatalReason).catch(()=>{});};
 try{gateway=await gatewayModule.createDesktopGateway({...config.gateway,toolSchemas:conversationModule.toolSchemas,controllerFactory:factory,allowProtectedWorkspaceAncestors:true,onAudit:event=>{if(['fatal','native_fatal'].includes(event.kind))setImmediate(()=>fail(event.reason??'Guarded native gateway failed'));}});if(gateway.url!==prepared.gatewayUrl)throw Error('Actual gateway differs from fixed private desktop URL');
  const spawnOptions={cwd:config.privateDesktop.root,env:desktopEnvironment(config),windowsHide:true,stdio:['ignore','ignore','ignore']};desktop=(options.spawnDesktop??((exe,o)=>spawn(exe,[],o)))(prepared.desktop.executable,spawnOptions);
  if(!desktop||typeof desktop.once!=='function'||typeof desktop.kill!=='function')throw Error('Private desktop lifecycle handle required');
  desktop.once('error',e=>fail('Private desktop failed: '+e.message));desktop.once('close',(code,signal)=>{if(code!==0)fail(`Private desktop exited ${code??signal??'unknown'}`);else void session.close().catch(()=>{});});session.status='running';return session;
 }catch(e){await session.close(e.message);throw e;}
}
async function main(){const {command}=parseLaunchArgs(process.argv.slice(2));if(command==='prepare'){await prepareLaunch();process.stdout.write(JSON.stringify({status:'prepared',profile:'codex-global',desktopStarted:false})+'\n');return;}const running=await startLaunch();const stop=()=>void running.close('Launcher stopped');process.once('SIGINT',stop);process.once('SIGTERM',stop);process.stdout.write(JSON.stringify({status:'running',profile:'codex-global'})+'\n');await running.done;}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
