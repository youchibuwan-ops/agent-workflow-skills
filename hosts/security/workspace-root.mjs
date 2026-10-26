import {lstatSync,realpathSync} from 'node:fs';

// Bind the selected directory object once. Re-resolving a replaced root must
// never silently give a task authority over another directory.
export function bindWorkspaceRoot(workspace){
 const root=realpathSync.native(workspace),original=lstatSync(root,{bigint:true});
 if(!original.isDirectory()||original.isSymbolicLink())throw new Error('Workspace root must be a plain directory');
 function assertCurrent(){
  try{
   const current=lstatSync(root,{bigint:true});
   if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==original.dev||current.ino!==original.ino||realpathSync.native(root)!==root)throw new Error('Replaced directory object');
  }catch(cause){throw new Error('Bound workspace root identity changed or became unavailable',{cause});}
 }
 return Object.freeze({root,assertCurrent});
}
