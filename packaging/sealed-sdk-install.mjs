// Owner-only installation helper. Uses built-ins and the host seal authority;
// never trusts a current dependency directory merely because it can be hashed.
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,statSync,lstatSync,realpathSync,mkdirSync,existsSync,renameSync,createReadStream} from 'node:fs';
import {resolve,relative,isAbsolute,join,dirname,sep} from 'node:path';
import {userInfo} from 'node:os';
import {inflateRawSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createDependencySealAuthority,measureDependencyTree} from '../hosts/security/dependency-seal.mjs';
import {verifyReleaseManifest} from '../hosts/security/installation-verifier.mjs';
export const RELEASE_SHA256='d59fd5972c63ddf5f2ec45019686b262c6f9ee4040a50a39b6f6bc8de60e10fb';
export const NODE_ARCHIVE_SHA256='d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5';
// Derived independently by verify-node-archive.py from the above pinned ZIP.
export const NODE_TREE_SHA256='8c862fa5a190b0e1a53cad0cd0b361c53d280939cb30f4342867ffbf57e0cd85';
export const SDK_PACKAGE_SHA256='e5333bdb1f4c6ceebb110a8c0a7a2f5cb888ce809fa9cc801fbe647d81899a16';
export const SDK_LOCK_SHA256='0047ae6efbad56d5dbd8da744a2e93f70b406a8062d282a401a2f27add152868';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const inside=(a,b)=>{const r=relative(resolve(a),resolve(b));return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));};
const intersects=(a,b)=>inside(a,b)||inside(b,a);
function regular(path){if(!isAbsolute(path)||lstatSync(path).isSymbolicLink()||!statSync(path).isFile())throw Error('Absolute regular authenticated source required');return realpathSync(path);}
function directory(path){mkdirSync(path,{recursive:true,mode:0o700});if(lstatSync(path).isSymbolicLink()||relative(resolve(path),realpathSync(path))!=='')throw Error('Private directory cannot be redirected');return realpathSync(path);}
function checkedBytes(bytes,at,size){if(!Number.isSafeInteger(at)||!Number.isSafeInteger(size)||at<0||size<0||at+size>bytes.length)throw Error('ZIP member bounds invalid');return bytes.subarray(at,at+size);}
function sourceMembers(bytes){
 // Whole archive digest is authenticated before this bounded ZIP reader runs.
 let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50&&at+22+bytes.readUInt16LE(at+20)===bytes.length){end=at;break;}
 if(end<0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)throw Error('Single disk source ZIP required');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);if(count<2||count>5000||count!==bytes.readUInt16LE(end+8)||start+size!==end)throw Error('Source ZIP central directory invalid');
 let at=start;const names=new Set(),result={};
 for(let n=0;n<count;n++){
  const c=checkedBytes(bytes,at,46);if(c.readUInt32LE(0)!==0x02014b50)throw Error('Source ZIP central entry invalid');
  const flags=c.readUInt16LE(8),method=c.readUInt16LE(10),compressed=c.readUInt32LE(20),length=c.readUInt32LE(24),nameSize=c.readUInt16LE(28),extra=c.readUInt16LE(30),comment=c.readUInt16LE(32),local=c.readUInt32LE(42);
  const name=new TextDecoder('utf8',{fatal:true}).decode(checkedBytes(bytes,at+46,nameSize));at+=46+nameSize+extra+comment;
  if(name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(p=>p==='.'||p==='..')||names.has(name.toLowerCase())||flags&1)throw Error('Unsafe or duplicate source ZIP entry');names.add(name.toLowerCase());
  const kind=name.endsWith('/hosts/dsh/package-lock.json')||name==='hosts/dsh/package-lock.json'?'lock':name.endsWith('/hosts/dsh/package.json')||name==='hosts/dsh/package.json'?'package':null;if(!kind)continue;
  if(result[kind]||length>4*1024*1024||![0,8].includes(method)||local>=start)throw Error('Unrecognized or ambiguous source ZIP member');
  const l=checkedBytes(bytes,local,30);if(l.readUInt32LE(0)!==0x04034b50||l.readUInt16LE(8)!==method||l.readUInt16LE(6)!==flags)throw Error('Source ZIP local header differs');
  const localName=l.readUInt16LE(26),localExtra=l.readUInt16LE(28);if(!checkedBytes(bytes,local+30,localName).equals(Buffer.from(name)))throw Error('Source ZIP local name differs');
  const offset=local+30+localName+localExtra;if(offset+compressed>start)throw Error('Source ZIP data crosses directory');const packed=checkedBytes(bytes,offset,compressed),raw=method===8?inflateRawSync(packed,{maxOutputLength:4*1024*1024}):Buffer.from(packed);
  if(raw.length!==length)throw Error('Source ZIP member is incomplete');result[kind]={archiveMember:name,bytes:raw,sha256:sha(raw)};
 }
 if(at!==end||!result.package||!result.lock)throw Error('Authenticated release must contain both locked SDK source files');return result;
}
export function authenticatedReleaseSources({repoRoot,releaseArchivePath,expectedReleaseSha256=RELEASE_SHA256}={}){
 const archive=regular(releaseArchivePath);if(!pin(expectedReleaseSha256)||statSync(archive).size>16*1024*1024)throw Error('Bounded pinned release archive required');const bytes=readFileSync(archive);if(sha(bytes)!==expectedReleaseSha256)throw Error('Authenticated release archive hash mismatch');const entries=sourceMembers(bytes);
 for(const [kind,name]of [['package','package.json'],['lock','package-lock.json']]){const path=regular(join(resolve(repoRoot),'hosts/dsh',name));if(sha(readFileSync(path))!==entries[kind].sha256)throw Error('Current SDK source does not match authenticated release '+name);entries[kind]={path,sha256:entries[kind].sha256,archiveMember:entries[kind].archiveMember};}
 return {...entries,archive:{path:archive,sha256:expectedReleaseSha256,authority:'independently-pinned-preview-zip'}};
}
export function authenticatedManifestSources({payloadRoot,manifestPath=join(payloadRoot,'manifest.json'),manifestSha256}={}){
 verifyReleaseManifest({payloadRoot,manifestPath,manifestSha256});const result={manifest:{path:realpathSync.native(manifestPath),sha256:manifestSha256,authority:'independently-pinned-complete-release-manifest'}};
 for(const [kind,name,expected]of [['package','package.json',SDK_PACKAGE_SHA256],['lock','package-lock.json',SDK_LOCK_SHA256]]){const path=regular(join(payloadRoot,'hosts/dsh',name));if(sha(readFileSync(path))!==expected)throw Error('DSH source differs from the independently fixed package/lock identity');result[kind]={path,sha256:expected,manifestMember:'hosts/dsh/'+name};}return result;
}
export const ownerGlobalRoot=()=>join(userInfo().homedir,'.agent-workflow','global');
function keyFor(root){const path=join(directory(join(root,'keys')),'shared-sdk.key');if(!existsSync(path))try{writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(lstatSync(path).isSymbolicLink()||!statSync(path).isFile()||statSync(path).nlink!==1)throw Error('Host dependency key cannot be redirected or hard linked');const key=readFileSync(path);if(key.length!==32)throw Error('Invalid host dependency key length');return {key,path};}
function writeReceipt(path,value){const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});renameSync(temp,path);}
/** Lower-level owner authority API, also used for small independent fixtures.
 * All expected digests/provenance are trusted caller inputs, never actor fields.
 * Production callers use installSharedDSHSdk's fixed archive and tree pins. */
export async function installSealedSdk({repoRoot,releaseArchivePath,expectedReleaseSha256=RELEASE_SHA256,sourceManifest,ownerRoot=ownerGlobalRoot(),installer,nodeProvenance,actorWritableRoots=[],timeoutMs=900000}={}){
 const source=sourceManifest?authenticatedManifestSources(sourceManifest):authenticatedReleaseSources({repoRoot,releaseArchivePath,expectedReleaseSha256});
 if(!Array.isArray(actorWritableRoots)||actorWritableRoots.some(p=>intersects(ownerRoot,p))||intersects(ownerRoot,resolve(repoRoot)))throw Error('Private SDK owner root intersects actor or payload scope');
 if(!nodeProvenance?.authority||!pin(nodeProvenance.expectedTreeSha256)||nodeProvenance.expectedTreeSha256!==installer?.expectedTreeSha256)throw Error('Independent complete installer tool provenance required');
 const root=directory(ownerRoot),dependencies=directory(join(root,'dependencies')),installRoot=join(dependencies,'dsh-'+source.lock.sha256.slice(0,16)),receipts=directory(join(root,'receipts')),receiptPath=join(receipts,'shared-sdk-'+source.lock.sha256.slice(0,16)+'.json');
 if(existsSync(installRoot)&&!existsSync(receiptPath))throw Error('Existing unsealed SDK cannot receive first trust');
 const key=keyFor(root),sealRoot=directory(join(root,'seals')),authority=createDependencySealAuthority({sealRoot,key:key.key,payloadRoots:[resolve(repoRoot)],actorWritableRoots,trustedLinkRoots:[]});let sealed,reused=false;
 if(existsSync(installRoot)){
  if(lstatSync(receiptPath).isSymbolicLink())throw Error('SDK receipt redirected');const old=JSON.parse(readFileSync(receiptPath,'utf8'));if(old.installRoot!==installRoot||old.source?.lock?.sha256!==source.lock.sha256||old.source?.package?.sha256!==source.package.sha256)throw Error('Existing SDK receipt source does not match');sealed=authority.verify({installRoot,sealPath:old.sealPath});reused=true;
 }else sealed=await authority.installAndSeal({installRoot,sourcePackage:source.package,sourceLock:source.lock,installer,timeoutMs});
 const checked=authority.verify({installRoot,sealPath:sealed.sealPath}),receipt={format:1,status:'sealed',reused,installRoot,sealPath:sealed.sealPath,keyPath:key.path,receiptPath,source,nodeProvenance,installRecord:checked.installRecord,treeSha256:checked.treeSha256,entryCount:checked.entryCount,totalBytes:checked.totalBytes,modelCalled:false,postinstallScriptsExecuted:false,readyForBothHosts:false,verification:'content-and-observed-installation-only-runtime-probes-required'};
 writeReceipt(receiptPath,receipt);return receipt;
}
async function fileSha(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
const probeEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(k.toUpperCase())));
export async function probeSealedSdk(receipt,{nodePath,ownerRoot=ownerGlobalRoot()}={}){
 const key=readFileSync(receipt.keyPath),authority=createDependencySealAuthority({sealRoot:dirname(receipt.sealPath),key,payloadRoots:[],actorWritableRoots:[],trustedLinkRoots:[]});authority.verify({installRoot:receipt.installRoot,sealPath:receipt.sealPath});
 const env={...probeEnv(),DSH_HOME:directory(join(ownerRoot,'probes','version-home')),DO_NOT_TRACK:'1',DISABLE_TELEMETRY:'1'},cwd=receipt.installRoot;
 const run=args=>{const r=spawnSync(nodePath,args,{cwd,env,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:512*1024});return {ok:!r.error&&r.status===0,exitCode:r.status,error:r.error?.message??null,stdout:(r.stdout??'').slice(0,4000),stderr:(r.stderr??'').slice(0,4000)};};
 const anchor=JSON.stringify(join(cwd,'package.json')),common=`import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';const require=createRequire(${anchor});`;
 const version=run(['--input-type=module','-e',common+`import {spawnSync} from 'node:child_process';import {dirname,join} from 'node:path';const bin=join(dirname(require.resolve('@deepseek-ai/dsh/package.json')),'lib/bin.js');const r=spawnSync(process.execPath,[bin,'--version'],{env:process.env,stdio:'inherit',windowsHide:true,timeout:20000});process.exit(r.status??1);`]);
 const koffi=run(['--input-type=module','-e',common+`const m=await import(pathToFileURL(require.resolve('koffi')).href);const api=m.default??m;if(typeof api.load!=='function')throw Error('Koffi native API absent');console.log(JSON.stringify({loaded:true,version:api.version}));`]);
 const pty=run(['--input-type=module','-e',common+`const m=await import(pathToFileURL(require.resolve('node-pty')).href);if(typeof (m.default??m).spawn!=='function')throw Error('node-pty API absent');console.log(JSON.stringify({loaded:true}));`]);
 const ws=run(['--input-type=module','-e',common+`const v=require('ws/package.json').version;if(v!=='8.22.0')throw Error('Unexpected shared ws version '+v);if(typeof require('ws').WebSocket!=='function')throw Error('ws not callable');console.log(JSON.stringify({loaded:true,version:v}));`]);
 authority.verify({installRoot:receipt.installRoot,sealPath:receipt.sealPath});const ready=version.ok&&koffi.ok&&pty.ok&&ws.ok,result={...receipt,status:ready?'sealed-runtime-probes-passed':'sealed-capability-blocked',readyForBothHosts:ready,probes:{version,koffi,nodePty:pty,ws},verification:'content-seal-and-runtime-load-probes-not-model-task-acceptance'};writeReceipt(receipt.receiptPath,result);return result;
}
export async function verifyOfficialNode({nodeArchivePath,toolRoot}={}){
 if(process.platform!=='win32')throw Error('This pinned production SDK install supports Windows x64 only');
 regular(nodeArchivePath);if(await fileSha(nodeArchivePath)!==NODE_ARCHIVE_SHA256)throw Error('Official Node ZIP hash mismatch');
 const measured=measureDependencyTree({root:toolRoot});if(measured.treeSha256!==NODE_TREE_SHA256)throw Error('Node toolchain differs from independently authenticated ZIP tree');
 const nodePath=regular(join(toolRoot,'node.exe')),npmCliPath=regular(join(toolRoot,'node_modules/npm/bin/npm-cli.js')),installer={nodePath,nodeSha256:await fileSha(nodePath),npmCliPath,npmCliSha256:await fileSha(npmCliPath),toolRoot,expectedTreeSha256:NODE_TREE_SHA256};
 const nodeProvenance={authority:'pinned-official-node-zip-independent-tree-oracle',archivePath:realpathSync(nodeArchivePath),archiveSha256:NODE_ARCHIVE_SHA256,expectedTreeSha256:NODE_TREE_SHA256,entryCount:measured.entryCount,totalBytes:measured.totalBytes};
 return{installer,nodeProvenance,nodeExecutable:realpathSync.native(nodePath),toolRoot:realpathSync.native(toolRoot)};
}
export async function installSharedDSHSdk({repoRoot,releaseArchivePath,sourceManifest,nodeArchivePath,toolRoot,actorWritableRoots=[]}={}){
 const node=await verifyOfficialNode({nodeArchivePath,toolRoot});const receipt=await installSealedSdk({repoRoot,releaseArchivePath,sourceManifest,expectedReleaseSha256:RELEASE_SHA256,ownerRoot:ownerGlobalRoot(),installer:node.installer,nodeProvenance:node.nodeProvenance,actorWritableRoots});return probeSealedSdk(receipt,{nodePath:node.nodeExecutable});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){const names={'--repo-root':'repoRoot','--release-archive':'releaseArchivePath','--node-archive':'nodeArchivePath','--tool-root':'toolRoot'};if(!names[args[i]]||!args[i+1])throw Error('Explicit known installer arguments required');options[names[args[i]]]=resolve(args[i+1]);}
 try{const result=await installSharedDSHSdk(options);console.log(JSON.stringify(result,null,2));if(!result.readyForBothHosts)process.exitCode=2;}catch(error){console.error(JSON.stringify({status:'blocked',error:error.message}));process.exitCode=1;}
}
