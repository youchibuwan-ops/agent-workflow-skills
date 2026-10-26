import {existsSync,lstatSync,mkdirSync,realpathSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const absolute=p=>{if(typeof p!=='string'||!path.isAbsolute(p)||p.includes('\0'))throw Error('Absolute owner desktop settings path required');return path.resolve(p);};
function plainDirectory(dir,create=false){
 dir=absolute(dir);if(!existsSync(dir)){plainDirectory(path.dirname(dir),create);if(!create)return;mkdirSync(dir);}
 const st=lstatSync(dir);if(st.isSymbolicLink()||!st.isDirectory())throw Error('Owner desktop settings directory redirected');
 // Check every existing ancestor too; a plain leaf cannot bless a redirected home.
 const parent=path.dirname(dir);if(parent!==dir)plainDirectory(parent,false);return realpathSync.native(dir);
}
function regular(file,maxBytes=16384){const st=lstatSync(file);if(st.isSymbolicLink()||!st.isFile()||st.nlink!==1||st.size>maxBytes)throw Error('Owner desktop settings regular single-link file required');return readFileSync(file);}
const normalize=p=>absolute(p).replaceAll('\\','/');
const content=p=>Buffer.from(`[desktop]\nprojectlessWorkspaceRoot = ${JSON.stringify(normalize(p))}\n`);
const signature=(key,r)=>createHmac('sha256',key).update(JSON.stringify([r.format,r.path,r.workspace,r.sha256])).digest('hex');
function replace(file,bytes,replaceFile){const temp=path.join(path.dirname(file),'.owner-'+randomBytes(16).toString('hex')+'.tmp');writeFileSync(temp,bytes,{flag:'wx',mode:0o600});try{replaceFile(temp,file);}finally{if(existsSync(temp))unlinkSync(temp);}}

/** Only the owner launcher's exact single-key config is managed. Unknown/native
 * edits are never adopted, merged, or discarded. Call after pins and listener
 * ownership, before importing a backend; activation callers do not call this. */
export function projectDesktopSettings({stateRoot,workspace,replaceFile=renameSync}={}){
 stateRoot=absolute(stateRoot);workspace=realpathSync.native(absolute(workspace));if(!lstatSync(workspace).isDirectory())throw Error('Owner desktop workspace directory required');plainDirectory(stateRoot,false);
 const home=path.join(stateRoot,'desktop-home'),authority=path.join(stateRoot,'desktop-settings-owner'),file=path.join(home,'config.toml'),keyPath=path.join(authority,'host.key'),receiptPath=path.join(authority,'receipt.json');
 plainDirectory(home,false);plainDirectory(authority,false);const configExists=existsSync(file);if(configExists)regular(file);
 if(configExists&&(!existsSync(keyPath)||!existsSync(receiptPath)))throw Error('Unknown existing desktop config lacks owner authority receipt');
 if(!configExists&&existsSync(receiptPath))throw Error('Desktop settings config missing after prior receipt; interrupted state refused');
 let key,old;
 if(existsSync(keyPath)){key=regular(keyPath,32);if(key.length!==32)throw Error('Invalid desktop settings authority key');}
 if(configExists){
  let r;try{r=JSON.parse(regular(receiptPath).toString('utf8'));}catch{throw Error('Invalid desktop settings authority receipt');}
  if(!r||Object.keys(r).sort().join(',')!=='format,mac,path,sha256,workspace'||r.format!==1||r.path!==normalize(file)||typeof r.workspace!=='string'||!path.isAbsolute(r.workspace)||!/^\w{64}$/.test(r.mac??'')||!/^[a-f0-9]{64}$/.test(r.sha256??'')||!timingSafeEqual(Buffer.from(signature(key,r)),Buffer.from(r.mac)))throw Error('Desktop settings authority receipt integrity mismatch');
  old=regular(file);if(sha(old)!==r.sha256||!old.equals(content(r.workspace)))throw Error('Desktop settings config integrity mismatch');
 }
 const bytes=content(workspace);if(old?.equals(bytes))return{status:'unchanged',configPath:file,keyPath,receiptPath};
 plainDirectory(home,true);plainDirectory(authority,true);if(!key){key=randomBytes(32);writeFileSync(keyPath,key,{flag:'wx',mode:0o600});}
 let backupPath;if(old){backupPath=path.join(authority,'backup-'+sha(old)+'.toml');if(existsSync(backupPath)){if(!regular(backupPath).equals(old))throw Error('Desktop settings backup integrity mismatch');}else writeFileSync(backupPath,old,{flag:'wx',mode:0o600});}
 const r={format:1,path:normalize(file),workspace:normalize(workspace),sha256:sha(bytes)};r.mac=signature(key,r);
 // Config first, receipt second: an interrupted replacement fails closed on the
 // next start. The old exact bytes remain in a single-link private backup.
 replace(file,bytes,replaceFile);replace(receiptPath,Buffer.from(JSON.stringify(r)),replaceFile);
 return{status:old?'updated':'created',configPath:file,keyPath,receiptPath,...(backupPath?{backupPath}:{})};
}
