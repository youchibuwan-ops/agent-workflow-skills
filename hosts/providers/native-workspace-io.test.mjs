import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createNativeWorkspaceIO} from './native-workspace-io.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function setup(t,execute){const root=mkdtempSync(join(tmpdir(),'native-io-test-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const workspace=join(root,'workspace'),privateRoot=join(workspace,'host-private');mkdirSync(privateRoot,{recursive:true});return createNativeWorkspaceIO({workspace,privateRoots:[privateRoot],nativeExecutor:{catalog:[{name:'pwsh'},{name:'write'}],execute}});}
const result=stdout=>({isError:false,value:{kind:'foreground',exitCode:0,timedOut:false,aborted:false,stdout:{text:stdout,truncated:false},stderr:{text:'',truncated:false}}});
test('workspace bridge refuses traversal/private paths before any native operation',async t=>{
 let count=0;const io=setup(t,()=>{count++;throw Error('unexpected');});
 for(const p of ['../escape','.env','host-private/state.json','.git/config','.CoDeX/config.toml','NoDe_MoDuLeS/code.js'])await assert.rejects(io.read(p));
 assert.equal(count,0);
});
test('native denial and truncation fail closed with no Node read fallback',async t=>{
 const denied=setup(t,async()=>({isError:true,content:[{type:'text',text:'permission denied'}]}));await assert.rejects(denied.read('not-created.txt'),/denied|failed/);
 const cut=setup(t,async()=>({isError:false,value:{kind:'foreground',exitCode:0,stdout:{text:'',truncated:true},stderr:{text:'',truncated:false}}}));await assert.rejects(cut.read('input.txt'),/truncat/);
});

test('a linked private-text alias is rejected before the native reader can run',async t=>{
 const root=mkdtempSync(join(tmpdir(),'native-io-hardlink-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const workspace=join(root,'project'),privateRoot=join(root,'private');mkdirSync(workspace);mkdirSync(privateRoot);writeFileSync(join(privateRoot,'note.txt'),'private');linkSync(join(privateRoot,'note.txt'),join(workspace,'alias.txt'));let reads=0;
 const io=createNativeWorkspaceIO({workspace,privateRoots:[privateRoot],nativeExecutor:{catalog:[{name:'pwsh'}],execute:async()=>{reads++;throw Error('unexpected');}}});
 await assert.rejects(io.read('alias.txt'),/hard.link/i);assert.equal(reads,0);
 await assert.rejects(io.write('out.txt',Buffer.from('write')),/writer capability/);
});
test('native chunk reads preserve BOM, CRLF and current exact byte identity',async t=>{
 const bytes=Buffer.from('\uFEFFa\r\n'+'汉'.repeat(5000));let index=0;
 const io=setup(t,async(name,args)=>{assert.equal(name,'pwsh');assert(!args.command.includes('not-authorized'));const offset=index++*8192,chunk=bytes.subarray(offset,offset+8192);return result(JSON.stringify({offset,total:bytes.length,sha256:sha(bytes),base64:chunk.toString('base64')}));});
 assert.deepEqual(await io.read('input.txt'),bytes);assert.equal(index,2);
});
test('native write runs original writer and readback, never a process write fallback',async t=>{
 const bytes=Buffer.from('actual output\r\n');let writes=0;
 const io=setup(t,async(name,args)=>{if(name==='write'){writes++;assert.equal(args.content,bytes.toString());return {isError:false,content:[]};}return result(JSON.stringify({offset:0,total:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')}));});
 assert.deepEqual(await io.write('out.txt',bytes),bytes);assert.equal(writes,1);
});
