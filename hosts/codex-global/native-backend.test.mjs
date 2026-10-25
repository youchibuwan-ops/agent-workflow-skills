import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync,mkdirSync} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createStrictBackend} from './native-backend.mjs';
const catalog={models:[{slug:'fixture',tool_mode:'direct',multi_agent_version:null,multi_agent_reasoning_effort:null,shell_type:'disabled',apply_patch_tool_type:null,experimental_supported_tools:[]}]};
const fixture=path.resolve('hosts/codex-global/probes/fixture-backend.mjs');
test('strict native transport initializes once, preserves split UTF8, and never audits auth response',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-native-'));const events=[];
 const b=await createStrictBackend({backendCommand:[process.execPath,fixture],stateRoot:root,strictCatalog:catalog,onAudit:e=>events.push(e)});
 try{assert.equal((await b.rpc('initialize',{})).serverVersion,'fixture');assert.equal((await b.rpc('echo',{text:'中文🙂'})).text,'中文🙂');const r=await b.rpc('getAuthStatus',{});assert.equal(r.authToken,'fixture-credential');assert.equal(JSON.stringify(events).includes('fixture-credential'),false);}finally{await b.close();rmSync(root,{recursive:true,force:true});}
});
test('missing controller path does not leak auth on native startup failure',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-auth-')),source=path.join(root,'auth-source.json'),state=path.join(root,'private');mkdirSync(state);writeFileSync(source,'{"fixture":"secret"}');
 try{await assert.rejects(createStrictBackend({backendCommand:[process.execPath,'missing-runtime-file.mjs'],stateRoot:state,strictCatalog:catalog,authPath:source}),/runtime/);assert.equal(existsSync(path.join(state,'state','auth.json')),false);assert.equal(readFileSync(source,'utf8'),'{"fixture":"secret"}');}finally{rmSync(root,{recursive:true,force:true});}
});
test('copied auth is removed after initialized close and after post-copy native failure',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-auth-finally-')),source=path.join(root,'source.json');writeFileSync(source,'{"fixture":"secret"}');
 try{for(const fail of [false,true]){const state=path.join(root,fail?'failed':'success');mkdirSync(state);const options={backendCommand:[process.execPath,fixture,...(fail?['--fail-initialize']:[])],stateRoot:state,strictCatalog:catalog,authPath:source};if(fail)await assert.rejects(createStrictBackend(options),/exited|closed/i);else{const b=await createStrictBackend(options);assert.equal(existsSync(path.join(state,'state','auth.json')),true);await b.close();}assert.equal(existsSync(path.join(state,'state','auth.json')),false);}assert.equal(readFileSync(source,'utf8'),'{"fixture":"secret"}');}finally{rmSync(root,{recursive:true,force:true});}
});
