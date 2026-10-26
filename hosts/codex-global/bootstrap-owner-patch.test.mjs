import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
const api=await import('./bootstrap-owner-patch.mjs').catch(error=>{if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return {};});
const sha=value=>createHash('sha256').update(value).digest('hex');
const catchAnchor='catch(r){for(let e of y.BrowserWindow.getAllWindows())e.isDestroyed()||e.destroy();l.r().error(`Desktop bootstrap failed to start the main app`,{safe:o})';
const source='const e=require("./rolldown-runtime-CPUxUITh.js");const y=require("electron"),n={r:()=>"com.openai.codex"},vI="prod",xI=null;function PN({env}){return env.CODEX_ELECTRON_USER_DATA_PATH||"STOCK_PROFILE"};y.app.setPath(`userData`,PN({appDataPath:y.app.getPath(`appData`),buildFlavor:vI,env:process.env}));y.app.setAppUserModelId(n.r(vI));y.app.requestSingleInstanceLock({startupTask:xI===`startup-task`});globalThis.originalStarted=true;function diagnosticFixture(error){let o={};try{throw error;}'+catchAnchor+';}}';
const binding={profilePath:'C:/Users/Fixture/.agent-workflow/global/state/desktop-profile',codexHome:'C:/Users/Fixture/.agent-workflow/global/state/desktop-home',gatewayUrl:'ws://127.0.0.1:14231/workflow/'+'a'.repeat(64),runtimeCliPath:'C:/Fixture/native/codex.exe',launcherPath:'C:/Users/Fixture/.agent-workflow/global/bin/Launch-Codex-Controlled.exe'};
const ownerExecutable='C:/Fixture/private/ChatGPT.exe';
const validEnv=()=>({CODEX_ELECTRON_USER_DATA_PATH:binding.profilePath,CODEX_HOME:binding.codexHome,CODEX_APP_SERVER_WS_URL:binding.gatewayUrl,CODEX_APP_RUNTIME_CLI_PATH:binding.runtimeCliPath,CODEX_CHROME_USER_DATA_DIR:binding.profilePath,SYSTEMROOT:'C:/Windows'});
function run(code,env=validEnv(),args=[],late,withoutWindowApis=false){
 const app=new EventEmitter(),calls={imports:[],ids:[],locks:0,relaunch:0,stderr:[],events:[],order:[]};
 Object.assign(app,{getPath:()=> 'C:/Users/Fixture/AppData/Roaming',setPath(){},setAppUserModelId(id){calls.ids.push(id);calls.order.push('app-id');},requestSingleInstanceLock(){calls.locks++;calls.order.push('lock');return true;},relaunch(){calls.relaunch++;},exit:code=>{calls.exitCode=code;}});
 const earlyModule={exports:{}},module={exports:{}},earlyPath='C:/Fixture/private/resources/app.asar/.vite/build/early-bootstrap.js';
 const electron=withoutWindowApis?{app}:{app,BrowserWindow:{getAllWindows:()=>[]}};
 const req=spec=>{calls.imports.push(spec);calls.order.push('import:'+spec);if(spec.startsWith('node:'))throw Error('V4_UNEXPECTED_NATIVE_DEPENDENCY');if(spec==='electron')return electron;if(spec==='./bootstrap-BYjpvKBK.js'&&late){context.module=module;vm.runInContext(late,context);return module.exports;}return {};};
 req.resolve=spec=>{assert.equal(spec,'./early-bootstrap.js');return earlyPath;};req.cache={[earlyPath]:earlyModule};
 const context=vm.createContext({process:{env,argv:[ownerExecutable,...args],execArgv:[],execPath:ownerExecutable,platform:'win32',stderr:{write:text=>{calls.stderr.push(text);calls.events.push('stderr');}}},module:late?earlyModule:module,require:req,l:{r:()=>({error(){calls.events.push('vendor-catch');}})}});
 let error;try{vm.runInContext(code,context);}catch(e){error=e;}return {app,calls,context,error};
}
const early='require("./rolldown-runtime-CPUxUITh.js");globalThis.earlyStarted=true;process.env.CODEX_SHELL="1";require("./bootstrap-BYjpvKBK.js");';
function patched(text=source,ownerBinding=binding){assert.equal(typeof api.patchEarlyBootstrapOwner,'function','The true package entry boundary must be implemented');const result=api.patchEarlyBootstrapOwner(early,{ownerBinding,ownerExecutable,expectedHash:sha(early)});return {...result,lateSource:api.patchBootstrapOwner(text,{ownerBinding,ownerExecutable,expectedHash:sha(text)}).source};}
function runOwner(result=patched(),env=validEnv(),args=[],withoutWindowApis=false){return run(result.source,env,args,result.lateSource,withoutWindowApis);}
test('invalid owner environment is denied before all imports, lock and original startup',()=>{
 const baseline=run(source,{});assert.equal(baseline.calls.locks,1,'The unpatched fixture demonstrates the unsafe stock-domain admission');
 const result=patched();
 for(const key of ['CODEX_ELECTRON_USER_DATA_PATH','CODEX_HOME','CODEX_APP_SERVER_WS_URL','CODEX_APP_RUNTIME_CLI_PATH'])for(const value of [undefined,'wrong']){
  const env=validEnv();if(value===undefined)delete env[key];else env[key]=value;
  const r=runOwner(result,env);assert.match(r.error?.message??'',/owner|controlled|environment/i);assert.equal(r.calls.imports.length,0);assert.equal(r.calls.locks,0);assert.equal(r.context.originalStarted,undefined);assert.equal(r.context.earlyStarted,undefined);
 }
});
test('valid owner environment reaches original startup and writes only the independent AUMID',()=>{
 const r=runOwner();assert.equal(r.error,undefined);assert.equal(r.calls.locks,1);assert.equal(r.context.originalStarted,true);assert.equal(r.context.earlyStarted,true);assert.equal(r.calls.ids.length,1);assert(r.calls.ids.every(id=>id==='AgentWorkflow.Codex.Guarded'));assert.equal(r.app.listenerCount('browser-window-created'),0);
});
test('preload, native fallback, unknown CODEX variables, duplicate key aliases and extra arguments deny before import',()=>{
 for(const key of ['CODEX_APP_SERVER_FORCE_CLI','CODEX_UNKNOWN_OVERRIDE','CODEX_APP_TOOLS_PIPE_PATH','FORCE_CLI','NODE_OPTIONS','NODE_PATH','NODE_REPL_HOST_SERVICES_PIPE_PATH','ELECTRON_RUN_AS_NODE','ELECTRON_NO_ASAR','LD_PRELOAD','DYLD_INSERT_LIBRARIES']){
  const r=runOwner(patched(),{...validEnv(),[key]:'1'});assert(r.error,key);assert.equal(r.calls.imports.length,0,key);assert.equal(r.calls.locks,0,key);
 }
 for(const env of [{...validEnv(),codex_home:binding.codexHome},{...validEnv(),CODEX_CHROME_USER_DATA_DIR:'C:/Wrong'},{...validEnv(),CODEX_SHELL:'1'}])assert.equal(runOwner(patched(),env).calls.imports.length,0);
 const r=runOwner(patched(),validEnv(),['codex://untrusted']);assert(r.error);assert.equal(r.calls.imports.length,0);
});
test('the exact vendor main-startup catch emits only a fixed branch and safe error type before its original handling',()=>{
 const r=runOwner();assert.equal(r.error,undefined);const error=Object.assign(Error('SYNTHETIC_SECRET_MESSAGE'),{name:'ReferenceError'});Object.defineProperty(error,'stack',{value:'SYNTHETIC_SECRET_STACK\n    at throwing (C:/SYNTHETIC_SECRET_PATH/main-BPBEjAxi.js:1444:123)\n    at other (C:/SYNTHETIC_SECRET_PATH/evil.js:1:2)'});r.context.diagnosticFixture(error);
 assert.deepEqual(r.calls.events,['stderr','vendor-catch']);assert.match(r.calls.stderr.join(''),/MAIN_BOOTSTRAP_FAILED name=ReferenceError frame=main-BPBEjAxi.js:1444:123/);assert(!r.calls.stderr.join('').includes('SYNTHETIC_SECRET'));
});
test('diagnostics never invoke name or stack getters and never print an unapproved source frame',()=>{
 const r=runOwner();let getters=0;const error={};Object.defineProperties(error,{name:{get(){getters++;return 'TypeError';}},stack:{get(){getters++;return 'SYNTHETIC_SECRET_GETTER';}}});r.context.diagnosticFixture(error);assert.equal(getters,0);assert.match(r.calls.stderr.join(''),/name=Unknown frame=unknown/);
 for(const stack of ['SYNTHETIC_SECRET_MESSAGE main-BPBEjAxi.js:1444:123','Error: SYNTHETIC_SECRET_MESSAGE\n    at fake (C:/SYNTHETIC_SECRET_PATH/not-allowed.js:12:34)','Error: SYNTHETIC_SECRET_MESSAGE\n    at fake (C:/SYNTHETIC_SECRET_PATH/main-BPBEjAxi.js:not:a-number)']){
  r.calls.stderr.length=0;r.context.diagnosticFixture({name:'TypeError',stack});const output=r.calls.stderr.join('');assert.match(output,/name=TypeError frame=unknown/);assert(!output.includes('SYNTHETIC_SECRET'));assert(!output.includes('not-allowed'));
 }
});
test('own data-only messages map fixed failure templates to constant classifications without outputting the original text',()=>{
 const r=runOwner(),cases=[['Cannot assign to read only property \'relaunch\' of object \'#<App>\'','readonly_relaunch'],['受控 Codex 禁止直接重启；请退出后从 Codex（受控流程）入口重新打开','readonly_relaunch'],['Cannot redefine property: relaunch','redefine_relaunch'],['Cannot assign to read only property \'exports\' of object \'#<Module>\'','readonly_exports'],['Cannot add property fixture, object is not extensible','object_not_extensible'],['window.setAppDetails is not a function','set_app_details_not_function'],['Other failure','other']];
 for(const [message,classification]of cases){r.calls.stderr.length=0;r.context.diagnosticFixture({name:'TypeError',message:message+' SYNTHETIC_SECRET_TAIL'});const text=r.calls.stderr.join('');assert(text.includes(`messageClass=${classification}`),classification);assert(!text.includes('SYNTHETIC_SECRET'));assert(!text.includes(message));}
});
test('message classifiers never call getters, inherited messages or coercion and expose only other for them',()=>{
 const r=runOwner();let reads=0;const accessor={name:'TypeError'};Object.defineProperty(accessor,'message',{get(){reads++;return 'Cannot redefine property: relaunch SYNTHETIC_SECRET';}});
 const inherited=Object.assign(Object.create({message:'Cannot redefine property: relaunch SYNTHETIC_SECRET'}),{name:'TypeError'}),objectValue={name:'TypeError',message:{toString(){reads++;return 'SYNTHETIC_SECRET';}}};
 for(const error of [accessor,inherited,objectValue]){r.calls.stderr.length=0;r.context.diagnosticFixture(error);const text=r.calls.stderr.join('');assert(text.includes('messageClass=other'));assert(!text.includes('SYNTHETIC_SECRET'));}assert.equal(reads,0);
});
test('late-only import rejects before vendor imports even with apparently valid environment',()=>{
 const late=api.patchBootstrapOwner(source,{ownerBinding:binding,ownerExecutable,expectedHash:sha(source)}).source;
 const r=run(late,{...validEnv(),CODEX_SHELL:'1'});assert.match(r.error?.message??'',/owner|entry|marker|controlled/i);assert.equal(r.calls.locks,0);assert.equal(r.context.originalStarted,undefined);assert(!r.calls.imports.includes('./rolldown-runtime-CPUxUITh.js'));
});
test('shell mutation after the true entry cannot replace owner paths, route, argv or dangerous preload environment',()=>{
 const result=patched();
 for(const mutation of ['process.env.CODEX_HOME="C:/Wrong"','process.env.CODEX_ELECTRON_USER_DATA_PATH="C:/Wrong"','process.env.CODEX_CHROME_USER_DATA_DIR="C:/Wrong"','process.env.CODEX_APP_RUNTIME_CLI_PATH="C:/Wrong.exe"','process.env.CODEX_APP_SERVER_WS_URL="ws://127.0.0.1:2/wrong"','process.env.CODEX_SHELL="2"','process.env.CODEX_UNKNOWN="1"','process.env.NODE_OPTIONS="--require evil"','process.env.ELECTRON_NO_ASAR="1"','process.env.LD_PRELOAD="evil"','process.env.DYLD_INSERT_LIBRARIES="evil"','process.argv.push("--bad")','process.execArgv.push("--inspect")']){
  const changed=early.replace('process.env.CODEX_SHELL="1";',`process.env.CODEX_SHELL="1";${mutation};`),earlyResult=api.patchEarlyBootstrapOwner(changed,{ownerBinding:binding,ownerExecutable,expectedHash:sha(changed)}),r=runOwner({...earlyResult,lateSource:result.lateSource});
  assert(r.error,mutation);assert.equal(r.calls.locks,0,mutation);assert.equal(r.context.originalStarted,undefined,mutation);assert.equal(r.calls.ids.length,1);
 }
});
test('immutable process marker is bound to the actual package entry module and cannot be reconfigured or installed twice',()=>{
 const result=patched(),r=runOwner(result);assert.equal(r.error,undefined);
 const symbols=Object.getOwnPropertySymbols(r.context.process);assert.equal(symbols.length,1);const d=Object.getOwnPropertyDescriptor(r.context.process,symbols[0]);assert.equal(d.writable,false);assert.equal(d.configurable,false);assert(Object.isFrozen(d.value));
 assert.throws(()=>Object.defineProperty(r.context.process,symbols[0],{value:{}}),TypeError);
 assert.throws(()=>vm.runInContext(result.source,r.context),/owner|entry|marker|controlled/i);assert.equal(r.calls.ids.length,1);
 const fakeRecord=JSON.stringify(d.value),fake=run(`Object.defineProperty(process,Symbol.for("AgentWorkflow.Codex.OwnerEntry.v4"),{value:Object.freeze(Object.assign(Object.create(null),${fakeRecord})),configurable:false,writable:false});`+result.lateSource,{...validEnv(),CODEX_SHELL:'1'});assert(fake.error);assert.equal(fake.calls.locks,0);assert(!fake.calls.imports.includes('./rolldown-runtime-CPUxUITh.js'),'Even a matching immutable process object lacks real entry-module identity');
});
test('the old late-only ordering reproduces the internal CODEX_SHELL rejection after vendor work has already started',()=>{
 // This is the former boundary contract, not a fabricated current success:
 // allow only the four owner variables and optional Chrome override, then fail
 // on the exact key that the pinned pre-bootstrap shell loader introduces.
 const oldLate='(()=>{for(const key of Object.keys(process.env)){if(key.startsWith("CODEX_")&&!["CODEX_ELECTRON_USER_DATA_PATH","CODEX_HOME","CODEX_APP_SERVER_WS_URL","CODEX_APP_RUNTIME_CLI_PATH","CODEX_CHROME_USER_DATA_DIR"].includes(key))throw Error("LEGACY_UNKNOWN_CODEX");}})();';
 const r=run(early,validEnv(),[],oldLate+source);assert.equal(r.error?.message,'LEGACY_UNKNOWN_CODEX');assert.equal(r.context.earlyStarted,true);assert(r.calls.imports.includes('./rolldown-runtime-CPUxUITh.js'));assert.equal(r.calls.locks,0);
 const repaired=runOwner();assert.equal(repaired.error,undefined);assert.equal(repaired.calls.locks,1);assert.equal(repaired.calls.ids.length,1);
});
test('true entry unique anchors and independent stock pin fail closed',()=>{
 assert.equal(typeof api.patchEarlyBootstrapOwner,'function');assert.equal(api.INSTALLED_EARLY_BOOTSTRAP_SHA256,'301b4e0d29166d6494984255a9a59d54d21f4a66cf909be8a24611dc4e7235db');
 for(const anchor of ['require("./rolldown-runtime-CPUxUITh.js");','require("./bootstrap-BYjpvKBK.js")'])for(const changed of [early.replace(anchor,'void 0;'),early+';'+anchor])assert.throws(()=>api.patchEarlyBootstrapOwner(changed,{ownerBinding:binding,expectedHash:sha(changed)}),/anchor/i);
 assert.throws(()=>api.patchEarlyBootstrapOwner(early,{ownerBinding:binding}),/hash/i);assert.throws(()=>api.patchEarlyBootstrapOwner(' '+early,{ownerBinding:binding,expectedHash:sha(' '+early)}),/byte zero|anchor/i);
});
test('all pinned bootstrap anchors must be unique and mismatched source hashes fail closed',()=>{
 const anchors=['const e=require("./rolldown-runtime-CPUxUITh.js")','y.app.setPath(`userData`,PN({appDataPath:y.app.getPath(`appData`),buildFlavor:vI,env:process.env}))','y.app.setAppUserModelId(n.r(vI))','y.app.requestSingleInstanceLock({startupTask:xI===`startup-task`})',catchAnchor];
 for(const anchor of anchors){assert.throws(()=>patched(source.replace(anchor,'void 0')),/anchor/i);assert.throws(()=>patched(source+';'+anchor),/anchor/i);}
 assert.throws(()=>api.patchBootstrapOwner(source,{ownerBinding:binding,expectedHash:'0'.repeat(64)}),/hash/i);
 assert.throws(()=>api.patchBootstrapOwner(source,{ownerBinding:binding}),/hash/i,'A synthetic or changed source cannot use the production vendor pin');
});
test('owner binding refuses arbitrary launcher paths, legacy scripts, loose URLs and path injection',()=>{
 for(const extra of [{wrapperPath:'C:/Other.ps1'},{wrapperPath:binding.wrapperPath+'" -Command evil'},{powershellPath:'C:/Fake/powershell.exe'},{gatewayUrl:'ws://localhost:14231/workflow/'+'a'.repeat(64)},{profilePath:'relative'},{codexHome:'C:/one/../two'},{runtimeCliPath:'C:/x\n/codex.exe'},{unknown:'value'}])assert.throws(()=>patched(source,{...binding,...extra}),/binding|path|PowerShell|loopback|field/i);
});
test('v4 owner binding admits only the fixed native launcher without PowerShell fields or arbitrary arguments',()=>{
 const native={profilePath:binding.profilePath,codexHome:binding.codexHome,gatewayUrl:binding.gatewayUrl,runtimeCliPath:binding.runtimeCliPath,launcherPath:'C:/Users/Fixture/.agent-workflow/global/bin/Launch-Codex-Controlled.exe'};
 assert.doesNotThrow(()=>api.validateOwnerBinding(native));assert.equal(api.OWNER_BOUNDARY_VERSION,4);
 for(const extra of [{launcherPath:'C:/Other.exe'},{launcherPath:native.launcherPath+' --config evil'},{powershellPath:binding.powershellPath},{wrapperPath:binding.wrapperPath}])assert.throws(()=>api.validateOwnerBinding({...native,...extra}),/binding|launcher|field|path/i);
});

test('v4 stock startup needs no BrowserWindow APIs, bridge or window hooks and sets AppID before original imports and lock',()=>{
 const r=runOwner(patched(),validEnv(),[],true);assert.equal(r.error,undefined);assert.equal(r.context.originalStarted,true);assert.equal(r.context.earlyStarted,true);assert.equal(r.calls.locks,1);assert.equal(r.app.listenerCount('browser-window-created'),0);assert.doesNotThrow(()=>r.app.emit('browser-window-created',{},Object.freeze({})));assert(r.calls.order.indexOf('app-id')<r.calls.order.indexOf('import:./rolldown-runtime-CPUxUITh.js'));assert(r.calls.order.indexOf('app-id')<r.calls.order.indexOf('lock'));assert(!r.calls.imports.some(x=>x.startsWith('node:')));assert.equal(api.OWNER_WINDOW_IDENTITY,'process-aumid-and-verified-shortcut');
});
test('v4 rejects explicit legacy bridge options and binds actual executable before original imports',()=>{
 for(const [fn,text]of [[api.patchEarlyBootstrapOwner,early],[api.patchBootstrapOwner,source]])for(const extra of [{windowMetadataBridge:{}},{windowMetadataBridge:undefined},{ownerExecutable:'C:/Wrong.exe'},{ownerExecutable:undefined},{ownerExecutable:'C:/x/../ChatGPT.exe'}])assert.throws(()=>fn(text,{ownerBinding:binding,ownerExecutable,expectedHash:sha(text),...extra}),/bridge|field|path|executable/i);
 const result=patched(),r=run('process.execPath="C:/Wrong/ChatGPT.exe";'+result.source);assert(r.error);assert.equal(r.calls.imports.length,0);
 assert(!result.source.includes('Window-Metadata-Bridge'));assert(!result.source.includes('hookWindowMessage'));assert(!result.source.includes('ExecutionPolicy'));assert(!result.source.includes('.ps1'));
});
