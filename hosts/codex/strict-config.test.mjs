import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {strictConfig,strictArguments} from './strict-config.mjs';
test('trusted default workspace has the exact official desktop key in initial TOML and overriding CLI',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'workflow-strict-desktop-')),workspace=path.join(root,'public 中文 workspace');mkdirSync(workspace);
 try{const canonical=realpathSync.native(workspace).replaceAll('\\','/'),text=strictConfig('C:/private/catalog.json',{defaultWorkspace:workspace}),args=strictArguments('C:/private/catalog.json',{defaultWorkspace:workspace});assert.ok(text.includes('[desktop]\nprojectlessWorkspaceRoot = '+JSON.stringify(canonical)+'\n'));assert.ok(args.includes('desktop.projectlessWorkspaceRoot='+JSON.stringify(canonical)));assert.ok(text.includes('default_permissions = ":read-only"'));assert.ok(args.includes('features.shell_tool=false'));
  assert.equal(strictConfig('C:/catalog.json'),strictConfig('C:/catalog.json',{}));assert.equal(strictConfig('C:/catalog.json').includes('[desktop]'),false);assert.equal(strictArguments('C:/catalog.json').some(x=>x.startsWith('desktop.')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('trusted desktop workspace rejects nonabsolute, missing, non-directory and malformed values',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'workflow-strict-desktop-deny-')),file=path.join(root,'file');writeFileSync(file,'fixture');
 try{for(const defaultWorkspace of ['relative',path.join(root,'missing'),file,null,3,{},'C:/bad\nvalue'])for(const method of [strictConfig,strictArguments])assert.throws(()=>method('C:/catalog.json',{defaultWorkspace}),/workspace|ENOENT|directory/i);}finally{rmSync(root,{recursive:true,force:true});}
});
