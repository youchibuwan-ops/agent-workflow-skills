// Trusted installer/startup API. This module is never a model-facing tool.
import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {existsSync,lstatSync,statSync,realpathSync,readlinkSync,readdirSync,mkdirSync,readFileSync,writeFileSync,openSync,readSync,fstatSync,closeSync,constants} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join,sep} from 'node:path';
import {spawnSync} from 'node:child_process';

export class DependencySealError extends Error{constructor(code,message){super(message);this.name='DependencySealError';this.code=code;}}
const fail=(code,message)=>{throw new DependencySealError(code,message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,path)=>{const r=relative(resolve(root),resolve(path));return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));};
const intersects=(a,b)=>within(a,b)||within(b,a);
const order=(a,b)=>a<b?-1:a>b?1:0;
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort(order).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function present(path){try{lstatSync(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function futurePath(input){
 if(typeof input!=='string'||!input)fail('INVALID_CONFIGURATION','Explicit filesystem paths are required');
 let path=resolve(input);const tail=[];
 while(!present(path)){tail.unshift(path.slice(dirname(path).length+1));const parent=dirname(path);if(parent===path)fail('INVALID_CONFIGURATION','Cannot resolve path');path=parent;}
 return join(realpathSync(path),...tail);
}
function fileDigest(path){
 const descriptor=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const before=fstatSync(descriptor,{bigint:true});if(!before.isFile())fail('UNSUPPORTED_ENTRY','Expected a regular file');
  const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);let read,total=0;
  while((read=readSync(descriptor,buffer,0,buffer.length,null))>0){hash.update(buffer.subarray(0,read));total+=read;}
  const after=fstatSync(descriptor,{bigint:true});
  if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||BigInt(total)!==after.size)fail('TREE_CHANGED_DURING_READ','File changed while its dependency bytes were measured');
  return {bytes:total,sha256:hash.digest('hex')};
 }finally{closeSync(descriptor);}
}
function rootsFor(root,links=[]){
 const roots=[{id:'installation',path:root}];
 for(let index=0;index<links.length;index++){
  const item=typeof links[index]==='string'?{id:'trusted-'+index,path:links[index]}:links[index];
  if(!item||!/^[a-z0-9_-]+$/i.test(item.id)||roots.some(r=>r.id===item.id))fail('INVALID_CONFIGURATION','Trusted link roots require unique explicit IDs');
  const path=realpathSync(item.path);if(!statSync(path).isDirectory())fail('INVALID_CONFIGURATION','Trusted link root must be a directory');roots.push({id:item.id,path});
 }return roots;
}
function relativeName(value){if(value==='.')return value;if(!value||value.includes('\\')||isAbsolute(value)||value.split('/').some(p=>p==='..'||p==='.'||!p))fail('UNSUPPORTED_ENTRY','Unsafe dependency-relative name');return value;}

export function measureDependencyTree({root,trustedLinkRoots=[],forbiddenRoots=[],maxEntries=250000,maxBytes=2*1024*1024*1024}={}){
 root=realpathSync(root);if(!statSync(root).isDirectory())fail('UNSUPPORTED_ENTRY','Dependency tree root must be a directory');
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)fail('INVALID_CONFIGURATION','Positive measurement limits required');
 const roots=rootsFor(root,trustedLinkRoots),forbidden=forbiddenRoots.map(futurePath),entries=[],coveredDirs=new Map();let totalBytes=0;
 const locate=path=>{if(forbidden.some(p=>within(p,path)))fail('LINK_OUTSIDE_TRUST','Dependency points into a protected seal/actor location');const match=roots.filter(r=>within(r.path,path)).sort((a,b)=>b.path.length-a.path.length)[0];if(!match)fail('LINK_OUTSIDE_TRUST','Dependency link escapes explicitly trusted roots');return {root:match.id,path:relative(match.path,path).replaceAll('\\','/')||'.'};};
 const append=entry=>{relativeName(entry.path);if(entries.length>=maxEntries)fail('MEASUREMENT_LIMIT','Dependency entry-count limit exceeded');entries.push(entry);};
 function file(path,name,fields={}){const result=fileDigest(path);totalBytes+=result.bytes;if(totalBytes>maxBytes)fail('MEASUREMENT_LIMIT','Dependency byte limit exceeded');append({path:name,type:'file',...fields,...result});}
 function walk(path,name){
  const st=lstatSync(path);
  if(st.isSymbolicLink()){
   let actual;try{actual=realpathSync(path);}catch{fail('DANGLING_LINK','Dependency link target is missing');}
   const target=locate(actual),targetStat=statSync(actual),link={path:name,type:'link',linkText:readlinkSync(path),target,targetType:targetStat.isDirectory()?'directory':targetStat.isFile()?'file':'unsupported'};
   if(targetStat.isFile()){
    const value=fileDigest(actual);totalBytes+=value.bytes;if(totalBytes>maxBytes)fail('MEASUREMENT_LIMIT','Dependency byte limit exceeded');append({...link,...value});return;
   }
   if(!targetStat.isDirectory())fail('UNSUPPORTED_ENTRY','Link does not resolve to a regular file or directory');
   if(coveredDirs.has(actual)){append({...link,coveredBy:coveredDirs.get(actual)});return;}
   append(link);coveredDirs.set(actual,name);
   for(const entry of readdirSync(actual,{withFileTypes:true}).sort((a,b)=>order(a.name,b.name)))walk(join(actual,entry.name),name==='.'?entry.name:name+'/'+entry.name);
   return;
  }
  const actual=realpathSync(path);locate(actual);
  if(st.isDirectory()){
   append({path:name,type:'directory'});if(coveredDirs.has(actual))return;coveredDirs.set(actual,name);
   for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>order(a.name,b.name)))walk(join(path,entry.name),name==='.'?entry.name:name+'/'+entry.name);
  }else if(st.isFile())file(path,name);else fail('UNSUPPORTED_ENTRY','Special filesystem nodes cannot enter a dependency seal');
 }
 walk(root,'.');entries.sort((a,b)=>order(a.path,b.path));
 return {format:1,status:'measurement-only',attested:false,root,roots,entries,entryCount:entries.length,totalBytes,treeSha256:sha(canonical({entries}))};
}

export function createDependencySealAuthority({sealRoot,key,payloadRoots,actorWritableRoots,trustedLinkRoots=[],maxEntries,maxBytes}={}){
 if(!Buffer.isBuffer(key)||key.length<32||!Array.isArray(payloadRoots)||!Array.isArray(actorWritableRoots)||!Array.isArray(trustedLinkRoots))fail('INVALID_CONFIGURATION','A private host key and explicit payload/actor/link root policies are required');
 const privateKey=Buffer.from(key),sealCanonical=futurePath(sealRoot),sealLexical=resolve(sealRoot);
 const actorPaths=extra=>[...actorWritableRoots,...(extra??[])].flatMap(p=>[resolve(p),futurePath(p)]);
 const payloadPaths=()=>payloadRoots.flatMap(p=>[resolve(p),futurePath(p)]);
 function storage(extra=[],installation){
  if(present(sealLexical)&&(lstatSync(sealLexical).isSymbolicLink()||realpathSync(sealLexical)!==sealCanonical))fail('UNSAFE_SEAL_STORAGE','Seal directory identity changed');
  if([...actorPaths(extra),...payloadPaths(),...(installation?[installation]:[])].some(p=>intersects(p,sealLexical)||intersects(p,sealCanonical)))fail('UNSAFE_SEAL_STORAGE','Seal and host key material must stay outside payload, dependency and actor-write roots');
 }
 storage();mkdirSync(sealCanonical,{recursive:true,mode:0o700});
 const signature=(kind,value)=>createHmac('sha256',privateKey).update(kind+'\0'+canonical(value)).digest('hex');
 const valid=(kind,value,tag)=>typeof tag==='string'&&/^[a-f0-9]{64}$/.test(tag)&&timingSafeEqual(Buffer.from(signature(kind,value),'hex'),Buffer.from(tag,'hex'));
 const anchor=()=>signature('host-key-identity',{scope:'dependency-installation-v1'}).slice(0,16);
 function assertOutsideActor(path,extra=[]){if(actorPaths(extra).some(p=>intersects(p,resolve(path))||intersects(p,futurePath(path))))fail('ACTOR_WRITABLE_INSTALLATION','Installation inputs, tools and dependencies must stay disjoint from actor writes');}
 function trustedFile(item){
  if(!item||typeof item.path!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256))fail('INSTALL_SOURCE_MISMATCH','Trusted source file and expected release digest are required');
  assertOutsideActor(item.path);const actual=realpathSync(item.path);if(lstatSync(item.path).isSymbolicLink()||fileDigest(actual).sha256!==item.sha256)fail('INSTALL_SOURCE_MISMATCH','Trusted installer or locked source differs from its authority-provided identity');return {path:actual,sha256:item.sha256};
 }
 function trustedToolTree(installer,npm){
  if(typeof installer?.toolRoot!=='string'||!/^[a-f0-9]{64}$/.test(installer.expectedTreeSha256))fail('INSTALL_SOURCE_MISMATCH','Independently trusted complete installer tool root and expected tree digest are required');
  assertOutsideActor(installer.toolRoot);const root=realpathSync(installer.toolRoot);
  if(lstatSync(installer.toolRoot).isSymbolicLink()||!within(root,npm.path))fail('INSTALL_SOURCE_MISMATCH','Installer entry must belong to its trusted tool tree');
  storage([],root);
  const measured=measureDependencyTree({root,forbiddenRoots:[sealCanonical,...actorPaths()],...(maxEntries?{maxEntries}:{}),...(maxBytes?{maxBytes}:{})});
  if(measured.treeSha256!==installer.expectedTreeSha256)fail('INSTALL_SOURCE_MISMATCH','Complete installer tool tree differs from its independently supplied release identity');
  return {root,expectedTreeSha256:installer.expectedTreeSha256,entryCount:measured.entryCount,totalBytes:measured.totalBytes};
 }
 function measure(root,extra=[]){
  assertOutsideActor(root,extra);storage(extra,root);
  for(const item of trustedLinkRoots){const path=typeof item==='string'?item:item.path;if([...actorPaths(extra),sealCanonical].some(p=>intersects(p,futurePath(path))))fail('LINK_OUTSIDE_TRUST','Trusted target root intersects private state or actor writes');}
  return measureDependencyTree({root,trustedLinkRoots,forbiddenRoots:[sealCanonical,...actorPaths(extra)],...(maxEntries?{maxEntries}:{}),...(maxBytes?{maxBytes}:{})});
 }
 async function installAndSeal({installRoot,sourcePackage,sourceLock,installer,timeoutMs=180000,offline=false}={}){
  const root=futurePath(installRoot);storage([],root);assertOutsideActor(root);
  if(present(installRoot))fail('UNTRUSTED_EXISTING_INSTALLATION','Existing directories cannot receive first trust; verify an existing seal or perform a fresh observed installation');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>900000)fail('INVALID_CONFIGURATION','Bounded installer timeout required');
  const pkg=trustedFile(sourcePackage),lock=trustedFile(sourceLock),node=trustedFile({path:installer?.nodePath,sha256:installer?.nodeSha256}),npm=trustedFile({path:installer?.npmCliPath,sha256:installer?.npmCliSha256});
  const tool=trustedToolTree(installer,npm);
  const sealPath=join(sealCanonical,sha(root)+'.json');if(present(sealPath))fail('UNTRUSTED_EXISTING_INSTALLATION','A prior seal already occupies this installation identity');
  mkdirSync(root,{recursive:false});writeFileSync(join(root,'package.json'),readFileSync(pkg.path),{flag:'wx'});writeFileSync(join(root,'package-lock.json'),readFileSync(lock.path),{flag:'wx'});
  const args=[npm.path,'ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund',...(offline?['--offline']:[])];
  const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','HTTPS_PROXY','HTTP_PROXY','NO_PROXY']);
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));Object.assign(env,{npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false',DO_NOT_TRACK:'1',DISABLE_TELEMETRY:'1'});
  const processResult=spawnSync(node.path,args,{cwd:root,env,windowsHide:true,encoding:'buffer',timeout:timeoutMs,maxBuffer:8*1024*1024});
  if(processResult.error||processResult.status!==0)fail('INSTALL_FAILED','Trusted dependency installation did not exit successfully; no seal was issued');
  for(const input of [pkg,lock,node,npm])trustedFile(input);
  const toolAfter=trustedToolTree(installer,npm);if(canonical(toolAfter)!==canonical(tool))fail('INSTALL_SOURCE_MISMATCH','Installer tool identity changed during installation');
  if(fileDigest(join(root,'package.json')).sha256!==pkg.sha256||fileDigest(join(root,'package-lock.json')).sha256!==lock.sha256||!existsSync(join(root,'node_modules')))fail('INSTALL_SOURCE_MISMATCH','Installer changed locked inputs or produced no dependency tree');
  const manifest=measure(root),installRecord={format:1,kind:'observed-locked-installation',runId:randomBytes(24).toString('hex'),installRoot:root,sourcePackage:pkg,sourceLock:lock,installer:{node,npm,tool},command:'npm-ci-ignore-scripts',argv:args.slice(1),exitCode:processResult.status,stdoutSha256:sha(processResult.stdout??Buffer.alloc(0)),stderrSha256:sha(processResult.stderr??Buffer.alloc(0)),completedAt:new Date().toISOString(),treeSha256:manifest.treeSha256};
  const recordSignature=signature('install-record-v1',installRecord),body={format:1,kind:'dependency-installation-seal',hostKeyId:anchor(),installRecord,recordSignature,manifest};
  const document={...body,signature:signature('dependency-seal-v1',body)};writeFileSync(sealPath,JSON.stringify(document),{flag:'wx',mode:0o600});
  return {attestation:'observed-locked-installation',sealPath,installRecord,treeSha256:manifest.treeSha256,entryCount:manifest.entryCount,totalBytes:manifest.totalBytes};
 }
 function protectedDocument(path){
  if(typeof path!=='string'||!present(path)||lstatSync(path).isSymbolicLink()||!lstatSync(path).isFile()||!within(realpathSync.native(sealCanonical),realpathSync.native(path)))fail('UNSAFE_SEAL_STORAGE','Seal must remain in the protected physical store');
  if(statSync(path).size>128*1024*1024)fail('UNTRUSTED_SEAL','Seal exceeds its size bound');const bytes=readFileSync(path);let document;try{document=JSON.parse(bytes);}catch{fail('UNTRUSTED_SEAL','Seal is not valid JSON');}if(!document||typeof document!=='object'||Array.isArray(document))fail('UNTRUSTED_SEAL','Seal object required');return{bytes,document};
 }
 function authenticateObserved(document){
  const {signature:tag,...body}=document;
  if(body.format!==1||body.kind!=='dependency-installation-seal'||body.hostKeyId!==anchor()||!valid('dependency-seal-v1',body,tag)||!valid('install-record-v1',body.installRecord,body.recordSignature))fail('UNTRUSTED_SEAL','Original observed installation signatures are invalid');
  const record=body.installRecord;
  if(record.kind!=='observed-locked-installation'||record.exitCode!==0||record.command!=='npm-ci-ignore-scripts'||!record.argv?.includes('--ignore-scripts')||record.installRoot!==body.manifest?.root||record.treeSha256!==body.manifest?.treeSha256||!record.sourcePackage?.sha256||!record.sourceLock?.sha256||!record.installer?.tool?.expectedTreeSha256)fail('UNTRUSTED_SEAL','Original successful locked-install provenance is incomplete');return{body,record};
 }
 function canonicalMeasure(root,extra=[]){
  const nativeRoot=realpathSync.native(root),nativeStore=realpathSync.native(sealCanonical),actors=actorPaths(extra).map(path=>{
   let at=resolve(path);const tail=[];while(!present(at)){tail.unshift(at.slice(dirname(at).length+1));at=dirname(at);}return join(realpathSync.native(at),...tail);
  });
  if(actors.some(p=>intersects(p,nativeRoot)||intersects(p,nativeStore)))fail('ACTOR_WRITABLE_INSTALLATION','Canonical dependencies and seal store must remain outside actual actor writes');
  storage(extra,nativeRoot);return measureDependencyTree({root:nativeRoot,trustedLinkRoots:[],forbiddenRoots:[nativeStore,...actors],...(maxEntries?{maxEntries}:{}),...(maxBytes?{maxBytes}:{})});
 }
 function verifyCanonical({installRoot,sealPath,actorWritableRoots:extra=[]},document){
  const {signature:tag,...body}=document;
  if(body.format!==1||body.kind!=='dependency-canonical-alias-seal'||body.hostKeyId!==anchor()||!valid('canonical-alias-seal-v1',body,tag))fail('UNTRUSTED_SEAL','Canonical binding signature is invalid');
  const origin=body.originSeal,binding=body.binding;let original;
  try{const raw=Buffer.from(origin.documentBase64,'base64');if(raw.toString('base64')!==origin.documentBase64||sha(raw)!==origin.sha256)throw Error();original=JSON.parse(raw);}catch{fail('UNTRUSTED_SEAL','Original signed seal bytes were changed');}
  const {body:old,record}=authenticateObserved(original),root=realpathSync.native(installRoot);
  if(binding?.canonicalRoot!==root||binding.originRoot!==record.installRoot||binding.originSealSha256!==origin.sha256||binding.samePhysicalDirectory!==true||binding.originTreeSha256!==old.manifest.treeSha256||binding.canonicalTreeSha256!==body.manifest?.treeSha256||body.manifest?.root!==root||canonical(old.manifest.entries)!==canonical(body.manifest.entries)||old.manifest.roots?.length!==1||body.manifest.roots?.length!==1||old.manifest.entries.some(e=>e.type==='link')||body.manifest.entries.some(e=>e.type==='link'))fail('UNTRUSTED_SEAL','Canonical binding does not preserve the authenticated original physical installation');
  const current=canonicalMeasure(root,extra);if(canonical(current)!==canonical(body.manifest))fail('DEPENDENCY_CHANGED','Canonical dependency paths, types or bytes changed');
  return{ok:true,attestation:'verified-observed-installation-canonical-alias',sealPath:realpathSync.native(sealPath),installRecord:record,canonicalBinding:binding,treeSha256:current.treeSha256,entryCount:current.entryCount,totalBytes:current.totalBytes};
 }
 function verify({installRoot,sealPath,actorWritableRoots:additionalActorRoots=[]}={}){
  const loaded=protectedDocument(sealPath);if(loaded.document.kind==='dependency-canonical-alias-seal')return verifyCanonical({installRoot,sealPath,actorWritableRoots:additionalActorRoots},loaded.document);
  const root=realpathSync(installRoot);storage(additionalActorRoots,root);assertOutsideActor(root,additionalActorRoots);
  if(typeof sealPath!=='string'||!within(sealCanonical,resolve(sealPath))||!present(sealPath)||lstatSync(sealPath).isSymbolicLink()||!within(sealCanonical,realpathSync(sealPath)))fail('UNSAFE_SEAL_STORAGE','Seal must be an independent regular file in the protected seal store');
  if(statSync(sealPath).size>128*1024*1024)fail('UNTRUSTED_SEAL','Seal exceeds its size bound');
  let document;try{document=JSON.parse(readFileSync(sealPath,'utf8'));}catch{fail('UNTRUSTED_SEAL','Seal document is not valid JSON');}
  if(!document||typeof document!=='object'||Array.isArray(document))fail('UNTRUSTED_SEAL','Seal document must be an authenticated object');
  const {signature:tag,...body}=document;
  if(body.format!==1||body.kind!=='dependency-installation-seal'||body.hostKeyId!==anchor()||!valid('dependency-seal-v1',body,tag)||!valid('install-record-v1',body.installRecord,body.recordSignature))fail('UNTRUSTED_SEAL','Seal or trusted installation provenance is not authenticated');
  const record=body.installRecord;
  if(record.kind!=='observed-locked-installation'||record.exitCode!==0||record.installRoot!==root||record.treeSha256!==body.manifest?.treeSha256)fail('UNTRUSTED_SEAL','Seal does not bind the observed successful installation');
  const current=measure(root,additionalActorRoots);
  if(canonical(current)!==canonical(body.manifest))fail('DEPENDENCY_CHANGED','Dependency paths, types, targets or content differ from the observed installation');
  return {ok:true,attestation:'verified-observed-installation',sealPath,installRecord:record,treeSha256:current.treeSha256,entryCount:current.entryCount,totalBytes:current.totalBytes};
 }
 async function rebindCanonicalPath({installRoot,sealPath}={}){
  const before=protectedDocument(sealPath),{body:old,record}=authenticateObserved(before.document);
  // Legacy verification must genuinely work while its original namespace still
  // exists. This cannot promote an arbitrary existing directory to first trust.
  const original=verify({installRoot,sealPath});if(original.attestation!=='verified-observed-installation'||!before.bytes.equals(protectedDocument(sealPath).bytes))fail('UNTRUSTED_SEAL','Only the unchanged original observed installation can receive its first canonical binding');
  if(trustedLinkRoots.length||old.manifest.roots.length!==1||old.manifest.entries.some(e=>e.type==='link'))fail('UNSUPPORTED_CANONICAL_REBIND','First canonical rebind supports only link-free installations with no external trusted roots');
  const canonicalRoot=realpathSync.native(installRoot),originPhysical=realpathSync.native(old.manifest.root);if(canonicalRoot!==originPhysical)fail('UNTRUSTED_SEAL','Different physical directories cannot share installation provenance');
  const manifest=canonicalMeasure(canonicalRoot);if(canonical(old.manifest.entries)!==canonical(manifest.entries)||old.manifest.treeSha256!==manifest.treeSha256)fail('DEPENDENCY_CHANGED','Canonical bytes or entry identities differ from the authenticated original installation');
  const originSha256=sha(before.bytes),binding={originRoot:record.installRoot,originInput:resolve(installRoot),canonicalRoot,originSealSha256:originSha256,samePhysicalDirectory:true,originTreeSha256:old.manifest.treeSha256,canonicalTreeSha256:manifest.treeSha256,issuedAt:new Date().toISOString()};
  const body={format:1,kind:'dependency-canonical-alias-seal',hostKeyId:anchor(),binding,originSeal:{sha256:originSha256,documentBase64:before.bytes.toString('base64')},manifest},document={...body,signature:signature('canonical-alias-seal-v1',body)},path=join(realpathSync.native(sealCanonical),sha(canonicalRoot)+'-canonical-'+originSha256.slice(0,16)+'.json');
  writeFileSync(path,JSON.stringify(document),{flag:'wx',mode:0o600});return{canonicalRoot,sealPath:realpathSync.native(path),bindingFacts:binding,treeSha256:manifest.treeSha256,entryCount:manifest.entryCount,totalBytes:manifest.totalBytes,originalSealUnchanged:before.bytes.equals(protectedDocument(sealPath).bytes)};
 }
 return Object.freeze({installAndSeal,verify,rebindCanonicalPath});
}
