// Bootstrap trust boundary: builtins only, before importing ws/DSH or starting
// any backend. The owner configuration pins the separately verified manifest.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDependencySealAuthority} from './dependency-seal.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const inside=(root,p)=>{const r=relative(root,p);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
function regular(path,label){const p=resolve(path);if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()||lstatSync(p).nlink>1||realpathSync(p)!==p)throw Error(`${label} must be an existing unlinked private regular file`);return p;}
function safeMember(path){if(typeof path!=='string'||!path||isAbsolute(path)||/[\\:\x00]/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid release manifest member');return path;}
function files(root){const found=[];function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isSymbolicLink())throw Error('Release payload links are not permitted');if(e.isDirectory())visit(path);else if(e.isFile())found.push(path);else throw Error('Unsupported release payload entry');}}visit(root);return found;}
export function verifyReleaseManifest({payloadRoot,manifestPath,manifestSha256}){
 const root=realpathSync(payloadRoot),manifest=regular(manifestPath,'Pinned release manifest');
 if(!/^[a-f0-9]{64}$/.test(manifestSha256)||sha(readFileSync(manifest))!==manifestSha256)throw Error('Pinned release manifest SHA256 mismatch');
 const data=JSON.parse(readFileSync(manifest,'utf8'));if(data.format!==1||!Array.isArray(data.files)||!data.files.length)throw Error('Incomplete release manifest');
 const expected=new Map();for(const entry of data.files){const name=safeMember(entry.path);if(expected.has(name.toLowerCase())||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Malformed or colliding release manifest');const path=resolve(root,name);if(!inside(root,path)||!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())throw Error('Missing release payload file: '+name);const bytes=readFileSync(path);if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Release source integrity mismatch: '+name);expected.set(name.toLowerCase(),entry);}
 const actual=files(root).filter(path=>path!==manifest).map(path=>relative(root,path).replaceAll('\\','/'));
 if(actual.length!==expected.size||actual.some(path=>!expected.has(path.toLowerCase())))throw Error('Unlisted release payload file');
 return{ok:true,payloadRoot:root,manifestSha256,fileCount:expected.size};
}
export async function verifyInstallation({config,profile}={}){
 const policy=config?.integrity;if(!policy||typeof policy!=='object')throw Error('Owner installation integrity policy required before runtime loading');
 const source=verifyReleaseManifest(policy);
 if(!Array.isArray(policy.dependencies)||!policy.dependencies.length||!Array.isArray(policy.actorWritableRoots)||!Array.isArray(policy.trustedLinkRoots??[]))throw Error('Complete dependency and actor-write integrity policy required');
 const keyPath=regular(policy.dependencyKeyFile,'Private dependency key');
 if(inside(source.payloadRoot,keyPath))throw Error('Dependency key must stay outside release payload');
 if(!existsSync(policy.dependencySealRoot)||!lstatSync(policy.dependencySealRoot).isDirectory())throw Error('Dependency seal store missing; verification cannot create first trust');
 const key=readFileSync(keyPath);if(key.length!==32)throw Error('Private dependency key must contain exactly 32 bytes');
 const authority=createDependencySealAuthority({sealRoot:policy.dependencySealRoot,key,payloadRoots:[source.payloadRoot],actorWritableRoots:policy.actorWritableRoots,trustedLinkRoots:policy.trustedLinkRoots??[]});
 const dependencies=policy.dependencies.map(item=>authority.verify({installRoot:item.installRoot,sealPath:item.sealPath}));
 for(const runtime of [config.runtimeRoot,config.gateway?.dependencyRoot].filter(Boolean))if(!policy.dependencies.some(item=>realpathSync(item.installRoot)===realpathSync(runtime)))throw Error('Runtime dependency root is not the exact sealed installation');
 return{ok:true,profile:profile??null,source,dependencies:dependencies.map(({treeSha256,entryCount,totalBytes,attestation})=>({treeSha256,entryCount,totalBytes,attestation}))};
}
export async function verifyBeforeImport({config,modulePath,profile}){
 const verified=await verifyInstallation({config,profile});const module=regular(modulePath,'Guarded runtime module');
 if(!inside(verified.source.payloadRoot,module))throw Error('Runtime module is outside the verified release');
 return{verified,module:await import(pathToFileURL(module).href)};
}
