import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {strictConfig,strictArguments} from './strict-config.mjs';
test('strict adapter leaves native compaction policy and reply budgets unset',()=>{
 const text=strictConfig('C:/private/catalog.json'),args=strictArguments('C:/private/catalog.json');
 const keys=['model_auto_compact_token_limit','model_post_turn_compact_threshold_percent','model_max_output_tokens','max_output_tokens'];
 const settings={};for(let i=0;i<args.length;i+=2){const index=args[i+1].indexOf('=');settings[args[i+1].slice(0,index)]=JSON.parse(args[i+1].slice(index+1));}
 for(const key of keys){assert.equal(Object.hasOwn(settings,key),false,key);assert.equal(new RegExp('^'+key+'\\s*=','m').test(text),false,key);}
 assert.equal(Object.hasOwn(settings,'features.async_compaction'),false);
 const featureSection=text.split('[features]\n')[1]?.split('\n[')[0]??'';assert.equal(/^async_compaction\s*=/m.test(featureSection),false);
 assert.equal(settings.default_permissions,':read-only');assert.equal(settings['features.shell_tool'],false);assert.equal(settings['features.multi_agent'],false);
});
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
