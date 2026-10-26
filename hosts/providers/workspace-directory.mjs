// Scoped metadata only. Native installations enumerate through their original
// permission service; absence/denial never falls back to unrestricted reads.
import {lstatSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {protectedProjectSegment,projectPathEquals,projectPathKey} from '../security/project-path.mjs';

export class DirectoryRequestError extends Error {}
const deny=message=>{throw new DirectoryRequestError(message);};
const inside=(root,target)=>{const r=path.relative(root,target);return r===''||(r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r));};
const fields=['dev','ino','mode','mtimeNs','ctimeNs'];
export function listingPath(value='.'){
 if(value==='.')return value;
 if(typeof value!=='string'||!value||value.length>4096||path.isAbsolute(value)||/[\x00:]/.test(value))deny('Expected a bounded project-relative directory path');
 const parts=value.replaceAll('\\','/').split('/');if(parts.some(x=>!x||x==='.'||x==='..'||protectedProjectSegment(x)))deny('Protected or escaping project directory denied');return parts.join('/');
}
function directory(root,relative,policy){
 policy.assertCurrent();const chain=[root];if(relative!=='.'){let current=root;for(const part of relative.split('/')){current=path.join(current,part);chain.push(current);}}
 return chain.map(absolute=>{if(policy.deniesPrivate(absolute))deny('Private project directory denied');let stat;try{stat=lstatSync(absolute,{bigint:true});}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))deny('Requested project directory does not exist');throw e;}if(stat.isSymbolicLink()||!stat.isDirectory())deny('Project directory must be a plain directory, not a link or file');const physical=realpathSync.native(absolute);if(!inside(root,physical)||policy.deniesPrivate(physical))deny('Redirected project directory denied');return{absolute,physical,stat};});
}
function current(before,root,relative,policy,allowCtime=false){
 let after;try{after=directory(root,relative,policy);}catch(cause){throw new Error('Project directory identity changed during authorized listing',{cause});}
 if(before.length!==after.length||before.some((entry,i)=>entry.physical!==after[i].physical||fields.filter(k=>!allowCtime||k!=='ctimeNs').some(k=>entry.stat[k]!==after[i].stat[k])))throw new Error('Project directory changed during authorized listing');
 return{chain:after,ctimeChanged:before.some((entry,i)=>entry.stat.ctimeNs!==after[i].stat.ctimeNs)};
}
export async function listWorkspaceDirectory({workspace,workspaceBinding,policy,workspaceIO,readAllowlist,path:requested='.',offset=0,limit=40}){
 workspaceBinding.assertCurrent();const root=workspaceBinding.root,relative=listingPath(requested);if(path.resolve(workspace)!==root)throw new Error('Workspace directory binding mismatch');if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)deny('Bounded directory offset and limit required');
 let before=directory(root,relative,policy);const absolute=before.at(-1).absolute;
 const load=async()=>{let page;if(workspaceIO){if(typeof workspaceIO.list!=='function')deny('Original native directory enumeration is unavailable; no filesystem fallback is allowed');page=await workspaceIO.list(relative,{offset,limit});}else{const names=readdirSync(absolute).sort();if(names.length>1000000)deny('Directory exceeds the navigation entry limit');page={names:names.slice(offset,offset+limit),offset,total:names.length};}if(!page||page.offset!==offset||!Number.isSafeInteger(page.total)||page.total<0||page.total>1000000||!Array.isArray(page.names)||page.names.length!==Math.min(limit,Math.max(0,page.total-offset))||new Set(page.names).size!==page.names.length||page.names.some(n=>typeof n!=='string'||!n||n==='.'||n==='..'||/[\\/\x00]/.test(n)))throw new Error('Native directory page is incomplete or malformed');return page;};
 let page=await load();workspaceBinding.assertCurrent();const checked=current(before,root,relative,policy,true);let ctimeReconfirmed=false;
 if(checked.ctimeChanged){const confirmed=await load();workspaceBinding.assertCurrent();current(checked.chain,root,relative,policy);if(JSON.stringify([page.offset,page.total,page.names])!==JSON.stringify([confirmed.offset,confirmed.total,confirmed.names]))throw new Error('Project directory names changed during ctime confirmation');page=confirmed;ctimeReconfirmed=true;}before=checked.chain;
 const entries=[];let consumed=0;
 for(const name of page.names){
  if(protectedProjectSegment(name)){consumed++;continue;}
  const rel=relative==='.'?name:relative+'/'+name,p=path.join(absolute,name);if(policy.deniesPrivate(p)){consumed++;continue;}
  if(readAllowlist&&!readAllowlist.some(x=>projectPathEquals(x,rel)||projectPathKey(x).startsWith(projectPathKey(rel)+'/'))){consumed++;continue;}
  const stat=lstatSync(p,{bigint:true});if(stat.isSymbolicLink()||stat.isFile()&&stat.nlink!==1n||!stat.isFile()&&!stat.isDirectory()){consumed++;continue;}
  const actual=realpathSync.native(p);if(!inside(root,actual)||policy.deniesPrivate(actual))throw new Error('Directory entry changed its scoped identity');
  const entry={name,path:rel,type:stat.isDirectory()?'directory':'file'};
  if(Buffer.byteLength(JSON.stringify([...entries,entry]))>24000){if(!entries.length)deny('Directory entry exceeds the complete metadata response limit');break;}
  entries.push(entry);consumed++;
 }
 workspaceBinding.assertCurrent();current(before,root,relative,policy);const next=offset+consumed;return{path:relative,entries,offset,next_offset:next<page.total?next:null,total:page.total,complete:next>=page.total,...(ctimeReconfirmed?{ctime_reconfirmed:true}:{})};
}
