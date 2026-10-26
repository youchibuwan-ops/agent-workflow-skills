import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,linkSync,statSync,utimesSync,renameSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createNativeWorkspaceIO} from './native-workspace-io.mjs';
import {worktreeFixture} from '../security/verified-worktree.test-support.mjs';import {createVerifiedWorktreeAuthority} from '../security/verified-worktree.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function setup(t,execute){const root=mkdtempSync(join(tmpdir(),'native-io-test-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const workspace=join(root,'workspace'),privateRoot=join(workspace,'host-private');mkdirSync(privateRoot,{recursive:true});return createNativeWorkspaceIO({workspace,privateRoots:[privateRoot],nativeExecutor:{catalog:[{name:'pwsh'},{name:'write'}],execute}});}
const result=stdout=>({isError:false,value:{kind:'foreground',exitCode:0,timedOut:false,aborted:false,stdout:{text:stdout,truncated:false},stderr:{text:'',truncated:false}}});
test('native directory metadata uses the original permission route with bounded pages',async t=>{
 let calls=0;const io=setup(t,async(name,args)=>{calls++;assert.equal(name,'pwsh');assert.ok(args.command.includes('Get-ChildItem -LiteralPath'));assert.ok(args.command.includes('Select-Object -Skip 2 -First 1'));assert.ok(args.command.includes('-EscapeHandling EscapeNonAscii'),'directory names must survive native legacy-codepage/ConstrainedLanguage output');return result('{"offset":2,"total":3,"names":["\\u80cc\\u666f.tscn"]}');});assert.equal(typeof io.list,'function','native workspace IO must expose directory enumeration');assert.deepEqual(await io.list('.',{offset:2,limit:1}),{offset:2,total:3,names:['背景.tscn']});assert.equal(calls,1);
});
test('native directory permission denial and incomplete output cannot use a Node fallback',async t=>{
 const denied=setup(t,async()=>({isError:true}));assert.equal(typeof denied.list,'function');await assert.rejects(denied.list('.'),/denied|failed/);const incomplete=setup(t,async()=>result(JSON.stringify({offset:0,total:2,names:['only-one']})));await assert.rejects(incomplete.list('.',{limit:2}),/incomplete|malformed/);
});
test('native directory paths reject protected metadata before dispatch',async t=>{
 let calls=0;const io=setup(t,async()=>{calls++;throw Error('must not run');});assert.equal(typeof io.list,'function');for(const p of ['../escape','host-private','.git','.env'])await assert.rejects(io.list(p));assert.equal(calls,0);
});

test('native directory and file IO reject replacement of their originally bound root before dispatch',async t=>{
 for(const mode of ['plain','junction']){
  const root=mkdtempSync(join(tmpdir(),'native-root-replaced-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const workspace=join(root,'project');mkdirSync(workspace);let calls=0;const io=createNativeWorkspaceIO({workspace,nativeExecutor:{catalog:[{name:'pwsh'}],execute:async()=>{calls++;return result(JSON.stringify({offset:0,total:0,names:[]}));}}});renameSync(workspace,join(root,'original'));if(mode==='plain')mkdirSync(workspace);else{const outside=join(root,'outside');mkdirSync(outside);symlinkSync(outside,workspace,process.platform==='win32'?'junction':'dir');}await assert.rejects(io.list('.'),/workspace.*(?:identity|changed|replaced)/i);await assert.rejects(io.read('file.txt'),/workspace.*(?:identity|changed|replaced)/i);assert.equal(calls,0);
 }
});

test('native IO accepts legal dot-dot prefixes through the original process service',async t=>{
 const bytes=Buffer.from('ordinary');let calls=0;const io=setup(t,async()=>{calls++;return result(JSON.stringify({offset:0,total:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')}));});assert.deepEqual(await io.read('..notes.txt'),bytes);assert.equal(calls,1);
});

test('native enumeration confirms a ctime-only transition once through the same service and rejects unstable repeats',async t=>{
 for(const mode of ['stable','changed-names','changes-again']){
  let io,calls=0;io=setup(t,async()=>{calls++;if(calls===1||mode==='changes-again'){await new Promise(r=>setTimeout(r,2));const before=statSync(io.workspace,{bigint:true});renameSync(io.workspace,io.workspace+'-moved');renameSync(io.workspace+'-moved',io.workspace);const after=statSync(io.workspace,{bigint:true});assert.equal(before.mtimeNs,after.mtimeNs);assert.notEqual(before.ctimeNs,after.ctimeNs);}return result(JSON.stringify({offset:0,total:1,names:[mode==='changed-names'&&calls>1?'b':'a']}));});if(mode==='stable')assert.deepEqual(await io.list('.'),{offset:0,total:1,names:['a']});else await assert.rejects(io.list('.'),/changed|stabiliz/i);assert.equal(calls,2);
 }
});
test('native IO uses the same opaque worktree lease without exposing legacy private bytes',async t=>{
 const root=mkdtempSync(join(tmpdir(),'native-io-worktree-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const w=worktreeFixture(root),bytes=Buffer.from('exact public bytes'),lease=createVerifiedWorktreeAuthority({authorizations:[w.authorization]}).leaseForWorkspace(w.workspace);let calls=0;
 const nativeExecutor={catalog:[{name:'pwsh'},{name:'write'}],execute:async()=>{calls++;return result(JSON.stringify({offset:0,total:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')}));}};
 const io=createNativeWorkspaceIO({...w,privateRoots:[w.legacyRoot],worktreeLease:lease,nativeExecutor});assert.deepEqual(await io.read('public.txt'),bytes);assert.deepEqual(await io.write('output.txt',bytes),bytes);assert.equal(calls,3);
 await assert.rejects(io.read('../auth.json'));await assert.rejects(io.read('.git'));assert.equal(calls,3);writeFileSync(join(w.admin,'commondir'),'changed');await assert.rejects(io.read('public.txt'),/metadata|identity|worktree/i);assert.equal(calls,3);
});
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

test('existing native writes register the original read only between exact byte and identity checks',async t=>{
 const root=mkdtempSync(join(tmpdir(),'native-rewrite-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const file=join(root,'out.txt'),original=Buffer.from('\ufeffold\r\n'),next=Buffer.from('\ufeffnew\r\n');writeFileSync(file,original);const calls=[];
 const io=createNativeWorkspaceIO({workspace:root,nativeExecutor:{catalog:['pwsh','read','write'].map(name=>({name})),execute:async(name,args)=>{calls.push(name);if(name==='read'){assert.equal(args.file_path,file);return {isError:false,content:[]};}if(name==='write'){writeFileSync(file,args.content);return{isError:false};}const bytes=readFileSync(file);return result(JSON.stringify({offset:0,total:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')}));}}});
 await io.read('out.txt');await io.write('out.txt',next);assert.deepEqual(calls,['pwsh','pwsh','read','pwsh','write','pwsh']);assert(readFileSync(file).equals(next));
});

test('existing native write cannot refresh away a prior exact-read conflict or a registration race',async t=>{
 for(const mode of ['changed-before',...(process.platform==='win32'?['case-alias']:[]),'restored-mtime','inode-before','mtime-before','changed-during','denied','missing-read','unknown-error']){
  const root=mkdtempSync(join(tmpdir(),'native-conflict-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const file=join(root,'out.txt');writeFileSync(file,'old');let writes=0,registrations=0;
  const io=createNativeWorkspaceIO({workspace:root,nativeExecutor:{catalog:(mode==='missing-read'?['pwsh','write']:['pwsh','read','write']).map(name=>({name})),execute:async name=>{if(name==='write'){writes++;throw Error('must not write');}if(name==='read'){registrations++;if(mode==='unknown-error')throw Object.assign(Error('native unknown failure'),{business:true});if(mode==='changed-during')writeFileSync(file,'new');return{isError:mode==='denied'};}const bytes=readFileSync(file);return result(JSON.stringify({offset:0,total:bytes.length,sha256:sha(bytes),base64:bytes.toString('base64')}));}}});
  await io.read('out.txt');const initialStat=statSync(file);if(['changed-before','case-alias','restored-mtime'].includes(mode))writeFileSync(file,'new');if(mode==='inode-before'){renameSync(file,file+'.old');writeFileSync(file,'old');}if(['restored-mtime','inode-before'].includes(mode))utimesSync(file,initialStat.atime,initialStat.mtime);if(mode==='mtime-before')utimesSync(file,initialStat.atime,new Date(initialStat.mtimeMs+2000));
  await assert.rejects(io.write(mode==='case-alias'?'OUT.TXT':'out.txt',Buffer.from('replacement')),/changed|reader|denied|failed|unknown failure/i);assert.equal(writes,0);if(['changed-before','case-alias','restored-mtime','inode-before','mtime-before','missing-read'].includes(mode))assert.equal(registrations,0);
  if(['changed-before','restored-mtime','inode-before','mtime-before'].includes(mode)){await assert.rejects(io.write('out.txt',Buffer.from('retry')),/changed/i);assert.equal(writes,0,'a rejected preflight refreshed the earlier baseline');}
 }
});
