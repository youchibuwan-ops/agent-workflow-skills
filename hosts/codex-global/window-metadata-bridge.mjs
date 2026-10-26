import {readFileSync,writeFileSync,lstatSync,realpathSync,mkdtempSync,rmSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {dirname,basename,join,resolve,isAbsolute,parse} from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const templatePath=new URL('./window-metadata-bridge.cs',import.meta.url),template=readFileSync(templatePath),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),templateSha256=hash(template),systemRoot='C:/Windows',framework=join(systemRoot,'Microsoft.NET/Framework64/v4.0.30319'),compilerPath=join(framework,'csc.exe');
export const WINDOW_METADATA_APP_ID='AgentWorkflow.Codex.Guarded';
// The trusted CJS bootstrap serializes this exact function. All Node capabilities
// are explicit parameters; there are no module or Node-global dependencies.
export function windowMetadataBridgeRuntimeFactory({fs,path,childProcess,crypto,executablePath,sha256}={}){
 const {readFileSync,lstatSync,realpathSync}=fs,{dirname,resolve,isAbsolute,parse}=path,{spawnSync}=childProcess,{createHash}=crypto;
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 function noLinks(value){for(let p=resolve(value);;p=dirname(p)){try{if(lstatSync(p).isSymbolicLink())throw Error('Redirected window metadata path refused');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===parse(p).root)break;}}
 function regular(value){if(typeof value!=='string'||!isAbsolute(value)||/[\x00-\x1f\x7f"\u2028\u2029]/u.test(value))throw Error('Absolute plain window metadata path required');noLinks(value);const stat=lstatSync(value);if(!stat.isFile()||stat.nlink!==1)throw Error('Window metadata file must be regular with one link');return realpathSync.native(value);}
 function noSidecars(value){for(const suffix of ['.config','.manifest'])try{lstatSync(value+suffix);throw Error('Window metadata CLR sidecar refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
 function cleanEnv(temp){return{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',TEMP:temp,TMP:temp};}
 const file=regular(executablePath);noSidecars(file);if(!/^[a-f0-9]{64}$/.test(sha256??''))throw Error('Window metadata executable pin required');
 // Native fs returns Node Buffers, even when this function has no Buffer global.
 const NativeBuffer=readFileSync(file).constructor;
 const call=(operation,handle,ownerPid)=>{noSidecars(file);if(hash(readFileSync(regular(file)))!==sha256)throw Error('Window metadata executable integrity mismatch');const hex=NativeBuffer.isBuffer(handle)&&handle.length===8?handle.readBigUInt64LE().toString(16).padStart(16,'0'):handle;if(typeof hex!=='string'||!/^[0-9a-f]{16}$/i.test(hex)||/^0+$/.test(hex)||!Number.isInteger(ownerPid)||ownerPid<=0||ownerPid>0xffffffff)throw Error('Native window identity required');const result=spawnSync(file,[operation,hex,String(ownerPid)],{shell:false,windowsHide:true,cwd:dirname(file),env:cleanEnv(dirname(file)),encoding:'utf8',timeout:3000,maxBuffer:4096});if(result.error||result.status!==0||result.signal||result.stderr)throw Error('Window metadata '+operation+' rejected');let status;try{status=JSON.parse(result.stdout);}catch{throw Error('Window metadata reply invalid');}if(status.ok!==true||status.operation!==operation||status.ownerPid!==ownerPid||Object.keys(status).length!==3)throw Error('Window metadata identity reply differs');return Object.freeze(status);};
 return Object.freeze({set:(h,p)=>call('set',h,p),verify:(h,p)=>call('verify',h,p),clear:(h,p)=>call('clear',h,p)});
}
// Validation only: exported so the actual filesystem identity gate can be
// tested without exposing a general recursive-delete operation.
export function assertWindowMetadataScratch({scratch,outputDirectory,identity}){
 try{if(!isAbsolute(scratch)||!isAbsolute(outputDirectory)||!/^\.metadata-build-[A-Za-z0-9_-]+$/.test(basename(scratch)))throw Error();noLinks(outputDirectory);const parent=realpathSync.native(outputDirectory),absolute=resolve(scratch),stat=lstatSync(absolute);if(dirname(absolute)!==parent||!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==identity.dev||stat.ino!==identity.ino)throw Error();const canonical=realpathSync.native(absolute);if(canonical!==absolute||canonical!==identity.realpath||dirname(canonical)!==parent)throw Error();return canonical;}catch{throw Error('Window metadata scratch cleanup identity mismatch');}
}
function noLinks(path){for(let p=resolve(path);;p=dirname(p)){try{if(lstatSync(p).isSymbolicLink())throw Error('Redirected window metadata path refused');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===parse(p).root)break;}}
function regular(path,single=true){if(typeof path!=='string'||!isAbsolute(path)||/[\x00-\x1f\x7f"\u2028\u2029]/u.test(path))throw Error('Absolute plain window metadata path required');noLinks(path);const stat=lstatSync(path);if(!stat.isFile()||(single&&stat.nlink!==1))throw Error('Window metadata file must be regular with one link');return realpathSync.native(path);}
function planned(path){
 if(typeof path!=='string'||!isAbsolute(path)||/[\x00-\x1f\x7f"\u2028\u2029]/u.test(path))throw Error('Absolute planned window metadata path required');
 const name=basename(path);if(!name||/[<>:"|?*]/u.test(name)||/[. ]$/.test(name)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw Error('Plain planned file basename required');noLinks(path);
 try{lstatSync(path);return regular(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 const parent=dirname(path);noLinks(parent);const canonical=realpathSync.native(parent);if(!lstatSync(canonical).isDirectory())throw Error('Planned file parent directory required');return join(canonical,name);
}
function fresh(path){if(typeof path!=='string'||!isAbsolute(path)||/[\x00-\x1f\x7f"]/u.test(path))throw Error('Absolute fresh output required');noLinks(path);try{lstatSync(path);throw Error('Window metadata output already exists; fresh output required');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=realpathSync.native(dirname(path));if(!lstatSync(parent).isDirectory())throw Error('Output parent directory required');return join(parent,path.slice(path.lastIndexOf('/')+1).split('\\').at(-1));}
function cleanEnv(temp){return{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',TEMP:temp,TMP:temp};}
function noSidecars(path){for(const suffix of ['.config','.manifest'])try{lstatSync(path+suffix);throw Error('Window metadata CLR sidecar refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
function literal(text){return JSON.stringify(text).replace(/[^\x20-\x7e]/gu,c=>[...c].map(x=>x.length===1?'\\u'+x.charCodeAt(0).toString(16).padStart(4,'0'):'\\u'+x.charCodeAt(0).toString(16)+'\\u'+x.charCodeAt(1).toString(16)).join(''));}
function metadata(options){const ownerExecutable=planned(options.ownerExecutable),launcherPath=planned(options.launcherPath),iconPath=planned(options.iconPath??options.ownerExecutable),displayName=options.displayName??'Codex（受控流程）',appId=options.appId??WINDOW_METADATA_APP_ID;if(basename(launcherPath)!=='Launch-Codex-Controlled.exe'||basename(dirname(launcherPath))!=='bin'||appId!==WINDOW_METADATA_APP_ID||typeof displayName!=='string'||displayName.length<1||displayName.length>128||/[\x00-\x1f\x7f\u2028\u2029]/u.test(displayName))throw Error('Fixed window metadata identity and stable bin launcher required');return{ownerExecutable,launcherPath,iconPath,displayName,appId};}
export function compileWindowMetadataBridge(options={}){
 if(process.platform!=='win32')throw Error('Windows Framework compiler unsupported on this platform');
 // Windows services its own Framework files through WinSxS hardlinks. They are
 // fixed system inputs, hashed before/after; host-owned outputs remain nlink1.
 const executablePath=fresh(options.outputPath),binding=metadata(options),compiler=regular(compilerPath,false),references=['mscorlib.dll','System.dll'].map(x=>({path:regular(join(framework,x),false)}));noSidecars(executablePath);
 if(hash(readFileSync(templatePath))!==templateSha256||(options.expectedTemplateSha256&&options.expectedTemplateSha256!==templateSha256))throw Error('Window metadata source integrity mismatch');
 const compilerSha256=hash(readFileSync(compiler));for(const r of references)r.sha256=hash(readFileSync(r.path));
 let source=template.toString('utf8');for(const [key,value] of Object.entries({OWNER:binding.ownerExecutable,LAUNCHER:binding.launcherPath,ICON:binding.iconPath,DISPLAY:binding.displayName,APPID:binding.appId})){const token='@@'+key+'@@';if(source.split(token).length!==2)throw Error('Window metadata source binding differs');source=source.replace(token,literal(value));}
 const sourceSha256=hash(source),scratch=mkdtempSync(join(dirname(executablePath),'.metadata-build-')),scratchStat=lstatSync(scratch),scratchIdentity={dev:scratchStat.dev,ino:scratchStat.ino,realpath:realpathSync.native(scratch)};let bytes;
 try{const sourcePath=join(scratch,'bridge.cs'),built=join(scratch,'bridge.exe');writeFileSync(sourcePath,source,{flag:'wx',mode:0o600});const args=['/nologo','/noconfig','/nostdlib+','/platform:x64','/target:exe','/optimize+','/warnaserror+',...references.map(r=>'/reference:'+r.path),'/out:'+built,sourcePath];const result=spawnSync(compiler,args,{shell:false,windowsHide:true,cwd:scratch,env:cleanEnv(scratch),encoding:'utf8',timeout:15000,maxBuffer:65536});if(result.error||result.status!==0||result.signal||result.stdout||result.stderr)throw Error('Window metadata Framework compilation failed');
  if(hash(readFileSync(regular(compiler,false)))!==compilerSha256||hash(readFileSync(templatePath))!==templateSha256||references.some(r=>hash(readFileSync(regular(r.path,false)))!==r.sha256)||hash(readFileSync(regular(sourcePath)))!==sourceSha256)throw Error('Window metadata build inputs changed');
  bytes=readFileSync(regular(built));const fd=openSync(executablePath,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);try{if(!fstatSync(fd).isFile()||fstatSync(fd).nlink!==1)throw Error('Fresh output identity differs');writeFileSync(fd,bytes);}finally{closeSync(fd);}if(hash(readFileSync(regular(executablePath)))!==hash(bytes))throw Error('Window metadata compiled output differs');
 }finally{const checked=assertWindowMetadataScratch({scratch,outputDirectory:dirname(executablePath),identity:scratchIdentity});rmSync(checked,{recursive:true,force:true});}
 const sha256=hash(bytes),compilerReceipt={path:compiler,sha256:compilerSha256,references};const receipt={format:1,kind:'actual-framework-csc',executablePath,sha256,bytes:bytes.length,sourceSha256,templateSha256,binding,compiler:compilerReceipt};return{format:1,executablePath,bytes,sha256,sourceSha256,templateSha256,binding,compiler:compilerReceipt,receipt};
}
export function createWindowMetadataBridge({executablePath,sha256}={}){
 return windowMetadataBridgeRuntimeFactory({fs:{readFileSync,lstatSync,realpathSync},path:{dirname,resolve,isAbsolute,parse},childProcess:{spawnSync},crypto:{createHash},executablePath,sha256});
}
