// Fixed-version private Windows bootstrap transform. This is an entry binding,
// not authentication or a sandbox; native flags/preloads processed before JS
// remain the trusted launcher's responsibility. Never executes vendor code.
import {createHash} from 'node:crypto';
import {win32} from 'node:path';
import {windowMetadataBridgeRuntimeFactory} from './window-metadata-bridge.mjs';
export const INSTALLED_BOOTSTRAP_SHA256='3081dd9f7fdf0eba02d8caf99becb6f891e7bd9a3b1f7345537eb10165e16ff1';
export const INSTALLED_EARLY_BOOTSTRAP_SHA256='301b4e0d29166d6494984255a9a59d54d21f4a66cf909be8a24611dc4e7235db';
export const OWNER_BOUNDARY_VERSION=4;
export const OWNER_APP_ID='AgentWorkflow.Codex.Guarded';
export const OWNER_WINDOW_IDENTITY='process-aumid-and-verified-shortcut';
const sha=value=>createHash('sha256').update(value).digest('hex');
const anchors=[
 ['First vendor import','const e=require("./rolldown-runtime-CPUxUITh.js")'],
 ['Profile binding','y.app.setPath(`userData`,PN({appDataPath:y.app.getPath(`appData`),buildFlavor:vI,env:process.env}))'],
 ['Stock AUMID','y.app.setAppUserModelId(n.r(vI))'],
 ['Single instance lock','y.app.requestSingleInstanceLock({startupTask:xI===`startup-task`})'],
 ['Main bootstrap failure','catch(r){for(let e of y.BrowserWindow.getAllWindows())e.isDestroyed()||e.destroy();l.r().error(`Desktop bootstrap failed to start the main app`,{safe:o})']
];
const absolute=(value,label)=>{
 if(typeof value!=='string'||!win32.isAbsolute(value)||!/^([A-Za-z]:)[\\/]/.test(value)||/[\x00-\x1f"<>|?*]/.test(value)||value.split(/[\\/]/).some(x=>x==='.'||x==='..')||value.slice(2).includes(':'))throw Error(`Invalid owner binding ${label} path`);
 return win32.normalize(value);
};
export function validateOwnerBinding(input){
 const fields=['profilePath','codexHome','gatewayUrl','runtimeCliPath','launcherPath'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key))||fields.some(key=>typeof input[key]!=='string'))throw Error('Complete fixed owner binding fields required');
 const binding=Object.fromEntries(fields.filter(key=>key!=='gatewayUrl').map(key=>[key,absolute(input[key],key)]));
 if(!/\\\.agent-workflow\\global\\bin\\Launch-Codex-Controlled\.exe$/i.test(binding.launcherPath))throw Error('Fixed stable owner native launcher path required');
 if(binding.profilePath.toLowerCase()===binding.codexHome.toLowerCase())throw Error('Separate owner profile and CODEX_HOME binding paths required');
 let url;try{url=new URL(input.gatewayUrl);}catch{throw Error('Fixed owner opaque loopback binding required');}
 if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||!/^\/workflow\/[A-Za-z0-9_-]{32,}$/.test(url.pathname))throw Error('Fixed owner opaque loopback binding required');
 binding.gatewayUrl=url.href;return binding;
}
export function validateOwnerExecutable(input){const path=absolute(input,'ownerExecutable');if(win32.basename(path).toLowerCase()!=='chatgpt.exe')throw Error('Fixed private owner executable required');return path;}
function patchOptions(options){const fields=['ownerBinding','ownerExecutable','expectedHash'];if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!fields.includes(key)))throw Error('Exact v4 bootstrap fields required; legacy bridge or PowerShell options refused');}
export function assertOwnerBootstrapSource(source,{entry,expectedHash}={}){checkSource(source,expectedHash,entry==='early'?earlyAnchors:entry==='late'?anchors:(()=>{throw Error('Fixed early or late bootstrap source required');})());}
function checkSource(source,expectedHash,list){
 if(typeof source!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash??'')||sha(source)!==expectedHash)throw Error('Installed bootstrap hash mismatch; refusing patch');
 for(const [label,anchor]of list)if(source.split(anchor).length!==2)throw Error(`${label} bootstrap anchor is not unique`);
 if(!source.startsWith(list[0][1]))throw Error('First vendor import bootstrap anchor must be at byte zero');
}
const earlyAnchors=[['First package entry import','require("./rolldown-runtime-CPUxUITh.js");'],['Late bootstrap import','require("./bootstrap-BYjpvKBK.js")']];
// Source-injected, builtin-only diagnostics. Read data descriptors, never error
// getters or arbitrary messages/paths. Frame labels are a tiny fixed vocabulary,
// useful for locating a vendor throw but not evidence of authenticity.
function diagnosticRuntime(error,branch){
 let name='Unknown',frame='unknown',messageClass='other';
 try{let at=error;for(let i=0;at!=null&&i<5;i++){const d=Object.getOwnPropertyDescriptor(at,'name');if(d){if(Object.hasOwn(d,'value')&&['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError','EvalError','AggregateError'].includes(d.value))name=d.value;break;}at=Object.getPrototypeOf(at);}}catch{}
 try{const d=Object.getOwnPropertyDescriptor(error,'stack');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&d.value.length<=65536){for(const line of d.value.split('\n').slice(1,65)){const match=/^\s+at\s.+?(?:[/\\( ])(main-BPBEjAxi\.js|bootstrap-BYjpvKBK\.js|early-bootstrap\.js):([0-9]{1,7}):([0-9]{1,9})\)?\s*$/.exec(line);if(match){frame=match[1]+':'+match[2]+':'+match[3];break;}}}}catch{}
 try{const d=Object.getOwnPropertyDescriptor(error,'message');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&d.value.length<=4096){const text=d.value;if(/^Cannot assign to read only property ['"]relaunch['"] of object /.test(text)||text.startsWith('受控 Codex 禁止直接重启；请退出后从 Codex（受控流程）入口重新打开'))messageClass='readonly_relaunch';else if(/^Cannot redefine property: relaunch\b/.test(text))messageClass='redefine_relaunch';else if(/^Cannot assign to read only property ['"]exports['"] of object /.test(text))messageClass='readonly_exports';else if(/^Cannot (?:add|define) property [^,\r\n]{1,80}, object is not extensible\b/.test(text))messageClass='object_not_extensible';else if(/^window\.setAppDetails is not a function\b/.test(text))messageClass='set_app_details_not_function';}}catch{}
 try{process.stderr.write('[AW_OWNER_DIAGNOSTIC] code='+branch+' name='+name+' frame='+frame+' messageClass='+messageClass+'\n');}catch{}
}
const diagnosticCode=(error,branch)=>`(${diagnosticRuntime.toString().replace(/\r?\n\s*/g,'')})(${error},${JSON.stringify(branch)});`;
function environmentCheck(binding,{late=false}={}){
 const required={CODEX_ELECTRON_USER_DATA_PATH:binding.profilePath,CODEX_HOME:binding.codexHome,CODEX_APP_SERVER_WS_URL:binding.gatewayUrl,CODEX_APP_RUNTIME_CLI_PATH:binding.runtimeCliPath};
 // The one late exception is vendor-owned CODEX_SHELL=1, introduced by the
 // exact pinned startup requirements shell-env loader. The true entry refuses
 // it. Late rechecks all owner values and dangerous prefixes after that loader.
 return `const required=${JSON.stringify(required)},seen=new Set(),values=Object.create(null),normal=v=>typeof v==="string"?v.replaceAll("/","\\\\").replace(/\\\\+$/g,"").toLowerCase():null,deny=()=>{throw Error("Controlled Codex owner environment mismatch; reopen from the controlled entry")};if(process.platform!=="win32"||!Array.isArray(process.argv)||process.argv.length!==1||!Array.isArray(process.execArgv)||process.execArgv.length)deny();for(const [key,value]of Object.entries(process.env)){const upper=key.toUpperCase();if(seen.has(upper))deny();seen.add(upper);values[upper]=value;if(upper.startsWith("CODEX_")&&!Object.hasOwn(required,upper)&&upper!=="CODEX_CHROME_USER_DATA_DIR"${late?'&&!(upper==="CODEX_SHELL"&&value==="1")':''}||upper.startsWith("NODE_")||upper.startsWith("ELECTRON_")||upper.startsWith("LD_")||upper.startsWith("DYLD_")||upper==="FORCE_CLI")deny();}for(const [key,value]of Object.entries(required))if(key==="CODEX_APP_SERVER_WS_URL"?values[key]!==value:normal(values[key])!==normal(value))deny();if(values.CODEX_CHROME_USER_DATA_DIR!==undefined&&normal(values.CODEX_CHROME_USER_DATA_DIR)!==normal(required.CODEX_ELECTRON_USER_DATA_PATH))deny();`;
}
function markerCheck(binding,ownerExecutable){
 const bindingHash=sha(JSON.stringify(binding));
 return `const key=Symbol.for("AgentWorkflow.Codex.OwnerEntry.v4"),descriptor=Object.getOwnPropertyDescriptor(process,key),entry=require.cache[require.resolve("./early-bootstrap.js")],exported=entry&&Object.getOwnPropertyDescriptor(entry.exports,key),record=descriptor&&descriptor.value;if(!descriptor||descriptor.writable||descriptor.configurable||!exported||exported.writable||exported.configurable||exported.value!==record||!record||Object.getPrototypeOf(record)!==null||!Object.isFrozen(record)||record.version!==4||record.bindingSha256!==${JSON.stringify(bindingHash)}||record.ownerExecutable!==${JSON.stringify(ownerExecutable)}||record.windowIdentity!==${JSON.stringify(OWNER_WINDOW_IDENTITY)}||record.appId!==${JSON.stringify(OWNER_APP_ID)})deny();`;
}
/** True package.main entry: no original imports, shell, network or lock before
 * validation. Marker is process-local provenance, not a credential or sandbox.
 * Preloaded hostile JS/native flags remain the launcher's separate boundary. */
export function patchEarlyBootstrapOwner(source,options={}){
 patchOptions(options);const {ownerBinding,ownerExecutable:inputExecutable,expectedHash=INSTALLED_EARLY_BOOTSTRAP_SHA256}=options;checkSource(source,expectedHash,earlyAnchors);
 const binding=validateOwnerBinding(ownerBinding),ownerExecutable=validateOwnerExecutable(inputExecutable),record={version:4,bindingSha256:sha(JSON.stringify(binding)),ownerExecutable,windowIdentity:OWNER_WINDOW_IDENTITY,appId:OWNER_APP_ID};
 const prefix=`(()=>{"use strict";${environmentCheck(binding)}if(normal(process.execPath)!==normal(${JSON.stringify(ownerExecutable)}))deny();const key=Symbol.for("AgentWorkflow.Codex.OwnerEntry.v4");if(Object.hasOwn(process,key)||Object.hasOwn(module.exports,key))deny();const app=require("electron").app;app.setAppUserModelId(${JSON.stringify(OWNER_APP_ID)});Object.defineProperty(app,"relaunch",{configurable:false,writable:false,value:function(){throw Error("受控 Codex 禁止直接重启；请退出后从 Codex（受控流程）入口重新打开");}});const record=Object.freeze(Object.assign(Object.create(null),${JSON.stringify(record)}));Object.defineProperty(process,key,{value:record,writable:false,configurable:false});Object.defineProperty(module.exports,key,{value:record,writable:false,configurable:false});})();\n`;
 const patched=prefix+source;return{source:patched,inputSha256:sha(source),outputSha256:sha(patched),ownerBinding:binding,ownerExecutable,ownerBoundaryVersion:OWNER_BOUNDARY_VERSION,windowIdentity:OWNER_WINDOW_IDENTITY,appUserModelId:OWNER_APP_ID,injectedBytes:Buffer.byteLength(prefix),anchors:earlyAnchors.map(([label])=>label),internalRelaunch:'explicitly-denied-not-delegated'};
}
/** Shell-env loading is followed by exact current-value and process-local marker
 * checks; there is no bridge or window-API fallback. */
export function patchBootstrapOwner(source,options={}){
 patchOptions(options);const {ownerBinding,ownerExecutable:inputExecutable,expectedHash=INSTALLED_BOOTSTRAP_SHA256}=options;checkSource(source,expectedHash,anchors);
 const binding=validateOwnerBinding(ownerBinding),ownerExecutable=validateOwnerExecutable(inputExecutable),prefix=`(()=>{"use strict";${environmentCheck(binding,{late:true})}if(normal(process.execPath)!==normal(${JSON.stringify(ownerExecutable)}))deny();${markerCheck(binding,ownerExecutable)}})();\n`;
 const patched=prefix+source.replace(anchors[2][1],'void 0').replace(anchors[4][1],'catch(r){'+diagnosticCode('r','MAIN_BOOTSTRAP_FAILED')+anchors[4][1].slice('catch(r){'.length));
 return{source:patched,inputSha256:sha(source),outputSha256:sha(patched),ownerBinding:binding,ownerExecutable,ownerBoundaryVersion:OWNER_BOUNDARY_VERSION,windowIdentity:OWNER_WINDOW_IDENTITY,appUserModelId:OWNER_APP_ID,injectedBytes:Buffer.byteLength(prefix),anchors:anchors.map(([label])=>label),internalRelaunch:'explicitly-denied-not-delegated'};
}
