// Host-owned project roots. These are never supplied by model tool arguments.
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {bindWorkspaceRoot} from './workspace-root.mjs';
import {createWorkspacePathPolicy} from './verified-worktree.mjs';
import {protectedProjectSegment,projectPathKey} from './project-path.mjs';

export class ProjectWorkspaceRequestError extends Error {}
const deny=message=>{throw new ProjectWorkspaceRequestError(message);};
const inside=(root,target)=>{const r=relative(root,target);return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));};
export function createProjectWorkspaces({workspaceBinding,policy,workspaceIO,additionalWorkspaces=[],privateRoots=[],hardPrivateRoots=[]}){
 if(!Array.isArray(additionalWorkspaces)||additionalWorkspaces.length>100)throw Error('Bounded owner project roots required');
 const primary={id:null,prefix:'',root:workspaceBinding.root,binding:workspaceBinding,policy,io:workspaceIO};
 const scopes=[primary],ids=new Set(),roots=new Set([projectPathKey(primary.root)]);
 for(const entry of additionalWorkspaces){
  if(!entry||typeof entry.id!=='string'||!/^[-a-z0-9]{1,64}$/.test(entry.id)||ids.has(entry.id))throw Error('Unique owner project root ID required');
  if(workspaceIO&&!entry.workspaceIO)throw Error('Original native workspace IO is required for every related directory; no filesystem fallback');
  const binding=bindWorkspaceRoot(entry.workspace),root=binding.root;
  if(roots.has(projectPathKey(root)))throw Error('Duplicate owner project root');
  const pathPolicy=createWorkspacePathPolicy({workspace:root,privateRoots,hardPrivateRoots,worktreeLease:entry.worktreeLease});
  pathPolicy.assertWorkspace({allowPrivateSubroots:true});ids.add(entry.id);roots.add(projectPathKey(root));
  scopes.push({id:entry.id,prefix:'@projects/'+entry.id,root,binding,policy:pathPolicy,io:entry.workspaceIO});
 }
 function select(value){
  if(typeof value!=='string'||!value||value.includes('\0'))deny('Project path required');
  let scope=primary,path=value.replaceAll('\\','/');
  if(isAbsolute(value)){
   // Reject lexical traversal before normalization, even when it lands inside.
   if(path.split('/').some(p=>p==='.'||p==='..'))deny('Project traversal denied');
   const absolute=resolve(value),matches=scopes.filter(s=>inside(s.root,absolute)).sort((a,b)=>b.root.length-a.root.length);
   if(!matches.length)deny('Path is outside this project and its authorized related directories');
   scope=matches[0];path=relative(scope.root,absolute).replaceAll('\\','/')||'.';
  }else if(path==='@projects'||path.startsWith('@projects/')){
   scope=scopes.find(s=>s.prefix&&(path===s.prefix||path.startsWith(s.prefix+'/')));
   if(!scope)deny('Unknown related project directory');path=path.slice(scope.prefix.length+1)||'.';
  }
  if(path!=='.'&&(path.includes(':')||path.split('/').some(p=>!p||p==='.'||p==='..'||protectedProjectSegment(p))))deny('Protected project alias or credential path is unavailable; escaping paths denied');
  const canonical=scope.prefix?(path==='.'?scope.prefix:scope.prefix+'/'+path):path;
  return {...scope,path,canonical};
 }
 return Object.freeze({select,normalize:value=>select(value).canonical,related:Object.freeze(scopes.slice(1).map(s=>Object.freeze({id:s.id,root:s.root,path_prefix:s.prefix}))) });
}
