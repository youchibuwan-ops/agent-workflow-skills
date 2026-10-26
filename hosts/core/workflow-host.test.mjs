import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync,linkSync,symlinkSync,lstatSync,realpathSync,chmodSync,utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorkflowHost } from './workflow-host.mjs';
import { createSourceProvider } from '../providers/source-provider.mjs';
import { SourceError,requestPublicHTTPS } from '../providers/source-provider.http.mjs';
import { createServer,get as httpGet } from 'node:http';
import { createSandboxProvider } from '../providers/sandbox-provider.mjs';
import {createNativeWorkspaceIO} from '../providers/native-workspace-io.mjs';
import {runtimeImporter} from '../dsh-global/runtime.mjs';
import {worktreeFixture} from '../security/verified-worktree.test-support.mjs';
import {createVerifiedWorktreeAuthority} from '../security/verified-worktree.mjs';

const sha = (x) => createHash('sha256').update(x).digest('hex');
const adopt = { candidate: 'current-export', decision: 'adopt', reason: 'Current physical method covers all scoped output fields.', covers: ['generation','sum','input_sha256'] };
test('core keeps the exact verified worktree carve-out and independent hard/sensitive/link denies',async t=>{
 const f=await setup(t),w=worktreeFixture(f.root);writeFileSync(join(w.workspace,'input.json'),f.input);const authority=createVerifiedWorktreeAuthority({authorizations:[w.authorization]}),lease=authority.leaseForWorkspace(w.workspace);
 const host=await createWorkflowHost({...f.config,workspace:w.workspace,stateRoot:join(f.root,'lease-state'),privateRoots:[w.legacyRoot],worktreeLease:lease});const call=(name,args)=>host.dispatch(name,args);
 assert.equal((await call('workflow_read_workspace',{path:'input.json'})).ok,true);assert.equal((await call('workflow_read_workspace',{path:'.git'})).ok,false);
 const secret=join(f.root,'private-note.txt');writeFileSync(secret,'PRIVATE');linkSync(secret,join(w.workspace,'alias.txt'));assert.equal((await call('workflow_read_workspace',{path:'alias.txt'})).ok,false);
 await assert.rejects(createWorkflowHost({...f.config,workspace:w.workspace,stateRoot:join(f.root,'blocked-lease'),privateRoots:[w.legacyRoot],hardPrivateRoots:[w.legacyRoot],worktreeLease:lease}),/private/i);
 writeFileSync(join(w.admin,'commondir'),'changed');assert.equal((await call('workflow_read_workspace',{path:'input.json'})).ok,false);
});
async function setup(t, overrides = {}, services = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trusted-workflow-host-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert(basename(root).startsWith('trusted-workflow-host-'));
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = join(root, 'workspace');
  const mirror = join(root, 'mirror/current-export');
  mkdirSync(workspace, { recursive: true }); mkdirSync(join(mirror, 'references'), { recursive: true });
  const input = '{"generation":"actual-current","values":[17,23]}\n';
  writeFileSync(join(workspace, 'input.json'), input);
  writeFileSync(join(mirror, 'SKILL.md'), '---\nname: current-export\ndescription: Use to export the current input.\n---\n# Method\nRead [method](references/method.md) and LICENSE; preserve current generation, sum all values and hash exact input bytes.\n');
  writeFileSync(join(mirror, 'references/method.md'), '# Exact current identity\nRead input.json raw bytes, preserve generation, sum values, hash SHA256; independently verify the output.\n');
  writeFileSync(join(mirror, 'LICENSE'), 'MIT controlled fixture license body\n');
  writeFileSync(join(root, 'ref-a.md'), '# Reference A\nCurrent identity is required.\n');
  writeFileSync(join(root, 'ref-b.md'), '# Reference B\nIndependent validation is required.\n');
  const cards = [];
  const config = { workspace, stateRoot: join(root, 'private-state'), taskId: 'host-task',
    userMessage: 'Use the selected JSON approach; execute and verify it autonomously. Do not change input.json.',
    contract: { requirements: ['generation', 'sum', 'input_sha256'], constraints: ['protected input'], stopAfter: 'learning',
      protectedInputs: ['input.json'], writeAllowlist: ['output.json'],
      selection: { mode: 'fixed', instruction: 'Use the selected JSON approach.' },
      feedback: { mode: 'delegated_verification', instruction: 'Execute technical validation autonomously.' },
      catalog: [{ id: 'current-export', path: mirror, version: 'fixture-current' }],
      references: [{ id: 'a', path: join(root, 'ref-a.md') }, { id: 'b', path: join(root, 'ref-b.md') }],
      validators: [{ id: 'current-json', type: 'json-export', input: 'input.json' }], learning: { required: false }, autoAdvance: false,
      ...overrides }, onCard: (card) => cards.push(card) };
  Object.assign(config,services);
  const host = await createWorkflowHost(config);
  const call = (name, args = {}) => host.dispatch(name, args, { callId: `test-${Math.random()}` });
  const checkpoint = async () => {
    const status = await call('workflow_status');
    return call('workflow_checkpoint', { done: ['Actual prerequisites inspected.'], evidence: status.state.evidence,
      next_action: 'Only the next permitted stage.' });
  };
  const inspect = async () => {
    assert.equal((await call('workflow_search_skills', { query: 'current export' })).ok, true);
    const opened = await call('workflow_open_skill', { candidate: 'current-export' });
    assert.equal(opened.ok, true);
    const proofs = [];
    for (const entry of opened.data.files) {
      const read = await call('workflow_read_source', { source: opened.data.source, path: entry.path });
      assert.equal(read.ok, true); proofs.push(read.data.source_receipt);
    }
    assert.equal((await call('workflow_confirm_sources', { receipts: proofs })).ok, true);
    assert.equal((await call('workflow_review_skill', { candidate: 'current-export', decision: 'adopt', reason: 'Covers current identity, sum and exact byte hash.', covers: ['generation', 'sum', 'input_sha256'] })).ok, true);
    assert.equal((await call('workflow_install_skill', { candidate: 'current-export' })).ok, true);
    for (const id of ['a', 'b']) {
      const reference = await call('workflow_open_reference', { reference: id });
      assert.equal(reference.ok, true);
      const proofs = [];
      for (const file of reference.data.files) {
        const read = await call('workflow_read_source', { source: reference.data.source, path: file.path });
        assert.equal(read.ok, true); proofs.push(read.data.source_receipt);
      }
      assert.equal((await call('workflow_confirm_sources', { receipts: proofs })).ok, true);
      assert.equal((await call('workflow_observe_reference', { source: reference.data.source, observation: `Actual ${id} source supports this task.` })).ok, true);
    }
    assert.equal((await checkpoint()).ok, true);
  };
  const output = JSON.stringify({ generation: 'actual-current', total: 40, input_sha256: sha(input) });
  return { root, workspace, mirror, host, call, checkpoint, inspect, cards, output, input, config };
}

test('a premature checkpoint gives executable discovery recovery without advancing or writing', async t=>{
 const f=await setup(t);
 const r=await f.call('workflow_checkpoint',{done:['Skip remaining research'],evidence:[],next_action:'write'});
 assert.equal(r.ok,false);assert.equal(r.recovery?.mode,'continue');
 assert(r.recovery.next_tools.includes('workflow_search_skills'));
 assert.equal(f.host.stage,'discovery');assert.equal(existsSync(join(f.workspace,'output.json')),false);
 assert.equal((await f.call(r.recovery.next_tools[0],{query:'current export'})).ok,true);
 const opened=await f.call('workflow_open_skill',{candidate:'current-export'});assert.equal(opened.ok,true);
 const early=await f.call('workflow_review_skill',adopt);assert.equal(early.ok,false);
 assert(early.recovery.next_tools.includes('workflow_read_source'));
 assert(!JSON.stringify(early.recovery).includes('source_receipt'));
 assert.equal(f.host.stage,'discovery');
});

test('actual published options wait for an external choice instead of instructing retries',async t=>{
 const f=await setup(t,{selection:{mode:'pending'}});await f.inspect();assert.equal(f.host.stage,'selection');
 const r=await f.call('workflow_checkpoint',{done:['Read two current sources'],evidence:[],next_action:'Wait for human',options:[
  {id:'a',description:'Detailed format',sources:['reference:a'],artifacts:['output.json']},
  {id:'b',description:'Compact format',sources:['reference:b'],artifacts:['output.json']},
  {id:'c',description:'Tabular format',sources:['reference:a','reference:b'],artifacts:['output.json']}
 ]});
 assert.equal(r.ok,false);assert.equal(r.recovery?.mode,'wait_for_user');assert.deepEqual(r.recovery.next_tools,[]);
 assert.equal(r.state.options.length,3);assert.equal(f.host.stage,'selection');
 assert.equal((await f.call('workflow_write',{path:'output.json',content:f.output})).ok,false);
 assert.equal(existsSync(join(f.workspace,'output.json')),false);
});

test('host performs scope before model tools and rejects unknown tools or fabricated facts', async (t) => {
  const f = await setup(t);
  assert.equal(f.host.ready, true); assert.equal(f.host.stage, 'discovery');
  assert.equal(f.cards[0].report.stage, 'scope');
  assert.equal((await f.call('exec_command', { command: 'write a marker' })).ok, false);
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  const forged = await f.call('workflow_checkpoint', { done: ['all read'], evidence: ['fake'], next_action: 'skip', receipts: [{ passed: true }] });
  assert.equal(forged.ok, false); assert.equal(f.host.stage, 'discovery');
});

test('input reading returns actual bytes and hash while host/config inputs remain unavailable', async (t) => {
  const f = await setup(t);
  const result = await f.call('workflow_read_workspace', { path: 'input.json' });
  assert.equal(result.ok, true); assert.equal(result.data.content, f.input); assert.equal(result.data.sha256, sha(f.input));
  assert.equal((await f.call('workflow_read_workspace', { path: '../private-state' })).ok, false);
  assert.equal((await f.call('workflow_read_workspace', { path: '.agents/skills/host/SKILL.md' })).ok, false);
});

test('mixed-case host directories cannot bypass path protection',async t=>{
 const f=await setup(t);mkdirSync(join(f.workspace,'.CoDeX'));writeFileSync(join(f.workspace,'.CoDeX/config.toml'),'PRIVATE_SENTINEL');
 const result=await f.call('workflow_read_workspace',{path:'.CoDeX/config.toml'});assert.equal(result.ok,false);
});

test('Windows case aliases cannot overwrite protected inputs',{skip:process.platform!=='win32'},async t=>{
 const f=await setup(t,{writeAllowlist:undefined});await f.inspect();await f.checkpoint();
 const result=await f.call('workflow_write',{path:'INPUT.JSON',content:'overwrite via alias'});assert.equal(result.ok,false);
 assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
});

test('pre-existing hard links cannot expose private host text through a public project name',async t=>{
 const f=await setup(t);const secret=join(f.root,'private-state/private-note.txt');writeFileSync(secret,'PRIVATE_TEXT_SENTINEL');linkSync(secret,join(f.workspace,'public-input.txt'));
 const r=await f.call('workflow_read_workspace',{path:'public-input.txt'});assert.equal(r.ok,false);assert.match(r.error,/hard.link/i);
 assert(!JSON.stringify(r).includes('PRIVATE_TEXT_SENTINEL'));
});

test('Windows ambiguous dot, space and DOS short-name forms are refused before file access',{skip:process.platform!=='win32'},async t=>{
 const f=await setup(t);
 for(const path of ['.codex./config.toml','.CoDeX /config.toml','NODE_M~1/hidden.js','input.json.','nul.txt']){const r=await f.call('workflow_read_workspace',{path});assert.equal(r.ok,false,path);assert.match(r.error,/alias|credential|unavailable/i);}
});

test('zero-byte ancillary resources need an actual one-use confirmation and survive the gate', async t=>{
 const f=await setup(t);writeFileSync(join(f.mirror,'references/empty.py'),'');
 await f.call('workflow_search_skills',{query:'export'});
 const opened=await f.call('workflow_open_skill',{candidate:'current-export'});
 for(const file of opened.data.files.filter(x=>x.bytes>0)){
  const r=await f.call('workflow_read_source',{source:opened.data.source,path:file.path});
  assert.equal((await f.call('workflow_confirm_sources',{receipts:[r.data.source_receipt]})).ok,true);
 }
 assert.equal((await f.call('workflow_review_skill',adopt)).ok,false);
 const r=await f.call('workflow_read_source',{source:opened.data.source,path:'references/empty.py'});
 assert.equal(r.ok,true);assert.equal(r.data.content,'');assert.equal(r.data.complete,false);
 assert.equal((await f.call('workflow_confirm_sources',{receipts:[r.data.source_receipt]})).ok,true);
 assert.equal((await f.call('workflow_confirm_sources',{receipts:[r.data.source_receipt]})).ok,false);
 assert.equal((await f.call('workflow_review_skill',adopt)).ok,true);
 assert.equal((await f.call('workflow_install_skill',{candidate:'current-export'})).ok,true);
 for(const id of ['a','b']){
  const o=await f.call('workflow_open_reference',{reference:id});
  const r=await f.call('workflow_read_source',{source:o.data.source,path:o.data.files[0].path});
  await f.call('workflow_confirm_sources',{receipts:[r.data.source_receipt]});
  await f.call('workflow_observe_reference',{source:o.data.source,observation:'Actually read current reference.'});
 }
 assert.equal((await f.checkpoint()).ok,true);
});

test('empty Skill or license bodies never become adoptable bundles',async t=>{
 const f=await setup(t);await f.call('workflow_search_skills',{query:'export'});
 writeFileSync(join(f.mirror,'LICENSE'),'');
 assert.equal((await f.call('workflow_open_skill',{candidate:'current-export'})).ok,false);
 writeFileSync(join(f.mirror,'LICENSE'),'MIT license fixture');writeFileSync(join(f.mirror,'SKILL.md'),'');
 assert.equal((await f.call('workflow_open_skill',{candidate:'current-export'})).ok,false);
});

test('real acquisition provider searches local first, acquires a COPYING license and confirms actual resources',async t=>{
 const f=await setup(t);renameSync(join(f.mirror,'LICENSE'),join(f.mirror,'COPYING'));
 const provider=createSourceProvider({installedRoots:[dirname(f.mirror)],cacheRoot:join(f.root,'acquisition'),external:false});
 const host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'provider-host'),sourceProvider:provider});
 const call=(name,args={})=>host.dispatch(name,args);
 const early=await call('workflow_search_skills',{query:'current export',external:true,gap:'Need unsupported capability'});
 assert.equal(early.ok,false);assert.match(early.error,/installed Skills first/);
 const found=await call('workflow_search_skills',{query:'current export'});assert.equal(found.ok,true);
 const candidate=found.data.candidates.find(x=>x.nameHint==='current-export');assert(candidate);
 const opened=await call('workflow_open_skill',{candidate:candidate.id});assert.equal(opened.ok,true,opened.error);
 const receipts=[];
 for(const file of opened.data.files){const r=await call('workflow_read_source',{source:opened.data.source,path:file.path});assert.equal(r.ok,true);receipts.push(r.data.source_receipt);}
 assert.equal((await call('workflow_confirm_sources',{receipts})).ok,true);
 assert.equal((await call('workflow_review_skill',{...adopt,candidate:candidate.id})).ok,true);
 assert.equal((await call('workflow_install_skill',{candidate:candidate.id})).ok,true);
 assert.equal((await call('workflow_write',{path:'output.json',content:f.output})).ok,false);
 assert.equal(existsSync(join(f.workspace,'output.json')),false);
});

// The real provider sees public HTTPS source identities. Only its trusted test
// transport routes those requests to this local HTTP server; production SSRF
// policy and all repository/blob/acquisition logic remain unchanged.
async function sourceHttpFixture(t,f,{mode='ready',maxBytes}={}){
 const commit='a'.repeat(40),tree='b'.repeat(40),requests=[];
 const files=new Map(['SKILL.md','LICENSE','references/method.md'].map(p=>['skills/current-export/'+p,readFileSync(join(f.mirror,p))]));
 const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
 const control={mode};
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture.invalid'),host=url.searchParams.get('host'),path=url.pathname;requests.push({host,path});
  let body,status=200;
  if(host==='skills.sh')body=JSON.stringify({skills:[{source:'fixture/current',skillId:'writing-clearly-and-concisely'},{source:'fixture/current',skillId:'current-export'}]});
  else if(path.endsWith('/commits/HEAD')){
   if(control.mode==='http404'||control.mode==='http429'){status=control.mode==='http404'?404:429;body='unavailable';}
   else body=control.mode==='invalidjson'?'{':JSON.stringify({sha:commit,commit:{tree:{sha:tree}}});
  }else if(path.includes('/git/trees/'))body=JSON.stringify({sha:control.mode==='badtree'?'c'.repeat(40):tree,tree:[...files].map(([path,b])=>({path,type:'blob',mode:'100644',size:b.length,sha:blob(b)}))});
  else if(host==='raw.githubusercontent.com'){
   body=files.get(decodeURIComponent(path.split('/').slice(4).join('/')));
   if(control.mode==='badblob'&&body){body=Buffer.from(body);body[0]^=1;}
  }else if(path==='/reference')body='Current complete reference body';
  if(body===undefined){status=404;body='missing';}res.writeHead(status);res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const get=async url=>{
  if(control.mode==='timeout')return requestPublicHTTPS(url,{timeoutMs:5,lookup:()=>new Promise(()=>{})});
  const source=new URL(url),target=new URL('http://127.0.0.1:'+server.address().port+source.pathname);target.searchParams.set('host',source.hostname);
  return new Promise((resolve,reject)=>{httpGet(target,res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(parts),complete:res.complete}));res.on('error',reject);}).on('error',reject);});
 };
 const provider=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'http-acquisition'),get,...(maxBytes?{maxBytes}:{})});
 return {provider,control,requests};
}

test('a stale external catalog path is recoverable and another current candidate can finish all seven stages',async t=>{
 const f=await setup(t),remote=await sourceHttpFixture(t,f);
 const host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'http-host'),sourceProvider:remote.provider});
 const call=(name,args={})=>host.dispatch(name,args);
 await call('workflow_search_skills',{query:'current export'});
 const found=await call('workflow_search_skills',{query:'current export',external:true,gap:'No installed method'});assert.equal(found.ok,true);
 const before=host.exportAudit(),bad=await call('workflow_open_skill',{candidate:'github:fixture/current/writing-clearly-and-concisely'});
 assert.equal(bad.fatal,undefined,JSON.stringify(bad));assert.equal(bad.ok,false);assert.equal(bad.code,'AMBIGUOUS_SKILL_PATH');
 assert.equal(bad.source_operation,'acquire');assert.equal(host.ready,true);assert.equal(host.stage,'discovery');
 assert.equal(bad.recovery.mode,'continue');assert(bad.recovery.next_tools.includes('workflow_open_skill'));assert(bad.recovery.next_tools.includes('workflow_search_skills'));
 assert.deepEqual(bad.state.evidence,before.events.filter(e=>e.event==='observed'&&e.stage==='discovery').map(e=>e.id));
 assert(!host.exportAudit().events.some(e=>e.event==='source_returned'));
 assert.equal((await call('workflow_read_source',{source:'skill:github:fixture/current/writing-clearly-and-concisely',path:'SKILL.md'})).ok,false);
 assert.equal((await call('workflow_write',{path:'output.json',content:f.output})).ok,false);assert(!existsSync(join(f.workspace,'output.json')));
 const candidate='github:fixture/current/current-export',opened=await call('workflow_open_skill',{candidate});assert.equal(opened.ok,true,opened.error);
 const receipts=[];for(const file of opened.data.files){const read=await call('workflow_read_source',{source:opened.data.source,path:file.path});receipts.push(read.data.source_receipt);}
 assert.equal((await call('workflow_confirm_sources',{receipts})).ok,true);
 assert.equal((await call('workflow_review_skill',{...adopt,candidate})).ok,true);assert.equal((await call('workflow_install_skill',{candidate})).ok,true);
 for(const reference of ['a','b']){const opened=await call('workflow_open_reference',{reference});const read=await call('workflow_read_source',{source:opened.data.source,path:opened.data.files[0].path});await call('workflow_confirm_sources',{receipts:[read.data.source_receipt]});assert.equal((await call('workflow_observe_reference',{source:opened.data.source,observation:'Actual current reference supports this export.'})).ok,true);}
 const checkpoint=async()=>{const r=await call('workflow_status');return call('workflow_checkpoint',{done:['Actual verified prerequisites'],evidence:r.state.evidence,next_action:'Next stage only'});};
 assert.equal((await checkpoint()).ok,true);assert.equal((await checkpoint()).ok,true);assert.equal(host.stage,'draft');
 assert.equal((await call('workflow_write',{path:'output.json',content:f.output})).ok,true);assert.equal((await call('workflow_validate',{validator:'current-json',artifact:'output.json'})).ok,true);
 for(let i=0;i<3;i++)assert.equal((await checkpoint()).ok,true);assert.equal(host.stage,'learning');
 assert.equal((await call('workflow_learn',{decision:'no_increment',reason:'The inspected current method covers the independently validated output.',evidence:[candidate,'output.json']})).ok,true);
 assert.equal((await checkpoint()).ok,true);assert.equal(host.complete,true);assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 assert.deepEqual(JSON.parse(readFileSync(join(f.workspace,'output.json'),'utf8')),JSON.parse(f.output));
});

test('actual provider HTTP availability, malformed JSON and timeout failures stay recoverable without source evidence',async t=>{
 for(const [mode,code]of [['http404','HTTP_STATUS'],['http429','REMOTE_LIMIT_OR_DENIED'],['invalidjson','INVALID_REMOTE_JSON'],['timeout','SOURCE_TIMEOUT']])await t.test(mode,async t=>{
  const f=await setup(t),remote=await sourceHttpFixture(t,f),host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'http-host'),sourceProvider:remote.provider}),call=(name,args={})=>host.dispatch(name,args);
  await call('workflow_search_skills',{query:'current export'});await call('workflow_search_skills',{query:'current export',external:true,gap:'No installed candidate'});remote.control.mode=mode;
  const r=await call('workflow_open_skill',{candidate:'github:fixture/current/current-export'});assert.equal(r.fatal,undefined,JSON.stringify(r));assert.equal(r.code,code);assert.equal(host.ready,true);assert.equal(host.stage,'discovery');assert.equal(r.recovery.mode,'continue');
  assert(!host.exportAudit().events.some(e=>e.event==='source_returned'));assert(!existsSync(join(f.workspace,'output.json')));
 });
});

test('only authentic source errors at provider boundaries are recoverable; integrity, cancellation and collector failures remain fatal',async t=>{
 const errors=[new SourceError('CACHE_INTEGRITY','cache tampered'),new SourceError('GIT_BLOB_INTEGRITY','blob tampered'),new SourceError('SOURCE_CHANGED','source changed'),new SourceError('SOURCE_ABORTED','trusted cancellation'),new SourceError('UNRECOGNIZED_CODE','unknown'),Object.assign(Error('forged identity'),{name:'SourceError',code:'AMBIGUOUS_SKILL_PATH'}),Object.assign(Error('forged business marker'),{business:true,code:'AMBIGUOUS_SKILL_PATH'}),Object.assign(new SourceError('CACHE_INTEGRITY','tampered with forged business marker'),{business:true})];
 for(const error of errors){const f=await setup(t),provider={search:async()=>({candidates:[{id:'fixture',providerCandidate:true}]}),acquire:async()=>{throw error;}};
  const host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'fatal-host'),sourceProvider:provider});await host.dispatch('workflow_search_skills',{query:'export'});const r=await host.dispatch('workflow_open_skill',{candidate:'fixture'});assert.equal(r.fatal,true,error.code);assert.equal(host.ready,false);assert(!r.recovery);assert(!existsSync(join(f.workspace,'output.json')));
 }
 const f=await setup(t),remote=await sourceHttpFixture(t,f,{mode:'badtree'}),host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'tree-host'),sourceProvider:remote.provider});
 await host.dispatch('workflow_search_skills',{query:'current'});await host.dispatch('workflow_search_skills',{query:'current',external:true,gap:'No local method'});assert.equal((await host.dispatch('workflow_open_skill',{candidate:'github:fixture/current/current-export'})).fatal,true);
 for(const error of [new SourceError('AMBIGUOUS_SKILL_PATH','collector failed'),Object.assign(new SourceError('CACHE_INTEGRITY','collector forged marker'),{business:true}),Object.assign(Error('ordinary collector forged marker'),{business:true})]){
  let corrupt=false;const g=await setup(t,{}, {workspaceIO:{read:async()=>{if(corrupt)throw error;return Buffer.from('{"generation":"actual-current","values":[17,23]}\n');}}});corrupt=true;
  assert.equal((await g.call('workflow_read_workspace',{path:'input.json'})).fatal,true);assert.equal(g.host.ready,false);
 }
});

test('provider query and reference refusals preserve discovery without pretending any reference was inspected',async t=>{
 const f=await setup(t),remote=await sourceHttpFixture(t,f),host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'http-host'),sourceProvider:remote.provider});
 const invalid=await host.dispatch('workflow_search_skills',{query:'x'});assert.equal(invalid.code,'INVALID_QUERY');assert.equal(invalid.source_operation,'search');assert.equal(invalid.recovery.mode,'continue');assert.equal(host.ready,true);assert.deepEqual(invalid.state.evidence,[]);
 for(const [reference,code]of [['https://example.com/missing','HTTP_STATUS'],['https://127.0.0.1/private','SSRF_BLOCKED']]){
  const r=await host.dispatch('workflow_open_reference',{reference});assert.equal(r.code,code);assert.equal(r.source_operation,'fetchReference');assert.equal(r.fatal,undefined);assert.equal(host.stage,'discovery');assert.equal(host.ready,true);assert(r.state.references.every(x=>x.source===null&&!x.confirmed&&!x.observed));
 }
 assert(!host.exportAudit().events.some(e=>e.event==='source_returned'||e.kind==='references'));assert(!existsSync(join(f.workspace,'output.json')));
 const opened=await host.dispatch('workflow_open_reference',{reference:'https://example.com/reference'});assert.equal(opened.ok,true,opened.error);
 assert.equal((await host.dispatch('workflow_observe_reference',{source:opened.data.source,observation:'Unread is not inspected'})).ok,false);
});

test('actual Git blob or acquired cache tampering still aborts before exposing source bytes or granting writes',async t=>{
 for(const mode of ['badblob','cache','cache-limit'])await t.test(mode,async t=>{
  const f=await setup(t),remote=await sourceHttpFixture(t,f,{maxBytes:1024}),host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'http-host'),sourceProvider:remote.provider});
  await host.dispatch('workflow_search_skills',{query:'current export'});await host.dispatch('workflow_search_skills',{query:'current export',external:true,gap:'No local method'});
  const candidate='github:fixture/current/current-export';
  if(mode.startsWith('cache')){const acquired=await remote.provider.acquire(candidate);if(mode==='cache-limit')writeFileSync(join(acquired.path,'unexpected.txt'),Buffer.alloc(2048,0x61));else writeFileSync(join(acquired.path,'LICENSE'),'tampered cache bytes');}else remote.control.mode=mode;
  const r=await host.dispatch('workflow_open_skill',{candidate});assert.equal(r.fatal,true);assert.equal(host.ready,false);assert(!r.recovery);assert(!host.exportAudit().events.some(e=>e.event==='source_returned'));
  const primary=r.state.blockedReason;host.abort('Gateway stopped');host.abort('Last desktop subscriber disconnected');assert.equal(host.exportAudit().failed,primary);
  const after=await host.dispatch('workflow_write',{path:'output.json',content:f.output});assert.equal(after.fatal,true);assert.equal(after.state.blockedReason,primary);assert(!existsSync(join(f.workspace,'output.json')));assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 });
});

test('an explicit user stop remains the primary cause after repeated cleanup and refused dispatches',async t=>{
 const f=await setup(t);f.host.abort('User requested pause');f.host.abort('Gateway stopped');f.host.abort('Last subscriber disconnected');
 assert.equal(f.host.exportAudit().failed,'User requested pause');assert.equal(f.host.ready,false);
 const r=await f.call('workflow_search_skills',{query:'export'});assert.equal(r.fatal,true);assert.equal(r.state.blockedReason,'User requested pause');assert.equal(f.host.exportAudit().failed,'User requested pause');
 const cleanup=f.host.exportAudit().events.filter(e=>e.event==='abort_cleanup');assert(cleanup.some(e=>e.reason==='Gateway stopped'));assert(cleanup.some(e=>e.reason==='Last subscriber disconnected'));
 assert(!existsSync(join(f.workspace,'output.json')));
});

test('a genuinely oversized unacquired candidate can be refused without aborting discovery',async t=>{
 const f=await setup(t),remote=await sourceHttpFixture(t,f,{maxBytes:1}),host=await createWorkflowHost({...f.config,stateRoot:join(f.root,'bounded-source-host'),sourceProvider:remote.provider});
 await host.dispatch('workflow_search_skills',{query:'current export'});await host.dispatch('workflow_search_skills',{query:'current export',external:true,gap:'No local method'});
 const r=await host.dispatch('workflow_open_skill',{candidate:'github:fixture/current/current-export'});assert.equal(r.code,'SOURCE_LIMIT');assert.equal(r.fatal,undefined);assert.equal(host.ready,true);assert.equal(host.stage,'discovery');assert.equal(r.recovery.mode,'continue');assert(!host.exportAudit().events.some(e=>e.event==='source_returned'));assert(!existsSync(join(f.workspace,'output.json')));
});

test('project IO uses the injected native permission boundary for read/write and independent readback',async t=>{
 let reads=0,writes=0;const bytes=new Map([['input.json',Buffer.from('{"generation":"actual-current","values":[17,23]}\n')]]);
 const io={read:async path=>{reads++;if(!bytes.has(path))throw Error('native input permission denied');return bytes.get(path);},write:async(path,data)=>{writes++;bytes.set(path,data);return data;}};
 const f=await setup(t,{}, {workspaceIO:io});await f.inspect();await f.checkpoint();
 const r=await f.call('workflow_read_workspace',{path:'input.json'});assert.equal(r.ok,true);assert.equal(r.data.content,f.input);
 const output=await f.call('workflow_write',{path:'output.json',content:f.output});assert.equal(output.ok,true,output.error);
 assert.equal(writes,1);assert.equal(existsSync(join(f.workspace,'output.json')),false);
 const validated=await f.call('workflow_validate',{validator:'current-json',artifact:'output.json'});assert.equal(validated.ok,true,validated.error);assert(reads>3);
 writeFileSync(join(f.workspace,'private.txt'),'A real file whose native read is denied.');const denied=await f.call('workflow_read_workspace',{path:'private.txt'});assert.equal(denied.ok,false);assert.equal(denied.fatal,true);assert.match(denied.error,/native input permission denied/);
});

test('missing and nonregular actor read arguments are refused before actual native IO without granting source facts',async t=>{
 let io,nativeCalls=0;const f=await setup(t,{protectedInputs:[]},{workspaceIO:{read:path=>io.read(path),write:(path,b)=>io.write(path,b)}});mkdirSync(join(f.workspace,'directory'));
 io=createNativeWorkspaceIO({workspace:f.workspace,nativeExecutor:{catalog:[{name:'pwsh'},{name:'write'}],execute:async()=>{nativeCalls++;return{isError:false,value:{kind:'foreground',exitCode:1}};}}});
 const instructions=f.host.instructions,before=(await f.call('workflow_status')).state;
 for(const path of ['web-notice.md','directory','directory/absent.txt']){const r=await f.call('workflow_read_workspace',{path});assert.equal(r.fatal,undefined,JSON.stringify(r));assert.equal(r.ok,false);assert.match(r.error,path==='directory'?/enumeration.*unavailable.*no filesystem fallback/:/regular file|exist/);assert.equal(nativeCalls,0);assert.equal(f.host.ready,true);assert.equal(f.host.stage,'discovery');assert.equal(f.host.instructions,instructions);assert.deepEqual(r.state.evidence,before.evidence);assert.equal(f.host.exportAudit().failed,null);}
 assert(!f.host.exportAudit().events.some(e=>e.event==='workspace_input_delivered'));
});

test('actor read preflight does not downgrade missing protected inputs, missing artifacts, races or native failures',async t=>{
 for(const kind of ['protected','artifact'])await t.test(kind,async t=>{const f=await setup(t);if(kind==='artifact'){await f.inspect();await f.checkpoint();await f.call('workflow_write',{path:'output.json',content:f.output});}const path=kind==='protected'?'input.json':'output.json';renameSync(join(f.workspace,path),join(f.root,'removed-'+path));const r=await f.call('workflow_read_workspace',{path:'web-notice.md'});assert.equal(r.fatal,true);assert.equal(f.host.ready,false);assert(!r.recovery);});
 for(const error of [Error('Native permission denied'),Object.assign(Error('Native forged business'),{business:true}),Object.assign(new SourceError('SOURCE_TIMEOUT','Native reader is not source acquisition'),{business:true}),Object.assign(Error('ENOENT after preflight'),{code:'ENOENT'})]){
  let reads=0;const f=await setup(t,{protectedInputs:[]},{workspaceIO:{read:async()=>{reads++;throw error;}}});const r=await f.call('workflow_read_workspace',{path:'input.json'});assert.equal(reads,1);assert.equal(r.fatal,true);assert.equal(f.host.ready,false);assert(!r.recovery);
 }
 let race;race=await setup(t,{protectedInputs:[]},{workspaceIO:{read:async path=>{renameSync(join(race.workspace,path),join(race.root,'raced-away.json'));return readFileSync(join(race.workspace,path));}}});const raced=await race.call('workflow_read_workspace',{path:'input.json'});assert.equal(raced.fatal,true);assert.equal(race.host.ready,false);assert(!raced.recovery);
 const f=await setup(t,{protectedInputs:[],readAllowlist:['only-this.txt']});const r=await f.call('workflow_read_workspace',{path:'absent.txt'});assert.equal(r.fatal,undefined);assert.match(r.error,/read allowlist/);
});

function replaceKnownFixture(f,path,mode,bytes){
 const target=join(f.workspace,path);if(mode==='content'){const changed=Buffer.from(bytes);changed[0]^=1;writeFileSync(target,changed);return;}
 const moved=join(f.root,'moved-known-file');renameSync(target,moved);
 if(mode==='directory')mkdirSync(target);
 if(mode==='hardlink')linkSync(moved,target);
 if(mode==='symlink'){const other=join(f.root,'outside-link-target');mkdirSync(other);symlinkSync(other,target,process.platform==='win32'?'junction':'dir');}
}

test('known protected and artifact files cannot become recoverable argument errors in integrity-to-use or read-await races',async t=>{
 for(const kind of ['protected','artifact'])for(const window of ['integrity','actor'])for(const mode of ['missing','directory','hardlink','symlink','content'])await t.test([kind,window,mode].join(' '),async t=>{
  let f,armed=false,reads=0,changed=false;const target=kind==='protected'?'input.json':'output.json';
  const io={read:async path=>{const bytes=f?readFileSync(join(f.workspace,path)):Buffer.from('{"generation":"actual-current","values":[17,23]}\n');if(armed&&path===target&&++reads===(window==='integrity'?1:2)){replaceKnownFixture(f,path,mode,bytes);changed=true;}return bytes;},write:async(path,bytes)=>{writeFileSync(join(f.workspace,path),bytes);return bytes;}};
  f=await setup(t,{protectedInputs:kind==='protected'?['input.json']:[]},{workspaceIO:io});if(kind==='artifact'){await f.inspect();await f.checkpoint();assert.equal((await f.call('workflow_write',{path:'output.json',content:f.output})).ok,true);}
  const delivered=f.host.exportAudit().events.filter(e=>e.event==='workspace_input_delivered').length;armed=true;const r=await f.call('workflow_read_workspace',{path:target});assert.equal(changed,true);assert.equal(r.fatal,true,JSON.stringify(r));assert.equal(f.host.ready,false);assert(f.host.exportAudit().failed);assert(!r.recovery);assert.equal(f.host.exportAudit().events.filter(e=>e.event==='workspace_input_delivered').length,delivered);
 });
});

test('path policy refusals inside trusted integrity stay fatal while a new actor hardlink remains a business refusal',async t=>{
 for(const kind of ['protected','artifact'])for(const mode of ['hardlink','symlink'])await t.test(kind+' '+mode,async t=>{
  const f=await setup(t,{protectedInputs:kind==='protected'?['input.json']:[]});const target=kind==='protected'?'input.json':'output.json';if(kind==='artifact'){await f.inspect();await f.checkpoint();await f.call('workflow_write',{path:target,content:f.output});}replaceKnownFixture(f,target,mode,readFileSync(join(f.workspace,target)));
  const r=await f.call('workflow_read_workspace',{path:'not-created-new-target.md'});assert.equal(r.fatal,true,JSON.stringify(r));assert.equal(f.host.ready,false);assert(!r.recovery);
 });
 const g=await setup(t,{protectedInputs:[]});writeFileSync(join(g.workspace,'plain.txt'),'ordinary');linkSync(join(g.workspace,'plain.txt'),join(g.workspace,'alias.txt'));const r=await g.call('workflow_read_workspace',{path:'alias.txt'});assert.equal(r.ok,false);assert.equal(r.fatal,undefined);assert.equal(g.host.ready,true);
});

test('actual Windows SDK ACL bookkeeping status changes require same-channel byte confirmation instead of aborting an unchanged input',{skip:process.platform!=='win32'||!process.env.DSH_RUNTIME_ROOT},async t=>{
 let f,grant,reads=0;const fields=['dev','ino','mode','nlink','size','mtimeNs','ctimeNs'],deltas=[];
 f=await setup(t,{protectedInputs:[]},{workspaceIO:{read:async path=>{reads++;const file=join(f.workspace,path),before=lstatSync(file,{bigint:true});grant.add(realpathSync.native(f.workspace),true);const bytes=readFileSync(file),after=lstatSync(file,{bigint:true});deltas.push(fields.filter(field=>before[field]!==after[field]));return bytes;}}});
 const {AclWriteGrant,workspaceWriteSid}=await runtimeImporter(process.env.DSH_RUNTIME_ROOT)('@deepseek-ai/dsh-sandbox-windows-acl');grant=AclWriteGrant.create(workspaceWriteSid(realpathSync.native(f.workspace)));const bytes=Buffer.from('\ufeffactual unchanged input\r\n');writeFileSync(join(f.workspace,'ordinary.txt'),bytes);
 try{const r=await f.call('workflow_read_workspace',{path:'ordinary.txt'});assert.equal(r.ok,true,JSON.stringify({error:r.error,deltas}));assert.equal(r.data.sha256,sha(bytes));assert.equal(reads,2);assert.deepEqual(deltas,[['ctimeNs'],[]]);assert.equal(f.host.ready,true);assert.equal(f.host.exportAudit().failed,null);assert(readFileSync(join(f.workspace,'ordinary.txt')).equals(bytes));}
 finally{grant.dispose();}
});

test('a status-only change never admits different confirmation bytes, denied confirmation or unbounded instability',async t=>{
 for(const mode of ['bytes','denied','unstable'])await t.test(mode,async t=>{
  let f,reads=0;const epoch=1700000000,statusChanges=[],fields=['dev','ino','mode','nlink','size','mtimeNs'];
  const changeStatus=async(file,before)=>{
   const deadline=performance.now()+2000,permissions=Number(before.mode)&0o777;
   while(true){
    chmodSync(file,permissions^0o200);chmodSync(file,permissions);
    const after=lstatSync(file,{bigint:true});
    for(const field of fields)assert.equal(after[field],before[field],'Fixture status mutation changed '+field);
    if(after.ctimeNs!==before.ctimeNs){statusChanges.push({read:reads,before:String(before.ctimeNs),after:String(after.ctimeNs)});return;}
    assert(performance.now()<deadline,'Fixture could not produce a ctime-only change within 2 seconds');
    await new Promise(resolve=>setTimeout(resolve,10));
   }
  };
  f=await setup(t,{protectedInputs:[]},{workspaceIO:{read:async path=>{
   reads++;if(reads===2&&mode==='denied')throw Object.assign(Error('Native confirmation permission denied'),{business:true});const file=join(f.workspace,path),bytes=readFileSync(file),before=lstatSync(file,{bigint:true});
   if(reads===1&&mode==='bytes'){const changed=Buffer.from(bytes);changed[0]^=1;writeFileSync(file,changed);utimesSync(file,epoch,epoch);await changeStatus(file,before);}
   if(mode!=='bytes'&&(reads===1||mode==='unstable'))await changeStatus(file,before);
   return bytes;
  }}});utimesSync(join(f.workspace,'input.json'),epoch,epoch);
  const r=await f.call('workflow_read_workspace',{path:'input.json'});assert.equal(statusChanges.length,mode==='unstable'?2:1,JSON.stringify({error:r.error,reads,statusChanges}));assert.equal(r.fatal,true);assert.equal(reads,2,JSON.stringify({error:r.error,reads}));assert.equal(f.host.ready,false);assert(!r.recovery);assert(!f.host.exportAudit().events.some(e=>e.event==='workspace_input_delivered'));
 });
});

test('an actor output path that is already a directory refuses before its native writer and preserves draft recovery',async t=>{
 let writes=0;const f=await setup(t,{protectedInputs:[]}, {workspaceIO:{read:async path=>readFileSync(join(f.workspace,path)),write:async()=>{writes++;throw Error('Directory must not reach writer');}}});await f.inspect();await f.checkpoint();mkdirSync(join(f.workspace,'output.json'));
 const r=await f.call('workflow_write',{path:'output.json',content:'Not a regular file'});assert.equal(r.fatal,undefined,JSON.stringify(r));assert.equal(r.ok,false);assert.equal(writes,0);assert.equal(f.host.ready,true);assert.equal(f.host.stage,'draft');assert(r.recovery.next_tools.includes('workflow_write'));
});

test('declared newline materialization preserves Unicode BOM and literal escapes while raw default stays byte exact',async t=>{
 const raw='\ufeff汉😀\r\nA\rB\nC\u2028D\\r\\nEND',lf='\ufeff汉😀\nA\nB\nC\u2028D\\r\\nEND',crlf='\ufeff汉😀\r\nA\r\nB\r\nC\u2028D\\r\\nEND';
 for(const [newline,expected]of [[undefined,raw],['preserve',raw],['LF',lf],['CRLF',crlf],['CRLF','ordinary\\r\\ntext']])await t.test(String(newline)+' '+expected.length,async t=>{
  const content=expected==='ordinary\\r\\ntext'?expected:raw;const f=await setup(t,{validators:[{id:'text',type:'exact-text',expected,covers:['generation','sum','input_sha256']}]});await f.inspect();await f.checkpoint();
  const r=await f.call('workflow_write',{path:'output.json',content,...(newline===undefined?{}:{newline})});assert.equal(r.ok,true,r.error);const bytes=readFileSync(join(f.workspace,'output.json'));assert(bytes.equals(Buffer.from(expected)));assert.equal(r.data.sha256,sha(Buffer.from(expected)));assert.equal(r.data.bytes,Buffer.byteLength(expected));
  const audit=f.host.exportAudit().events.filter(e=>e.event==='write_normalization');if(newline===undefined){assert.deepEqual(Object.keys(r.data).sort(),['artifact','bytes','sha256']);assert.equal(audit.length,0);}else{const metadata={newline,raw_input_sha256:sha(Buffer.from(content)),output_sha256:sha(Buffer.from(expected))};assert.deepEqual(r.data.normalization,metadata);assert.deepEqual(audit.map(({event,path,...value})=>value),[metadata]);}
  assert.equal((await f.call('workflow_validate',{validator:'text',artifact:'output.json'})).ok,true);assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 });
});

test('newline declaration cannot bypass stages paths size limits validation or exact writer readback',async t=>{
 const f=await setup(t);const early=await f.call('workflow_write',{path:'output.json',content:'a\nb',newline:'CRLF'});assert.equal(early.ok,false);assert.equal(early.fatal,undefined);await f.inspect();await f.checkpoint();
 for(const newline of ['lf','CR','\r\n',null,4,{},[]]){const r=await f.call('workflow_write',{path:'output.json',content:'x',newline});assert.equal(r.ok,false);assert.equal(r.fatal,undefined);assert.equal(f.host.stage,'draft');assert(!existsSync(join(f.workspace,'output.json')));}
 for(const path of ['../outside.txt','.env','input.json','unselected.md']){const r=await f.call('workflow_write',{path,content:'x\ny',newline:'LF'});assert.equal(r.ok,false);assert.equal(r.fatal,undefined);}
 const big=await f.call('workflow_write',{path:'output.json',content:'\n'.repeat(1024*1024+1),newline:'CRLF'});assert.equal(big.ok,false);assert.equal(big.fatal,undefined);assert(!existsSync(join(f.workspace,'output.json')));
 let g;g=await setup(t,{protectedInputs:[]},{workspaceIO:{read:async path=>readFileSync(join(g.workspace,path)),write:async(path,bytes)=>{writeFileSync(join(g.workspace,path),Buffer.concat([bytes,Buffer.from('tampered')]));}}});await g.inspect();await g.checkpoint();const bad=await g.call('workflow_write',{path:'output.json',content:'a\nb',newline:'CRLF'});assert.equal(bad.fatal,true);assert.equal(g.host.ready,false);assert(!g.host.exportAudit().events.some(e=>e.event==='write_normalization'||e.kind==='application'));
});

test('structural artifact validation never certifies the original task without current external acceptance',async t=>{
 const f=await setup(t,{requirements:['artifact-readable','original-user-task'],feedback:{mode:'required'},validators:[{id:'artifact-current',type:'current-text',covers:['artifact-readable']}],autoAdvance:true});
 // Adopt against this actual scope; the method's semantics remain a proposal.
 await f.call('workflow_search_skills',{query:'export'});const o=await f.call('workflow_open_skill',{candidate:'current-export'});
 const proofs=[];for(const file of o.data.files){const r=await f.call('workflow_read_source',{source:o.data.source,path:file.path});proofs.push(r.data.source_receipt);}await f.call('workflow_confirm_sources',{receipts:proofs});
 await f.call('workflow_review_skill',{...adopt,covers:['artifact-readable','original-user-task']});await f.call('workflow_install_skill',{candidate:'current-export'});
 for(const id of ['a','b']){const o=await f.call('workflow_open_reference',{reference:id});const r=await f.call('workflow_read_source',{source:o.data.source,path:o.data.files[0].path});await f.call('workflow_confirm_sources',{receipts:[r.data.source_receipt]});await f.call('workflow_observe_reference',{source:o.data.source,observation:'Current actual reference read.'});}
 assert.equal(f.host.stage,'draft');await f.call('workflow_write',{path:'output.json',content:f.output});
 const r=await f.call('workflow_validate',{validator:'artifact-current',artifact:'output.json'});
 assert.equal(r.ok,true,r.error);assert.equal(r.data.semantic_goal_verified,false);assert.equal(f.host.stage,'feedback');assert.equal(f.host.complete,false);
 assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'all done',evidence:['actor assertion']})).ok,false);
 await f.host.acceptUserMessage('/workflow accept');assert.equal(f.host.stage,'learning');
 const audit=f.host.exportAudit();assert(audit.events.some(x=>x.kind==='external_goal_acceptance'));
});

test('installed documentation and non-Python files refuse before the real sandbox provider and allow guarded write recovery',async t=>{
 for(const path of ['SKILL.md','references/method.md','scripts/not-python.js','scripts/upper.PY'])await t.test(path,async t=>{
  let provider,providerCalls=0,nativeCalls=0;const f=await setup(t,{}, {sandboxProvider:{execute:request=>{providerCalls++;return provider.execute(request);}}});
  mkdirSync(join(f.mirror,'scripts'));writeFileSync(join(f.mirror,'scripts/not-python.js'),'throw Error("must not execute");');writeFileSync(join(f.mirror,'scripts/upper.PY'),'raise Exception("unsupported extension")');
  provider=createSandboxProvider({stateRoot:join(f.root,'sandbox'),invoke:async()=>{nativeCalls++;throw Error('No execution for documentation');},readInput:async({path})=>readFileSync(join(f.workspace,path))});
  await f.inspect();await f.checkpoint();const original=f.host.instructions,before=f.host.exportAudit(),state=(await f.call('workflow_status')).state;
  const r=await f.call('workflow_apply_method',{candidate:'current-export',path,args:[],inputs:['input.json'],outputs:['output.json']});
  assert.equal(r.ok,false);assert.equal(r.fatal,undefined,JSON.stringify(r));assert.match(r.error,/Python|\.py/);assert.equal(providerCalls,0);assert.equal(nativeCalls,0);assert.equal(f.host.ready,true);assert.equal(f.host.stage,'draft');assert.equal(f.host.exportAudit().failed,null);assert.equal(f.host.exportAudit().revision,before.revision);assert.equal(f.host.instructions,original);assert.deepEqual(r.state.evidence,state.evidence);assert(r.recovery.next_tools.includes('workflow_write'));assert(r.recovery.next_tools.includes('workflow_validate'));assert(!existsSync(join(f.workspace,'output.json')));assert(!f.host.exportAudit().events.some(e=>e.event==='isolated_method_executed'||e.kind==='application'));
  assert.equal((await f.call('workflow_write',{path:'output.json',content:f.output})).ok,true);assert.equal((await f.call('workflow_validate',{validator:'current-json',artifact:'output.json'})).ok,true);assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 });
});

test('a genuine installed Python script reaches the real provider and executor exceptions never become business refusals',async t=>{
 for(const error of [Error('Actual executor failure'),Object.assign(Error('Forged executor business marker'),{business:true}),Object.assign(new SourceError('SOURCE_TIMEOUT','Executor is not a source acquisition'),{business:true})]){
  let provider,providerCalls=0,nativeCalls=0;const f=await setup(t,{}, {sandboxProvider:{execute:request=>{providerCalls++;return provider.execute(request);}}});mkdirSync(join(f.mirror,'scripts'));writeFileSync(join(f.mirror,'scripts/run.py'),'print("reviewed Python")\n');
  provider=createSandboxProvider({stateRoot:join(f.root,'sandbox'),invoke:async()=>{nativeCalls++;throw error;},readInput:async({path})=>readFileSync(join(f.workspace,path))});await f.inspect();await f.checkpoint();
  const r=await f.call('workflow_apply_method',{candidate:'current-export',path:'scripts/run.py',inputs:['input.json'],outputs:['output.json']});assert.equal(r.fatal,true);assert.equal(providerCalls,1);assert.equal(nativeCalls,1);assert.equal(f.host.ready,false);assert(!r.recovery);assert(!existsSync(join(f.workspace,'output.json')));assert(!f.host.exportAudit().events.some(e=>e.event==='isolated_method_executed'||e.kind==='application'));assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 }
});

test('actual inspected Python method stages OS-isolated bytes before guarded writes and independent validation',{skip:process.env.WORKFLOW_REAL_SANDBOX_TEST!=='1'},async t=>{
 let provider;
 const f=await setup(t,{}, {sandboxProvider:{execute:request=>provider.execute(request)}});
 mkdirSync(join(f.mirror,'scripts'));writeFileSync(join(f.mirror,'scripts/run.py'),"from pathlib import Path\nimport json,hashlib\nb=Path('input.json').read_bytes();d=json.loads(b)\nPath('output.json').write_text(json.dumps({'generation':d['generation'],'total':sum(d['values']),'input_sha256':hashlib.sha256(b).hexdigest()}))\n");
 provider=createSandboxProvider({stateRoot:join(f.root,'sandbox'),executionPolicy:'test-only-direct'});
 const early=await f.call('workflow_apply_method',{candidate:'current-export',path:'scripts/run.py',inputs:['input.json'],outputs:['output.json']});assert.equal(early.ok,false);
 await f.inspect();await f.checkpoint();
 const result=await f.call('workflow_apply_method',{candidate:'current-export',path:'scripts/run.py',inputs:['input.json'],outputs:['output.json']});
 assert.equal(result.ok,true,result.error);assert.equal(result.data.executed,true);assert.equal(readFileSync(join(f.workspace,'input.json'),'utf8'),f.input);
 assert.equal((await f.call('workflow_validate',{validator:'current-json',artifact:'output.json'})).ok,true);
 assert(f.host.exportAudit().events.some(x=>x.event==='isolated_method_executed'&&x.isolation.processCreation==='seccomp-denied'));
});

test('UTF-8 chunks join exactly without silent truncation or broken boundary acknowledgments', async (t) => {
  const f = await setup(t);
  const body = '汉字😀'.repeat(4000);
  writeFileSync(join(f.mirror, 'references/method.md'), body);
  await f.call('workflow_search_skills', { query: 'export' });
  const source = await f.call('workflow_open_skill', { candidate: 'current-export' });
  let offset = 0; let actual = '';
  while (offset < Buffer.byteLength(body)) {
    const chunk = await f.call('workflow_read_source', { source: source.data.source, path: 'references/method.md', offset, length: 11999 });
    assert.equal(chunk.ok, true); assert(chunk.data.end > offset);
    actual += chunk.data.content; offset = chunk.data.end;
  }
  assert.equal(actual, body);
});

test('source and workspace delivery preserve leading and chunk-boundary BOM bytes', async (t) => {
  const f = await setup(t);
  const text = '\uFEFF' + 'x'.repeat(11997) + '\uFEFFtail';
  writeFileSync(join(f.workspace, 'bom.txt'), text);
  const first = await f.call('workflow_read_workspace', { path: 'bom.txt', length: 12000 });
  const second = await f.call('workflow_read_workspace', { path: 'bom.txt', offset: first.data.end });
  assert.equal(first.data.content + second.data.content, text);
  assert.equal(sha(Buffer.from(first.data.content + second.data.content)), sha(Buffer.from(text)));
  writeFileSync(join(f.mirror, 'references/method.md'), text);
  await f.call('workflow_search_skills', { query: 'export' });
  const source = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const a = await f.call('workflow_read_source', { source: source.data.source, path: 'references/method.md', length: 12000 });
  const b = await f.call('workflow_read_source', { source: source.data.source, path: 'references/method.md', offset: a.data.end });
  assert.equal(a.data.content + b.data.content, text);
});

test('download and a partial returned source never satisfy inspection or installation', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  await f.call('workflow_read_source', { source: opened.data.source, path: 'SKILL.md', length: 5 });
  const review = await f.call('workflow_review_skill', { candidate: 'current-export', decision: 'adopt', covers: ['generation','sum','input_sha256'], reason: 'Claimed sufficient.' });
  assert.equal(review.ok, false);
  assert.equal((await f.call('workflow_install_skill', { candidate: 'current-export' })).ok, false);
  assert.equal((await f.checkpoint()).ok, false);
});

test('precomputed same-response reads and review cannot mark unseen results inspected', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const replies = await Promise.all([
    ...opened.data.files.map((entry) => f.call('workflow_read_source', { source: opened.data.source, path: entry.path })),
    f.call('workflow_review_skill', adopt),
  ]);
  assert.equal(replies.at(-1).ok, false, 'A native scheduler executing a read before review is not evidence the model has received the read');
  assert(!f.host.exportAudit().events.some((e) => e.kind === 'skill_review'));
  const proofs = replies.slice(0, -1).map((r) => r.data.source_receipt);
  assert(proofs.every((p) => typeof p === 'string' && p.length >= 32));
  assert.equal((await f.call('workflow_confirm_sources', { receipts: proofs })).ok, true);
  assert.equal((await f.call('workflow_review_skill', adopt)).ok, true);
});

test('confirmation is atomic, opaque, one-use, source-bound and cannot acknowledge missing bytes', async (t) => {
  const f = await setup(t);
  await f.call('workflow_search_skills', { query: 'export' });
  const opened = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: 'SKILL.md', length: 5 });
  const proof = read.data.source_receipt;
  assert.equal(typeof proof, 'string');
  assert(!JSON.stringify((await f.call('workflow_status')).data).includes(proof));
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof, 'made-up'] })).ok, false);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof] })).ok, true);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [proof] })).ok, false);
  assert.equal((await f.call('workflow_review_skill', adopt)).ok, false, 'Confirming five bytes must not approve a full bundle');
  const old = await f.call('workflow_read_source', { source: opened.data.source, path: 'LICENSE' });
  await f.call('workflow_open_skill', { candidate: 'current-export' });
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [old.data.source_receipt] })).ok, false);
});

test('references also require a proof from their actual returned body before observation', async (t) => {
  const f = await setup(t);
  const opened = await f.call('workflow_open_reference', { reference: 'a' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
  assert.equal((await f.call('workflow_observe_reference', { source: opened.data.source, observation: 'I claim I read it.' })).ok, false);
  assert.equal((await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] })).ok, true);
  assert.equal((await f.call('workflow_observe_reference', { source: opened.data.source, observation: 'The actual current reference requires current identity.' })).ok, true);
});

test('a reference catalog ID is not a source handle; refusal identifies the usable current handle', async (t) => {
  const f = await setup(t);
  const opened = await f.call('workflow_open_reference', { reference: 'a' });
  const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
  await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] });
  const wrong = await f.call('workflow_observe_reference', { source: 'a', observation: 'The current reference supports the task.' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /source handle/i);
  assert.match(wrong.error, /reference:a/);
  assert.equal(wrong.state.references[0].source, 'reference:a');
  assert.equal(wrong.state.references[0].confirmed, true);
  assert.equal((await f.call('workflow_observe_reference', { source: wrong.state.references[0].source, observation: 'The returned current reference supports the task.' })).ok, true);
});

test('complete actual-source/readback/choice/write/validation/learning chain succeeds', async (t) => {
  const f = await setup(t);
  await f.inspect(); assert.equal(f.host.stage, 'selection');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'draft');
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, true);
  assert.equal((await f.checkpoint()).ok, false); // No independent validation yet.
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, true);
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'feedback');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'delivery');
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.stage, 'learning');
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal((await f.call('workflow_learn', { decision: 'no_increment', reason: 'The already inspected current export method covers the independently verified result.', evidence: ['current-export', 'output.json'] })).ok, true);
  assert.equal((await f.checkpoint()).ok, true); assert.equal(f.host.complete, true);
  assert.deepEqual(f.cards.filter((x) => x.kind === 'checkpoint').map((x) => x.report.stage),
    ['scope','discovery','selection','draft','feedback','delivery','learning']);
  assert.equal(readFileSync(join(f.workspace, 'input.json'), 'utf8'), f.input);
});

test('only trusted external input can choose a direction and accept feedback', async (t) => {
  const f = await setup(t, { selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await f.inspect();
  assert.equal((await f.checkpoint()).ok, false);
  const status = await f.call('workflow_status');
  assert.equal((await f.call('workflow_checkpoint', { done: ['I choose A'], evidence: status.state.evidence, next_action: 'draft', user_choice: 'A' })).ok, false);
  const options = ['A','B','C'].map((id) => ({ id, description: `Actual distinct approach ${id}`, sources: ['reference:a','reference:b'] }));
  assert.equal((await f.call('workflow_checkpoint', { done: ['Presented three supported approaches.'], evidence: [], next_action: 'Wait for the user.', options })).ok, false);
  await f.host.acceptUserMessage('/workflow choose A');
  assert.equal((await f.checkpoint()).ok, true);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal((await f.checkpoint()).ok, true);
  assert.equal((await f.checkpoint()).ok, false);
  await f.host.acceptUserMessage('/workflow accept');
  assert.equal((await f.checkpoint()).ok, true);
});

test('external choice boundary whitespace is recognized without changing the raw choice or acceptance audit',async t=>{
 for(const [raw,accept]of [['/workflow choose A\n','/workflow accept\n'],['/workflow choose A\r\n','/workflow accept\r\n'],[' \t/workflow choose A \r\n',' \t/workflow accept \r\n']])await t.test(JSON.stringify(raw),async t=>{
  const f=await setup(t,{selection:{mode:'pending'},feedback:{mode:'required'},conversationMode:true});await f.inspect();
  const options=['A','B','C'].map(id=>({id,description:'Actually inspected plan '+id,sources:['reference:a','reference:b'],artifacts:['output.json']}));
  await f.call('workflow_checkpoint',{done:['Publish inspected choices'],evidence:[],next_action:'Wait for real user',options});
  await f.host.acceptUserMessage(raw);assert.equal(f.host.stage,'selection');assert.equal(f.host.exportAudit().revision,1);assert.equal((await f.checkpoint()).ok,true);assert.equal(f.host.stage,'draft');
  assert.equal(f.host.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,raw);
  await f.call('workflow_write',{path:'output.json',content:f.output});await f.call('workflow_validate',{validator:'current-json',artifact:'output.json'});assert.equal((await f.checkpoint()).ok,true);assert.equal(f.host.stage,'feedback');
  await f.host.acceptUserMessage(accept);assert.equal(f.host.exportAudit().revision,1);assert.equal(f.host.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,accept);assert.equal((await f.checkpoint()).ok,true);assert.equal(f.host.stage,'delivery');
 });
});

test('multiline external control-looking text never grants choice or acceptance and is preserved as a full correction',async t=>{
 for(const [atFeedback,raw]of [[false,'/workflow choose A\n/workflow accept'],[false,'/workflow choose A\r\nPlease change the output.'],[true,'/workflow accept\nPlease change the date.'],[true,'/workflow accept\r\n/workflow choose B']])await t.test(JSON.stringify(raw),async t=>{
  const f=await setup(t,{selection:{mode:'pending'},feedback:{mode:'required'},conversationMode:true});await f.inspect();
  await f.call('workflow_checkpoint',{done:['Publish inspected choices'],evidence:[],next_action:'Wait for real user',options:['A','B','C'].map(id=>({id,description:'Actual plan '+id,sources:['reference:a','reference:b'],artifacts:['output.json']}))});
  if(atFeedback){await f.host.acceptUserMessage('/workflow choose A');await f.checkpoint();await f.call('workflow_write',{path:'output.json',content:f.output});await f.call('workflow_validate',{validator:'current-json',artifact:'output.json'});await f.checkpoint();assert.equal(f.host.stage,'feedback');}
  await f.host.acceptUserMessage(raw);assert.equal(f.host.stage,'discovery');assert.equal(f.host.complete,false);assert.equal(f.host.exportAudit().revision,2);assert(f.host.instructions.includes(raw));assert.equal(f.host.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,raw);
  assert.equal((await f.call('workflow_write',{path:'output.json',content:'not authorized by multiline text'})).ok,false);
 });
});

test('an unshown or invalid human choice and premature acceptance never cache authorization', async (t) => {
  const f = await setup(t, { selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await assert.rejects(f.host.acceptUserMessage('/workflow choose A'));
  await assert.rejects(f.host.acceptUserMessage('/workflow accept'));
  await f.inspect();
  const options = ['A','B','C'].map((id) => ({ id, description: `Actual distinct approach ${id}`, sources: ['reference:a','reference:b'] }));
  assert.equal((await f.call('workflow_checkpoint', { done: ['Present options'], evidence: [], next_action: 'Wait', options })).ok, false);
  await assert.rejects(f.host.acceptUserMessage('/workflow choose D'));
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  const forgedOptions = options.map((o) => ({ ...o, sources: ['made-up-reference'] }));
  const denied = await f.call('workflow_checkpoint', { done: ['Options'], evidence: [], next_action: 'Wait', options: forgedOptions });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /inspected|reference/i);
});

test('a validator never claims uncovered requirements or reveals a frozen answer to the actor', async (t) => {
  const f = await setup(t, { validators: [{ id: 'partial', type: 'exact-text', expected: 'hidden-oracle', covers: ['generation'] }] });
  assert(!f.host.instructions.includes('hidden-oracle'));
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: 'hidden-oracle' });
  assert.equal((await f.call('workflow_validate', { validator: 'partial', artifact: 'output.json' })).ok, true);
  await f.checkpoint(); await f.checkpoint();
  assert.equal(f.host.stage, 'delivery');
  assert.equal((await f.checkpoint()).ok, false);
  assert.equal(f.host.complete, false);
});

test('external revision reopens the draft and invalidates old artifact validation and acceptance', async (t) => {
  const f = await setup(t, { feedback: { mode: 'required' } });
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  await f.checkpoint(); assert.equal(f.host.stage, 'feedback');
  await f.host.acceptUserMessage('Revise the draft and verify it again.');
  assert.equal(f.host.stage, 'draft');
  assert.equal((await f.checkpoint()).ok, false);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal((await f.checkpoint()).ok, true);
  assert.equal((await f.checkpoint()).ok, false);
  await f.host.acceptUserMessage('/workflow accept');
  assert.equal((await f.checkpoint()).ok, true);
});

test('protected input, traversal and failed verification are rejected without changing stages', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  for (const path of ['input.json', '../private-state/key', '.codex/config.toml', '.dsh/cordis.yml']) {
    assert.equal((await f.call('workflow_write', { path, content: 'bad' })).ok, false, path);
  }
  await f.call('workflow_write', { path: 'output.json', content: '{"generation":"wrong","total":40}' });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, false);
  assert.equal((await f.checkpoint()).ok, false); assert.equal(f.host.stage, 'draft');
  assert.equal(readFileSync(join(f.workspace, 'input.json'), 'utf8'), f.input);
});

test('independent JSON refusal identifies a mistaken field name without disclosing the oracle', async (t) => {
  const f = await setup(t); await f.inspect(); await f.checkpoint();
  const wrong = { generation: 'actual-current', sum: 40, input_sha256: sha(f.input) };
  await f.call('workflow_write', { path: 'output.json', content: JSON.stringify(wrong) });
  const result = await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(result.ok, false);
  assert.match(result.error, /total/);
  assert.match(result.error, /unexpected.*sum/i);
  assert(!result.error.includes(sha(f.input)));
  assert.equal(f.host.stage, 'draft');
});

test('external input/installed payload changes and an abort fail closed', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  writeFileSync(join(f.workspace, 'input.json'), 'changed externally');
  const result = await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal(result.ok, false); assert.equal(result.fatal, true); assert.equal(f.host.ready, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  const g = await setup(t);
  g.host.abort('controller failed');
  assert.equal((await g.call('workflow_search_skills', { query: 'export' })).ok, false);
  assert.equal(g.host.ready, false);
});

test('required real Skill maintenance cannot be waived with actor-authored no-increment text', async (t) => {
  const f = await setup(t, { learning: { required: true } });
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  await f.checkpoint(); await f.checkpoint(); await f.checkpoint();
  assert.equal(f.host.stage, 'learning');
  assert.equal((await f.call('workflow_learn', { decision: 'no_increment', reason: 'I say no changes.', evidence: ['output.json'] })).ok, false);
  assert.equal((await f.checkpoint()).ok, false); assert.equal(f.host.complete, false);
});

test('a declared stop boundary prevents real write handlers and reads after the boundary', async (t) => {
  const f = await setup(t, { stopAfter: 'selection' });
  await f.inspect(); await f.checkpoint();
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  assert.equal(existsSync(join(f.workspace, 'output.json')), false);
  assert.equal((await f.call('workflow_read_workspace', { path: 'input.json' })).ok, false);
});

test('correcting an artifact requires new validation and can then finish the draft checkpoint', async (t) => {
  const f = await setup(t);
  await f.inspect(); await f.checkpoint();
  await f.call('workflow_write', { path: 'output.json', content: '{"wrong":true}' });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, false);
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal((await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' })).ok, true);
  assert.equal((await f.checkpoint()).ok, true);
});

async function automaticDiscovery(f) {
  await f.call('workflow_search_skills', { query: 'current export' });
  const bundle = await f.call('workflow_open_skill', { candidate: 'current-export' });
  const proofs = [];
  for (const file of bundle.data.files) proofs.push((await f.call('workflow_read_source', { source: bundle.data.source, path: file.path })).data.source_receipt);
  await f.call('workflow_confirm_sources', { receipts: proofs });
  await f.call('workflow_review_skill', adopt);
  await f.call('workflow_install_skill', { candidate: 'current-export' });
  for (const reference of ['a','b']) {
    const opened = await f.call('workflow_open_reference', { reference });
    const read = await f.call('workflow_read_source', { source: opened.data.source, path: opened.data.files[0].path });
    await f.call('workflow_confirm_sources', { receipts: [read.data.source_receipt] });
    await f.call('workflow_observe_reference', { source: opened.data.source, observation: `Actual source ${reference} supports current input and independent validation.` });
  }
}

test('host automatically emits ordered evidence cards without actor-authored checkpoint ceremonies', async (t) => {
  const f = await setup(t, { autoAdvance: true });
  await automaticDiscovery(f);
  assert.equal(f.host.stage, 'draft');
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  assert.equal(f.host.stage, 'draft');
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(f.host.stage, 'learning');
  await f.call('workflow_learn', { decision: 'no_increment', reason: 'The fully inspected current-export method covers this independently validated output.', evidence: ['current-export','output.json'] });
  assert.equal(f.host.complete, true);
  assert.deepEqual(f.cards.filter((x) => x.kind === 'checkpoint').map((x) => x.report.stage), ['scope','discovery','selection','draft','feedback','delivery','learning']);
  assert(!f.host.exportAudit().events.some((e) => e.event === 'tool' && e.name === 'workflow_checkpoint'));
});

test('automatic reports still stop for actual user choice, current feedback and declared boundaries', async (t) => {
  const f = await setup(t, { autoAdvance: true, selection: { mode: 'pending' }, feedback: { mode: 'required' } });
  await automaticDiscovery(f); assert.equal(f.host.stage, 'selection');
  assert.equal((await f.call('workflow_write', { path: 'output.json', content: f.output })).ok, false);
  const options = ['A','B','C'].map((id) => ({ id, description: `Current supported option ${id}`, sources: ['reference:a','reference:b'] }));
  await f.call('workflow_checkpoint', { done: ['Present actual choices'], evidence: [], next_action: 'Wait for user choice', options });
  assert(f.cards.some((c) => c.kind === 'options'));
  await f.host.acceptUserMessage('/workflow choose A'); assert.equal(f.host.stage, 'draft');
  await f.call('workflow_write', { path: 'output.json', content: f.output });
  await f.call('workflow_validate', { validator: 'current-json', artifact: 'output.json' });
  assert.equal(f.host.stage, 'feedback');
  await f.host.acceptUserMessage('/workflow accept'); assert.equal(f.host.stage, 'learning');
  const stopped = await setup(t, { autoAdvance: true, stopAfter: 'selection' });
  await automaticDiscovery(stopped);
  assert.equal((await stopped.call('workflow_write', { path: 'output.json', content: stopped.output })).ok, false);
  assert(!existsSync(join(stopped.workspace, 'output.json')));
});
