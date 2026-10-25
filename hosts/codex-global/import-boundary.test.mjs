import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('gateway import before owner verification never resolves a third-party package',()=>{
 const url=new URL('./gateway.mjs',import.meta.url).href;
 const script=`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,n){if(!s.startsWith('node:')&&!s.startsWith('.')&&!s.startsWith('file:'))throw Error('Third-party dependency before owner verification: '+s);return n(s,c);}});const m=await import(${JSON.stringify(url)});try{await m.createDesktopGateway({});}catch(e){if(!e.message.includes('Controller factory required'))throw e;}console.log('builtin-only');`;
 const run=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/builtin-only/);
});
