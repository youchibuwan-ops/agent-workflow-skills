import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';import {fileURLToPath} from 'node:url';
export const FROZEN_PREVIEW_REVISION='004e3407ef40de377d650336805999953f3cfdaf';
export const FROZEN_PREVIEW_PATHS=Object.freeze([
 'scripts/build-host-preview.mjs','scripts/host-preview.test.mjs',
 'packaging/preview.mjs','packaging/bootstrap.ps1','packaging/run.mjs',
 'evidence/host-preview-20261025/summary.json'
]);
export function checkFrozenPreview({sourceRoot=resolve(import.meta.dirname,'..'),revision=FROZEN_PREVIEW_REVISION,paths=FROZEN_PREVIEW_PATHS}={}){
 if(!/^[a-f0-9]{40}$/.test(revision)||!Array.isArray(paths)||!paths.length||paths.some(p=>typeof p!=='string'||!p||/[\\:\0]/.test(p)||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..')))throw Error('Fixed commit and literal frozen paths required');
 const root=resolve(sourceRoot),git=args=>execFileSync('git',['--no-replace-objects','--literal-pathspecs','-C',root,...args],{windowsHide:true,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
 try{git(['cat-file','-e',revision+'^{commit}']);}catch{throw Error('Frozen preview commit reference unavailable; fetch full history before checking');}
 const changed=new Set();
 for(const file of paths){const p=join(root,file);if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink()){changed.add(file);continue;}const original=git(['show',revision+':'+file]);if(!readFileSync(p).equals(original))changed.add(file);}
 for(const args of [[],['--cached']])for(const p of git(['diff',...args,'--no-ext-diff','--no-textconv','--name-only','-z',revision,'--',...paths]).toString('utf8').split('\0').filter(Boolean))changed.add(p);
 if(changed.size)throw Error('Changed or missing frozen preview artifact paths: '+[...changed].join(', '));
 return {ok:true,scope:'historical-preview-artifact-files',revision,checked:paths.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error('No reference or path override arguments are allowed');console.log(JSON.stringify(checkFrozenPreview()));}catch(e){console.error(e.message);process.exitCode=1;}
}
