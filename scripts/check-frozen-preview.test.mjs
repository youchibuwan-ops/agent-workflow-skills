import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {checkFrozenPreview} from './check-frozen-preview.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'frozen-preview-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('config','core.autocrlf','false');mkdirSync(join(root,'evidence'));writeFileSync(join(root,'builder.mjs'),'export const original=1;\n');writeFileSync(join(root,'evidence/summary.json'),'{"proof":"original"}\n');writeFileSync(join(root,'core.mjs'),'current shared code\n');git('add','.');git('commit','-qm','frozen fixture');return{root,git,revision:git('rev-parse','HEAD').trim(),paths:['builder.mjs','evidence/summary.json']};}
test('shared current core may evolve while the frozen artifact builder and proof remain exact',t=>{
 const f=fixture(t);writeFileSync(join(f.root,'core.mjs'),'current shared core revision\n');assert.equal(checkFrozenPreview({sourceRoot:f.root,revision:f.revision,paths:f.paths}).checked,2);
});
test('changed, deleted or staged-only historical bytes cannot pass the frozen path guard',t=>{
 for(const mode of ['changed','deleted','staged-only']){const f=fixture(t),file=join(f.root,'evidence/summary.json');if(mode==='deleted')rmSync(file);else writeFileSync(file,'{"proof":"rewritten"}\n');if(mode==='staged-only'){f.git('add','evidence/summary.json');writeFileSync(file,'{"proof":"original"}\n');}assert.throws(()=>checkFrozenPreview({sourceRoot:f.root,revision:f.revision,paths:f.paths}),/frozen|changed|missing/i);}
});
test('a mode-only staged change and missing reference fail rather than reducing the protected set',t=>{
 const f=fixture(t);f.git('update-index','--chmod=+x','builder.mjs');assert.throws(()=>checkFrozenPreview({sourceRoot:f.root,revision:f.revision,paths:f.paths}),/frozen|changed/i);assert.throws(()=>checkFrozenPreview({sourceRoot:f.root,revision:'f'.repeat(40),paths:f.paths}),/reference|commit/i);
});
test('the CI command accepts no reference/path override',()=>{
 const script=new URL('./check-frozen-preview.mjs',import.meta.url);const r=spawnSync(process.execPath,[fileURLToPath(script),'--ref','HEAD'],{encoding:'utf8',windowsHide:true});assert.notEqual(r.status,0);assert.match(r.stderr,/override|arguments/i);
});
