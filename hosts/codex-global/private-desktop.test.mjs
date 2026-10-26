import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {spawnSync} from 'node:child_process';
import {buildPrivateDesktop,parseAsarHeader,encodeAsarHeader,patchPEIntegrity} from './private-desktop.mjs';
import {compileWindowMetadataBridge} from './window-metadata-bridge.mjs';
import {measureDependencyTree} from '../security/dependency-seal.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const url='ws://127.0.0.1:14231/workflow/'+'a'.repeat(64),mainPath='.vite/build/main-BPBEjAxi.js';
function peFixture(hash,{uppercase=false}={}){
 const b=Buffer.alloc(2048),p=0x80,o=p+24,s=o+240,r=0x200;
 b.write('MZ');b.writeUInt32LE(p,0x3c);b.write('PE\0\0',p);b.writeUInt16LE(1,p+6);b.writeUInt16LE(240,p+20);b.writeUInt16LE(0x20b,o);b.writeUInt32LE(16,o+108);b.writeUInt32LE(0x1000,o+112+16);b.writeUInt32LE(0x400,o+112+20);
 b.write('.rsrc',s);b.writeUInt32LE(0x400,s+8);b.writeUInt32LE(0x1000,s+12);b.writeUInt32LE(0x400,s+16);b.writeUInt32LE(r,s+20);
 const dir=(at,named,count)=>{b.writeUInt16LE(named,r+at+12);b.writeUInt16LE(count,r+at+14);};
 const ent=(at,name,target)=>{b.writeUInt32LE(name>>>0,r+at);b.writeUInt32LE(target>>>0,r+at+4);};
 const str=(at,value)=>{b.writeUInt16LE(value.length,r+at);b.write(value,r+at+2,'utf16le');};
 dir(0,1,0);ent(16,0x80000080,0x80000020);dir(0x20,1,0);ent(0x30,0x800000a0,0x80000040);dir(0x40,0,1);ent(0x50,1033,0x60);str(0x80,uppercase?'INTEGRITY':'Integrity');str(0xa0,uppercase?'ELECTRONASAR':'ElectronAsar');
 const json=Buffer.from(JSON.stringify([{file:'resources\\app.asar',alg:'SHA256',value:hash}]));b.writeUInt32LE(0x1100,r+0x60);b.writeUInt32LE(json.length,r+0x64);json.copy(b,r+0x100);b.write(hash,0x700);return b;
}
function fixture(t,{large=false}={}){
 const root=fs.mkdtempSync(join(tmpdir(),'private-desktop-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(root.includes('private-desktop-test-'));fs.rmSync(root,{recursive:true,force:true});});
 const sourceRoot=join(root,'source'),targetRoot=join(root,'private');fs.mkdirSync(join(sourceRoot,'resources/assets'),{recursive:true});fs.mkdirSync(join(sourceRoot,'locales'));
 const main=Buffer.from('function _7(e){return new Original(e)};const fixture={getConfiguredHostIds:()=>[u.h,...this.durableThreadHostConfig==null?[]:[this.durableThreadHostConfig.id],...this.getRemoteConnections().map(e=>e.hostId)]};if(this.durableThreadHostConfig!=null){let e=this.createAppServerConnection(this.durableThreadHostConfig.id,this.durableThreadHostConfig,!1,a);this.executionHostRegistry.add(this.durableThreadHostConfig.id,e),this.appServerConnectionRegistry.addConnection(this.durableThreadHostConfig.id,e)};const portal=new TIe({statsig:this.publishedStatsig,assertDestinationAllowed:t=>e.applicationNetwork.assertAllowed(t),auth:a,desktopApiOptions:e,hostConfig:this.durableThreadHostConfig,getConnection:A,fallback:j});'+(large?' '.repeat(4194304):'')),other=Buffer.from('UNCHANGED_DATA');
 const header={files:{'.vite':{files:{build:{files:{'main-BPBEjAxi.js':{size:main.length,offset:'0',integrity:{algorithm:'SHA256',hash:sha(main),blockSize:4194304,blocks:[sha(main)]}}}}}},'other.txt':{size:other.length,offset:String(main.length)}}};
 const prefix=encodeAsarHeader(header),archive=Buffer.concat([prefix,main,other]),parsed=parseAsarHeader(prefix),pe=peFixture(parsed.headerSha256);
 fs.writeFileSync(join(sourceRoot,'resources/app.asar'),archive);fs.writeFileSync(join(sourceRoot,'ChatGPT.exe'),pe);fs.writeFileSync(join(sourceRoot,'chrome.dll'),'FUSES_MUST_STAY_UNCHANGED');fs.writeFileSync(join(sourceRoot,'resources/notice.txt'),'license fixture');fs.writeFileSync(join(sourceRoot,'resources/assets/shared.txt'),'asset');fs.writeFileSync(join(sourceRoot,'locales/en.pak'),'locale');
 const options={sourceRoot,targetRoot,gatewayUrl:url,mainPath,expectedPEHash:sha(pe),expectedASARHeaderHash:parsed.headerSha256,expectedMainHash:sha(main)};
 return {root,sourceRoot,targetRoot,options,main,other,archive,pe};
}
test('private builder appends main, preserves old offsets/data, updates block integrity and only its PE resource',async t=>{
 const f=fixture(t),result=await buildPrivateDesktop(f.options),bytes=fs.readFileSync(join(f.targetRoot,'resources/app.asar')),parsed=parseAsarHeader(bytes),entry=parsed.header.files['.vite'].files.build.files['main-BPBEjAxi.js'];
 assert.equal(entry.offset,String(f.main.length+f.other.length));assert.equal(parsed.header.files['other.txt'].offset,String(f.main.length));assert.deepEqual(bytes.subarray(parsed.dataOffset,parsed.dataOffset+f.main.length+f.other.length),Buffer.concat([f.main,f.other]));
 const patched=bytes.subarray(parsed.dataOffset+Number(entry.offset));assert.match(patched.toString(),/Workflow host route denied/);assert.equal(entry.integrity.hash,sha(patched));assert.deepEqual(entry.integrity.blocks,[sha(patched)]);assert.equal(entry.integrity.blockSize,4194304);
 const pe=fs.readFileSync(join(f.targetRoot,'ChatGPT.exe'));assert.equal(pe.length,f.pe.length);assert.equal(pe.subarray(0x700,0x740).toString(),f.options.expectedASARHeaderHash);assert.equal(result.vendorSignatureValid,false);assert.equal(result.stockUnchanged,true);assert.equal(result.uiLaunched,false);
 assert.deepEqual(patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:parsed.headerSha256,newHeaderHash:f.options.expectedASARHeaderHash}).bytes,f.pe);
 assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'ChatGPT.exe')),f.pe);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);
 assert.equal(fs.statSync(join(f.sourceRoot,'chrome.dll')).ino,fs.statSync(join(f.targetRoot,'chrome.dll')).ino);assert(fs.lstatSync(join(f.targetRoot,'locales')).isSymbolicLink());assert(fs.lstatSync(join(f.targetRoot,'resources/assets')).isSymbolicLink());
});
test('the appended main integrity uses complete 4 MiB blocks and a separate trailing block',async t=>{
 const f=fixture(t,{large:true});await buildPrivateDesktop(f.options);const bytes=fs.readFileSync(join(f.targetRoot,'resources/app.asar')),parsed=parseAsarHeader(bytes),entry=parsed.header.files['.vite'].files.build.files['main-BPBEjAxi.js'],main=bytes.subarray(parsed.dataOffset+Number(entry.offset));
 assert.equal(entry.integrity.blocks.length,2);assert.equal(entry.integrity.hash,sha(main));assert.deepEqual(entry.integrity.blocks,[sha(main.subarray(0,4194304)),sha(main.subarray(4194304))]);
});
test('wrong pins, existing target and redirected target boundaries refuse before creating an installation',async t=>{
 for(const field of ['expectedPEHash','expectedASARHeaderHash','expectedMainHash']){const f=fixture(t);await assert.rejects(buildPrivateDesktop({...f.options,[field]:'0'.repeat(64)}),/hash|digest/i);assert.equal(fs.existsSync(f.targetRoot),false);}
 const f=fixture(t);fs.mkdirSync(f.targetRoot);await assert.rejects(buildPrivateDesktop(f.options),/fresh|exist/i);
 const g=fixture(t);await assert.rejects(buildPrivateDesktop({...g.options,targetRoot:join(g.sourceRoot,'nested')}),/disjoint|boundary/i);assert.equal(fs.existsSync(join(g.sourceRoot,'nested')),false);
});
test('resource lookup rejects malformed/missing tables rather than patching a decoy hash',()=>{
 const old='1'.repeat(64),next='2'.repeat(64),pe=peFixture(old),out=patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:old,newHeaderHash:next});assert.equal(out.bytes.subarray(0x700,0x740).toString(),old);assert.equal(out.bytes.indexOf(next),0x300+JSON.stringify([{file:'resources\\app.asar',alg:'SHA256',value:''}]).indexOf('"value":"')+9);
 const missing=Buffer.from(pe);missing.write('WrongType',0x282,'utf16le');assert.throws(()=>patchPEIntegrity(missing,{expectedPEHash:sha(missing),oldHeaderHash:old,newHeaderHash:next}),/resource/i);
 const invalid=Buffer.from(pe);invalid.writeUInt32LE(0x7fffffff,0x214);assert.throws(()=>patchPEIntegrity(invalid,{expectedPEHash:sha(invalid),oldHeaderHash:old,newHeaderHash:next}),/resource|range|bound/i);
});
test('resource names match the uppercase names actually stored in the current Windows PE',()=>{
 const pe=peFixture('1'.repeat(64),{uppercase:true});assert.doesNotThrow(()=>patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:'1'.repeat(64),newHeaderHash:'2'.repeat(64)}));
});
test('ASAR pickle bounds are validated and hardlink failures never silently copy',async t=>{
 const b=encodeAsarHeader({files:{}}),bad=Buffer.from(b);bad.writeUInt32LE(1,4);assert.throws(()=>parseAsarHeader(bad),/header|pickle/i);
 const f=fixture(t),original=fs.linkSync;try{fs.linkSync=()=>{throw Error('TEST_HARDLINK_REFUSED');};syncBuiltinESMExports();await assert.rejects(buildPrivateDesktop(f.options),/TEST_HARDLINK_REFUSED/);assert.equal(fs.existsSync(join(f.targetRoot,'chrome.dll')),false);}finally{fs.linkSync=original;syncBuiltinESMExports();}
});
test('explicit copy shares files independently with unchanged stock bytes and a declared disk budget',async t=>{
 const f=fixture(t),r=await buildPrivateDesktop({...f.options,shareStrategy:'copy'});assert.equal(r.shareStrategy,'copy');assert(r.copiedBytes>0);assert(r.copiedFileCount>=2);assert(r.physicalWriteBudgetBytes>=fs.statSync(join(f.targetRoot,'resources/app.asar')).size);assert(r.freeBeforeBytes-r.physicalWriteBudgetBytes>=r.minFreeAfterBytes);
 assert.notEqual(fs.statSync(join(f.sourceRoot,'chrome.dll')).ino,fs.statSync(join(f.targetRoot,'chrome.dll')).ino);assert.equal(fs.readFileSync(join(f.targetRoot,'chrome.dll'),'utf8'),'FUSES_MUST_STAY_UNCHANGED');assert(fs.lstatSync(join(f.targetRoot,'locales')).isSymbolicLink());assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);assert.equal(r.stockUnchanged,true);
});
test('typed copy strategy and insufficient budgets fail before creating the target',async t=>{
 for(const extra of [{shareStrategy:'auto'},{shareStrategy:'copy',maxCopiedBytes:1},{shareStrategy:'copy',maxCopiedBytes:'2000000000'},{shareStrategy:'copy',minFreeAfterBytes:'1073741824'},{shareStrategy:'copy',minFreeAfterBytes:Number.MAX_SAFE_INTEGER}]){const f=fixture(t);await assert.rejects(buildPrivateDesktop({...f.options,...extra}),/strategy|budget|space|integer/i);assert.equal(fs.existsSync(f.targetRoot),false);}
});
test('new private Windows builds declare only the two empty NVIDIA runtime directories before measurement',async t=>{
 const f=fixture(t),report=await buildPrivateDesktop(f.options),declared=['NVIDIA Corporation','NVIDIA Corporation/umdlogs'];
 assert.deepEqual(report.declaredRuntimeDirectories,declared);assert.deepEqual(JSON.parse(fs.readFileSync(join(f.targetRoot,'private-build.json'),'utf8')).declaredRuntimeDirectories,declared);
 for(const name of declared){const st=fs.lstatSync(join(f.targetRoot,name));assert(st.isDirectory());assert.equal(st.isSymbolicLink(),false);}
 assert.deepEqual(fs.readdirSync(join(f.targetRoot,declared[0])),['umdlogs']);assert.deepEqual(fs.readdirSync(join(f.targetRoot,declared[1])),[]);
 const measure=()=>measureDependencyTree({root:f.targetRoot,trustedLinkRoots:[{id:'stock',path:f.sourceRoot}]}),before=measure();
 for(const name of declared)fs.mkdirSync(join(f.targetRoot,name),{recursive:true});
 assert.deepEqual(measure(),before,'Recreating the declared empty directory layout must preserve the entire pinned tree');
 fs.writeFileSync(join(f.targetRoot,declared[1],'unexpected.log'),'new runtime bytes');assert.notEqual(measure().treeSha256,before.treeSha256);
 fs.unlinkSync(join(f.targetRoot,declared[1],'unexpected.log'));fs.mkdirSync(join(f.targetRoot,declared[1],'new-child'));assert.notEqual(measure().treeSha256,before.treeSha256);
 assert.equal(report.stockUnchanged,true);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);
});
test('a reserved runtime directory inherited from stock is refused before building instead of accepting existing content',async t=>{
 for(const entry of ['file','directory','populated-directory']){
  const f=fixture(t),reserved=join(f.sourceRoot,'NVIDIA Corporation');
  if(entry==='file')fs.writeFileSync(reserved,'');else{fs.mkdirSync(reserved);if(entry==='populated-directory')fs.writeFileSync(join(reserved,'existing.log'),'must not enter the private runtime');}
  await assert.rejects(buildPrivateDesktop(f.options),/declared runtime|reserved runtime/i);assert.equal(fs.existsSync(f.targetRoot),false);
 }
});

function ownerFixture(t){
 const f=fixture(t,{large:true}),parsed=parseAsarHeader(f.archive),bootstrapPath='.vite/build/bootstrap-BYjpvKBK.js';
 const bootstrap=Buffer.from('const e=require("./rolldown-runtime-CPUxUITh.js");const y=require("electron"),n={r:()=>"com.openai.codex"},vI="prod",xI=null;function PN({env}){return env.CODEX_ELECTRON_USER_DATA_PATH};y.app.setPath(`userData`,PN({appDataPath:y.app.getPath(`appData`),buildFlavor:vI,env:process.env}));y.app.setAppUserModelId(n.r(vI));y.app.requestSingleInstanceLock({startupTask:xI===`startup-task`});function unusedDiagnosticFixture(){let o;try{}catch(r){for(let e of y.BrowserWindow.getAllWindows())e.isDestroyed()||e.destroy();l.r().error(`Desktop bootstrap failed to start the main app`,{safe:o})}}'+' '.repeat(4194304));
 parsed.header.files['.vite'].files.build.files['bootstrap-BYjpvKBK.js']={size:bootstrap.length,offset:String(f.main.length+f.other.length),integrity:{algorithm:'SHA256',hash:sha(bootstrap),blockSize:4194304,blocks:[]}};
 const earlyBootstrapPath='.vite/build/early-bootstrap.js',early=Buffer.from('require("./rolldown-runtime-CPUxUITh.js");require("./bootstrap-BYjpvKBK.js");'+' '.repeat(4194304)),pkg=Buffer.from(JSON.stringify({main:earlyBootstrapPath}));
 parsed.header.files['.vite'].files.build.files['early-bootstrap.js']={size:early.length,offset:String(f.main.length+f.other.length+bootstrap.length)};parsed.header.files['package.json']={size:pkg.length,offset:String(f.main.length+f.other.length+bootstrap.length+early.length)};
 const prefix=encodeAsarHeader(parsed.header),header=parseAsarHeader(prefix);f.archive=Buffer.concat([prefix,f.main,f.other,bootstrap,early,pkg]);f.pe=peFixture(header.headerSha256);
 fs.writeFileSync(join(f.sourceRoot,'resources/app.asar'),f.archive);fs.writeFileSync(join(f.sourceRoot,'ChatGPT.exe'),f.pe);
 const nativeBin=join(f.root,'.agent-workflow/global/bin');fs.mkdirSync(nativeBin,{recursive:true});
 const ownerBinding={profilePath:'C:/Users/Fixture/.agent-workflow/global/state/desktop-profile',codexHome:'C:/Users/Fixture/.agent-workflow/global/state/desktop-home',gatewayUrl:url,runtimeCliPath:'C:/Fixture/native/codex.exe',launcherPath:process.platform==='win32'?join(nativeBin,'Launch-Codex-Controlled.exe'):'C:/Users/Fixture/.agent-workflow/global/bin/Launch-Codex-Controlled.exe'};
 Object.assign(f.options,{expectedPEHash:sha(f.pe),expectedASARHeaderHash:header.headerSha256,expectedBootstrapHash:sha(bootstrap),bootstrapPath,expectedEarlyBootstrapHash:sha(early),earlyBootstrapPath,ownerBinding});return {...f,bootstrap,early};
}
test('owner-bound build appends all three entries with full block hashes while original data, other offsets and stock PE remain unchanged',{skip:process.platform!=='win32'?'private Windows executable path binding':false},async t=>{
 const f=ownerFixture(t),r=await buildPrivateDesktop(f.options),out=fs.readFileSync(join(f.targetRoot,'resources/app.asar')),p=parseAsarHeader(out),original=parseAsarHeader(f.archive),data=f.archive.subarray(original.dataOffset);
 assert.equal(r.ownerBindingApplied,true);assert.equal(r.ownerBoundaryVersion,4);assert.equal(r.packageMain,'.vite/build/early-bootstrap.js');assert.equal(r.earlyBootstrapPath,r.packageMain);assert.equal(r.sourceEarlyBootstrapSha256,sha(f.early));assert.equal(r.bootstrapPath,'.vite/build/bootstrap-BYjpvKBK.js');assert.equal(r.sourceBootstrapSha256,sha(f.bootstrap));assert.equal(p.header.files['other.txt'].offset,String(f.main.length));assert.deepEqual(out.subarray(p.dataOffset,p.dataOffset+data.length),data);
 assert.equal(r.windowIdentity,'process-aumid-and-verified-shortcut');assert.equal(r.ownerExecutable,fs.realpathSync.native(join(f.targetRoot,'ChatGPT.exe')));assert.equal(Object.hasOwn(r,'windowMetadataBridge'),false);assert.equal(fs.existsSync(join(f.targetRoot,'resources/agent-workflow')),false);assert.equal(fs.existsSync(f.options.ownerBinding.launcherPath),false);

 let next=data.length;for(const name of ['main-BPBEjAxi.js','bootstrap-BYjpvKBK.js','early-bootstrap.js']){const e=p.header.files['.vite'].files.build.files[name],bytes=out.subarray(p.dataOffset+Number(e.offset),p.dataOffset+Number(e.offset)+e.size);assert.equal(Number(e.offset),next);next+=e.size;assert.equal(e.integrity.hash,sha(bytes));assert.equal(e.integrity.blockSize,4194304);assert.deepEqual(e.integrity.blocks,[sha(bytes.subarray(0,4194304)),sha(bytes.subarray(4194304))]);if(name==='early-bootstrap.js')assert.equal(sha(bytes),r.earlyBootstrapSha256);}
 assert.equal(out.length,p.dataOffset+next);assert.equal(r.privateHeaderSha256,p.headerSha256);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'ChatGPT.exe')),f.pe);
 assert.deepEqual(patchPEIntegrity(fs.readFileSync(join(f.targetRoot,'ChatGPT.exe')),{expectedPEHash:r.privatePESha256,oldHeaderHash:p.headerSha256,newHeaderHash:original.headerSha256}).bytes,f.pe);assert.deepEqual(r.declaredRuntimeDirectories,['NVIDIA Corporation','NVIDIA Corporation/umdlogs']);
 assert(r.physicalWriteBudgetBytes>=out.length);assert.equal(r.uiLaunched,false);
});
test('owner-bound source requires both separate bootstrap pins, matching fixed gateway binding and complete three-entry budget before target creation',async t=>{
 for(const extra of [{expectedBootstrapHash:undefined},{expectedBootstrapHash:'0'.repeat(64)},{expectedEarlyBootstrapHash:undefined},{expectedEarlyBootstrapHash:'0'.repeat(64)},{earlyBootstrapPath:mainPath},{bootstrapPath:mainPath},{ownerBinding:{gatewayUrl:'ws://127.0.0.1:14231/workflow/'+'b'.repeat(64)}},{maxCopiedBytes:15*1024*1024}]){
  const f=ownerFixture(t),options={...f.options,...extra};if(extra.ownerBinding)options.ownerBinding={...f.options.ownerBinding,...extra.ownerBinding};await assert.rejects(buildPrivateDesktop(options),/bootstrap|binding|gateway|budget/i);assert.equal(fs.existsSync(f.targetRoot),false);
 }
});
test('owner-bound builder rejects package.main pointing to the late bootstrap before writing target',async t=>{
 const f=ownerFixture(t),p=parseAsarHeader(f.archive),e=p.header.files['package.json'],data=Buffer.from(f.archive.subarray(p.dataOffset)),wrong=Buffer.from(JSON.stringify({main:'.vite/build/bootstrap-BYjpvKBK.js'}));
 const extra=Buffer.concat([data,wrong]);e.offset=String(data.length);e.size=wrong.length;
 const prefix=encodeAsarHeader(p.header),header=parseAsarHeader(prefix),archive=Buffer.concat([prefix,extra]),pe=peFixture(header.headerSha256);fs.writeFileSync(join(f.sourceRoot,'resources/app.asar'),archive);fs.writeFileSync(join(f.sourceRoot,'ChatGPT.exe'),pe);
 await assert.rejects(buildPrivateDesktop({...f.options,expectedASARHeaderHash:header.headerSha256,expectedPEHash:sha(pe)}),/package|entry|main/i);assert.equal(fs.existsSync(f.targetRoot),false);
});
test('owner bridge resource reservation refuses stock collisions before a target or compiled bridge is created',async t=>{
 for(const kind of ['file','directory']){const f=ownerFixture(t),reserved=join(f.sourceRoot,'resources/agent-workflow');if(kind==='file')fs.writeFileSync(reserved,'PRESERVE');else fs.mkdirSync(reserved);await assert.rejects(buildPrivateDesktop(f.options),/reserved.*bridge|bridge.*resource/i);assert.equal(fs.existsSync(f.targetRoot),false);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);}
});
test('historical standalone bridge: actual hidden native WM_DESTROY can synchronously clear and independently read back before base destruction, while cancelled close retains binding',{skip:process.platform!=='win32'?'actual native destruction test requires Windows':false},t=>{
 const f=fixture(t),bin=join(f.root,'.agent-workflow/global/bin');fs.mkdirSync(bin,{recursive:true});const owner=join(f.root,'DestroyOwner.exe'),compiled=compileWindowMetadataBridge({outputPath:join(f.root,'DestroyBridge.exe'),ownerExecutable:owner,launcherPath:join(bin,'Launch-Codex-Controlled.exe')});
 const literal=value=>JSON.stringify(value).replace(/[^\x20-\x7e]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 const code=`using System;using System.Diagnostics;using System.Windows.Forms;using System.Runtime.InteropServices;
[assembly:DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
[StructLayout(LayoutKind.Sequential,Pack=4)]struct Key{public Guid fmt;public uint id;}
[StructLayout(LayoutKind.Explicit,Size=24)]struct Value{[FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr pointer;[FieldOffset(16)]public IntPtr pad;}
[ComImport,Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface Store{[PreserveSig]int GetCount(out uint count);[PreserveSig]int GetAt(uint i,out Key key);[PreserveSig]int GetValue(ref Key key,out Value value);[PreserveSig]int SetValue(ref Key key,ref Value value);[PreserveSig]int Commit();}
class DestroyProbe:Form{
 [DllImport("shell32.dll",ExactSpelling=true)]static extern int SHGetPropertyStoreForWindow(IntPtr w,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out Store store);
 [DllImport("ole32.dll",ExactSpelling=true)]static extern int PropVariantClear(ref Value value);
 [DllImport("user32.dll",ExactSpelling=true)]static extern int IsWindow(IntPtr window);
 static string Bridge=${literal(compiled.executablePath)};static string[] Expected={${[JSON.stringify('"'+compiled.binding.launcherPath+'"'),JSON.stringify(compiled.binding.displayName),JSON.stringify(compiled.binding.iconPath+',0'),JSON.stringify(compiled.binding.appId)].map(s=>literal(JSON.parse(s))).join(',')}};static uint[] Ids={2,4,3,5};public int DestroyCount;public bool ClearedBeforeBase;public bool CallbackFailure;
 static bool Check(IntPtr window,bool empty){Store store;Guid iid=typeof(Store).GUID;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window,ref iid,out store));try{for(int i=0;i<4;i++){var key=new Key{fmt=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),id=Ids[i]};var value=new Value();try{Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));if(empty?value.type!=0:(value.type!=31||Marshal.PtrToStringUni(value.pointer)!=Expected[i]))return false;}finally{PropVariantClear(ref value);}}return true;}finally{Marshal.FinalReleaseComObject(store);}}
 static bool Call(string operation,IntPtr window){string args=operation+" "+unchecked((ulong)window.ToInt64()).ToString("x16")+" "+Process.GetCurrentProcess().Id;var info=new ProcessStartInfo(Bridge,args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};info.EnvironmentVariables.Clear();info.EnvironmentVariables["SystemRoot"]=@"C:\\Windows";info.EnvironmentVariables["WINDIR"]=@"C:\\Windows";info.EnvironmentVariables["PATH"]=@"C:\\Windows\\System32";using(var child=Process.Start(info)){if(!child.WaitForExit(3000)){child.Kill();child.WaitForExit();return false;}return child.ExitCode==0&&child.StandardError.ReadToEnd().Length==0&&child.StandardOutput.ReadToEnd().Contains("\\\"ok\\\":true");}}
 protected override void WndProc(ref Message message){if(message.Msg==2){DestroyCount++;try{ClearedBeforeBase=IsWindow(message.HWnd)!=0&&Call("clear",message.HWnd)&&Check(message.HWnd,true);if(!ClearedBeforeBase)CallbackFailure=true;}catch{CallbackFailure=true;}}base.WndProc(ref message);}
 [STAThread]static int Main(){try{using(var form=new DestroyProbe()){form.ShowInTaskbar=false;var handle=form.Handle;if(form.Visible||!Call("set",handle)||!Check(handle,false))return 11;FormClosingEventHandler cancel=(sender,e)=>{e.Cancel=true;};form.FormClosing+=cancel;form.Close();if(form.IsDisposed||form.DestroyCount!=0||!Check(handle,false))return 12;form.FormClosing-=cancel;form.Close();if(!form.IsDisposed||form.DestroyCount!=1||!form.ClearedBeforeBase||form.CallbackFailure)return 13;Console.WriteLine("PASS:cancelled-close-retained;wm-destroy-before-base-clear-and-independent-readback");return 0;}}catch{return 14;}}
}`;
 const source=join(f.root,'destroy-owner.cs');fs.writeFileSync(source,code);const framework='C:/Windows/Microsoft.NET/Framework64/v4.0.30319',env={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',TEMP:f.root,TMP:f.root},built=spawnSync(join(framework,'csc.exe'),['/nologo','/noconfig','/nostdlib+','/platform:x64','/target:exe','/warnaserror+',...['mscorlib.dll','System.dll','System.Windows.Forms.dll','System.Drawing.dll'].map(name=>'/r:'+join(framework,name)),'/out:'+owner,source],{env,cwd:f.root,windowsHide:true,encoding:'utf8',timeout:15000});assert.equal(built.status,0,built.stdout+built.stderr);
 const result=spawnSync(owner,[],{env,cwd:f.root,windowsHide:true,encoding:'utf8',timeout:10000,maxBuffer:4096});assert.equal(result.status,0,'Native destruction fixture status '+result.status+': '+result.stdout+result.stderr);assert.match(result.stdout,/cancelled-close-retained;wm-destroy-before-base-clear-and-independent-readback/);assert.equal(result.stderr,'');
});

test('v4 builder rejects legacy bridge fields before writing a target',async t=>{
 const f=ownerFixture(t);await assert.rejects(buildPrivateDesktop({...f.options,windowMetadataBridge:{}}),/legacy|bridge|field/i);assert.equal(fs.existsSync(f.targetRoot),false);
});
