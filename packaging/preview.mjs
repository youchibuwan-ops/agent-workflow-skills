import {createHash,randomUUID} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,renameSync,symlinkSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,path)=>{const r=relative(resolve(root),resolve(path));return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
export const defaultBase=()=>join(process.env.LOCALAPPDATA??join(homedir(),'AppData/Local'),'AgentWorkflowPreview');
export function safeMember(path){
 if(typeof path!=='string'||!path||path.includes('\\')||isAbsolute(path)||/[:\0]/.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Unsafe distribution path or traversal');
 return path;
}
export function verifyManifest(manifest){
 if(manifest?.format!==1||manifest.scope!=='controlled-host-preview'||!/^[a-zA-Z0-9._-]+$/.test(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>512)throw new Error('Invalid preview manifest');
 const seen=new Set();let total=0;
 for(const file of manifest.files){const p=safeMember(file.path);if(seen.has(p.toLowerCase())||!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>4*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid file integrity entry');seen.add(p.toLowerCase());total+=file.bytes;}
 if(total>16*1024*1024||sha(JSON.stringify(manifest.files))!==manifest.treeSha256)throw new Error('Manifest tree SHA integrity mismatch');
 return manifest;
}
function regularFiles(root,{allowDependencies=false}={}){
 const out=[];
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
  const abs=join(dir,e.name),rel=relative(root,abs).replaceAll('\\','/');
  if(allowDependencies&&['hosts/codex/node_modules','hosts/dsh/node_modules'].includes(rel))continue;
  if(lstatSync(abs).isSymbolicLink())throw new Error('Linked payload file rejected: '+rel);
  if(e.isDirectory())walk(abs);else if(e.isFile())out.push(rel);
 }}walk(root);return out;
}
export function verifyDistribution(root,{allowDependencies=false}={}){
 root=realpathSync(root);const manifest=verifyManifest(JSON.parse(readFileSync(join(root,'manifest.json'),'utf8')));
 for(const file of manifest.files){const path=resolve(root,safeMember(file.path));if(!inside(root,path)||!existsSync(path))throw new Error('Missing distribution resource: '+file.path);if(lstatSync(path).isSymbolicLink()||!inside(root,realpathSync(path)))throw new Error('Escaped payload resource');const bytes=readFileSync(path);if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw new Error('SHA256 integrity mismatch: '+file.path);}
 const listed=new Set([...manifest.files.map(f=>f.path),'manifest.json']);
 for(const p of regularFiles(root,{allowDependencies}))if(!listed.has(p))throw new Error('Unlisted distribution file: '+p);
 return {...manifest,paths:manifest.files.map(f=>f.path),files:manifest.files.length,manifest};
}
function copyFiles(source,target,files){for(const file of files){const destination=join(target,safeMember(file.path));mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,readFileSync(join(source,file.path)),{flag:'wx'});}}
export function prepareInstallation(source,{baseDir=defaultBase()}={}){
 source=realpathSync(source);const verified=verifyDistribution(source,{allowDependencies:true});
 const base=resolve(baseDir),versionRoot=join(base,'releases',verified.version+'-'+verified.treeSha256.slice(0,12)),payload=join(versionRoot,'payload');
 if(inside(source,base)||inside(base,source))throw new Error('Installation must be separate from the extracted distribution');
 if(existsSync(payload)){const current=verifyDistribution(payload,{allowDependencies:true});if(current.treeSha256!==verified.treeSha256)throw new Error('Existing installed tree differs from this distribution');return {status:'prepared',base,versionRoot,payload,treeSha256:verified.treeSha256};}
 mkdirSync(payload,{recursive:true});copyFiles(source,payload,[...verified.manifest.files,{path:'manifest.json'}]);verifyDistribution(payload);
 writeFileSync(join(versionRoot,'installation.json'),JSON.stringify({format:1,status:'prepared',version:verified.version,treeSha256:verified.treeSha256},null,2));
 return {status:'prepared',base,versionRoot,payload,treeSha256:verified.treeSha256};
}
export function installSkills(source,{codexHome=process.env.CODEX_HOME??join(homedir(),'.codex'),dshHome=process.env.DSH_HOME??join(homedir(),'.dsh')}={}){
 const verified=verifyDistribution(source,{allowDependencies:true}),result=[];
 for(const [home,name] of [[codexHome,'proactive-skill-discovery'],[dshHome,'proactive-skill-discovery-dsh']]){
  const prefix='skills/'+name+'/',files=verified.manifest.files.filter(f=>f.path.startsWith(prefix)),target=resolve(home,'skills',name);let backup;
  if(existsSync(target)){
   const same=files.every(f=>{const p=join(target,f.path.slice(prefix.length));return existsSync(p)&&!lstatSync(p).isSymbolicLink()&&sha(readFileSync(p))===f.sha256;})&&regularFiles(target).length===files.length;
   if(same){result.push({name,target,mode:'reuse',enforcement:'instruction_only'});continue;}
   if(lstatSync(target).isSymbolicLink())throw new Error('Existing linked personal Skill requires manual review');
   backup=resolve(home,'skill-backups',name+'-'+Date.now()+'-'+randomUUID().slice(0,8));mkdirSync(dirname(backup),{recursive:true});renameSync(target,backup);
  }
  mkdirSync(target,{recursive:true});copyFiles(join(source,'skills',name),target,files.map(f=>({...f,path:f.path.slice(prefix.length)})));
  for(const file of files)if(sha(readFileSync(join(target,file.path.slice(prefix.length))))!==file.sha256)throw new Error('Installed Skill read-back SHA mismatch');
  // Copy from a narrowed source root; each reference and license is retained.
  result.push({name,target,backup,mode:'install',enforcement:'instruction_only'});
 }
 return result;
}
export function runNode(node,args,options={}){const result=spawnSync(node,args,{stdio:'inherit',windowsHide:true,...options});if(result.error||result.status!==0)throw new Error('Required installation step failed: '+(result.error?.message??result.status));}
export function installDependencies(installation,{components=['codex','dsh'],node=process.execPath,runtimeOverrides={}}={}){
 const version=spawnSync(node,['-p','process.versions.node'],{encoding:'utf8',windowsHide:true});const [major,minor]=version.stdout?.trim().split('.').map(Number)??[];
 if(version.status!==0||major<24||(major===24&&minor<9))throw new Error('A callable Node >=24.9 is required');
 const npm=[join(dirname(node),'node_modules/npm/bin/npm-cli.js'),join(dirname(node),'../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);if(!npm)throw new Error('The selected Node installation does not supply npm');
 const runtimes={};
 for(const component of components){
  if(!['codex','dsh'].includes(component))throw new Error('Unknown host component');
  const host=join(installation.payload,'hosts',component),lock=readFileSync(join(host,'package-lock.json'));
  const runtime=resolve(runtimeOverrides[component]??join(installation.base,'dependencies',component+'-'+sha(lock).slice(0,16)));runtimes[component]=runtime;
  if(!runtimeOverrides[component]){
   mkdirSync(runtime,{recursive:true});
   for(const name of ['package.json','package-lock.json']){
    const target=join(runtime,name),expected=readFileSync(join(host,name));
    if(existsSync(target)){if(!readFileSync(target).equals(expected))throw new Error('Shared dependency manifest changed');}else writeFileSync(target,expected,{flag:'wx'});
   }
   if(!existsSync(join(runtime,'node_modules'))){
    const cache=join(installation.base,'download-cache');
    runNode(node,[npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--cache',cache],{cwd:runtime});
    runNode(node,[npm,'cache','clean','--force','--cache',cache],{cwd:runtime});
   }
  }
  const probe=component==='codex'?"import{createRequire}from'node:module';const r=createRequire(process.argv[1]);if(r('ws/package.json').version!=='8.22.0')throw Error('ws version');const{WebSocketServer}=r('ws');const s=new WebSocketServer({noServer:true});s.close();":
   "import{createRequire}from'node:module';import{spawnSync}from'node:child_process';import{join,dirname}from'node:path';const r=createRequire(process.argv[1]);if(r('@deepseek-ai/dsh/package.json').version!=='0.2.1-rc.2')throw Error('DSH version');r.resolve('@deepseek-ai/dsh/profile-boot');const p=r('pnpm');if(p.version!=='11.25.0')throw Error('pnpm version');const q=spawnSync(process.execPath,[join(dirname(r.resolve('pnpm')),p.bin.pnpm),'--version'],{encoding:'utf8',windowsHide:true});if(q.status!==0||q.stdout.trim()!=='11.25.0')throw Error('pnpm is not callable');";
  runNode(node,['--input-type=module','-e',probe,join(runtime,'package.json')]);
  const dependencyLink=join(host,'node_modules');
  if(existsSync(dependencyLink)){if(realpathSync(dependencyLink)!==realpathSync(join(runtime,'node_modules')))throw new Error('Unexpected host dependency directory');}
  else symlinkSync(join(runtime,'node_modules'),dependencyLink,process.platform==='win32'?'junction':'dir');
 }
 if(components.includes('dsh'))runNode(node,[join(installation.payload,'hosts/dsh/install.mjs'),'--home',join(installation.versionRoot,'dsh-home'),'--profile','proactive-workflow','--runtime-root',runtimes.dsh]);
 verifyDistribution(installation.payload,{allowDependencies:true});
 const ready={format:1,scope:'controlled-host-preview',enforcement:'per-run-startup-probes-required',treeSha256:installation.treeSha256,node:resolve(node),payload:installation.payload,versionRoot:installation.versionRoot,base:installation.base,components,runtimes};
 writeFileSync(join(installation.versionRoot,'ready.json'),JSON.stringify(ready,null,2));writeFileSync(join(installation.base,'latest.json'),JSON.stringify(ready,null,2));return ready;
}
export function exportSupportReport(stateRoot,output){
 stateRoot=realpathSync(stateRoot);let data={};const audit=join(stateRoot,'audit.json');if(existsSync(audit))data=JSON.parse(readFileSync(audit,'utf8'));
 const events=Array.isArray(data.events)?data.events:[];
 const report={format:1,kind:'redacted-workflow-support',createdAt:new Date().toISOString(),summary:{status:['complete','blocked','waiting','ready','checked'].includes(data.status)?data.status:'unknown',complete:data.complete===true,stage:['scope','discovery','selection','draft','feedback','delivery','learning','complete'].includes(data.stage)?data.stage:'unknown',modelStarted:data.modelStarted===true,requestCount:Number.isSafeInteger(data.requestCount)?data.requestCount:undefined,nativeDenials:Number.isSafeInteger(data.startup?.nativeDenials)?data.startup.nativeDenials:undefined,toolCallCount:events.filter(e=>e.type==='tool/call').length},excluded:['credentials','human request','tool arguments/results','source bodies','raw RPC','private absolute paths']};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
