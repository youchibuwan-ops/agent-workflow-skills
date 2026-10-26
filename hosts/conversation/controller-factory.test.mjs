import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,renameSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {relative} from 'node:path';
import {userInfo} from 'node:os';
import {realpathSync} from 'node:fs';
import {createConversationFactory,toolSchemas} from './controller-factory.mjs';
import {worktreeFixture} from '../security/verified-worktree.test-support.mjs';
import {authorizeResume} from './resume-authorization.mjs';
import {SourceError} from '../providers/source-provider.http.mjs';
import {finalState} from '../codex/rpc-policy.mjs';

test('an explicit readonly diagnostic reply can finish pending only after current real search and file evidence; writes stay locked',async t=>{
 const f=fixture(t);writeFileSync(join(f.workspace,'input.txt'),'current real bytes');const c=await createConversationFactory(f.options)({...f.input,userMessage:'只读检查当前项目，不要修改文件，确认事实后停止。'});assert.equal(finalState(c).status,'blocked');await c.dispatch('workflow_search_skills',{query:'inspect current project'});assert.equal(finalState(c).status,'blocked');assert.equal((await c.dispatch('workflow_read_workspace',{path:'absent.txt'})).ok,false);assert.equal(finalState(c).status,'blocked');assert.equal((await c.dispatch('workflow_read_workspace',{path:'input.txt'})).ok,true);assert.equal(c.complete,false);assert.equal(finalState(c).status,'pending');assert.equal((await c.dispatch('workflow_write',{path:'output.txt',content:'not authorized'})).ok,false);assert.equal(readdirSync(f.workspace).includes('output.txt'),false);await c.acceptUserMessage('现在进度怎么样？');assert.equal(finalState(c).status,'pending');await c.acceptUserMessage('现在修改项目中的实际逻辑。');assert.equal(finalState(c).status,'blocked');assert.equal(c.complete,false);
});

test('quoted readonly wording does not convert a production request into a readonly reply, and abort never inherits pending permission',async t=>{
 for(const text of ['请解释“只读检查、不要修改文件”这句话，然后修改项目。','这是模型建议的“只读检查当前项目，不要修改文件”，但我现在要求实际修改项目中的逻辑。','只读检查当前项目，不要修改文件，但现在请修改实际逻辑。']){const f=fixture(t);writeFileSync(join(f.workspace,'input.txt'),'source');const c=await createConversationFactory(f.options)({...f.input,userMessage:text,readonlyReplyIntent:true});await c.dispatch('workflow_search_skills',{query:'inspect current project'});await c.dispatch('workflow_read_workspace',{path:'input.txt'});assert.equal(finalState(c).status,'blocked',text);await c.acceptUserMessage('只读检查当前项目，不要修改文件。');await c.dispatch('workflow_search_skills',{query:'inspect current project'});await c.dispatch('workflow_read_workspace',{path:'input.txt'});assert.equal(finalState(c).status,'pending');c.abort('Actual failure');assert.equal(finalState(c).status,'blocked');assert.equal(finalState(c).blockedReason,'Actual failure');}
});

test('cold restore preserves the latest signed readonly intent, revocation, fresh-evidence boundary and fail-closed legacy behavior',async t=>{
 const f=fixture(t);writeFileSync(join(f.workspace,'input.txt'),'source');const read=async c=>{assert.equal((await c.dispatch('workflow_search_skills',{query:'inspect current project'})).ok,true);assert.equal((await c.dispatch('workflow_read_workspace',{path:'input.txt'})).ok,true);return finalState(c);};const c=await createConversationFactory(f.options)({...f.input,userMessage:'只读检查当前项目，不要修改文件。'});assert.equal((await read(c)).status,'pending');await c.acceptUserMessage('现在修改项目中的实际逻辑。');assert.equal((await read(c)).status,'blocked');const resumed=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});assert(resumed.instructions.includes('现在修改项目中的实际逻辑。'));assert.equal((await read(resumed)).status,'blocked');assert.equal((await resumed.dispatch('workflow_write',{path:'out.txt',content:'not selected'})).ok,false);await resumed.acceptUserMessage('只读检查当前项目，不要修改文件。');assert.equal((await read(resumed)).status,'pending');const current=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});assert.equal(finalState(current).status,'blocked','restore never carries old source proofs');assert.equal((await read(current)).status,'pending');await current.acceptUserMessage('现在进度怎么样？');assert.equal(finalState(current).status,'pending');
 const envelope=join(f.options.stateRoot,'sessions',createHash('sha256').update(f.input.sessionId).digest('hex')+'.json'),stored=JSON.parse(readFileSync(envelope));assert.equal(stored.body.readonlyReplyIntent,true);delete stored.body.readonlyReplyIntent;stored.signature=createHmac('sha256',readFileSync(join(f.options.stateRoot,'envelope.key'))).update(JSON.stringify(stored.body)).digest('hex');writeFileSync(envelope,JSON.stringify(stored));const legacy=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined,readonlyReplyIntent:true});assert.equal((await read(legacy)).status,'blocked','legacy state cannot infer permission from accumulated text');assert.deepEqual(readdirSync(f.workspace),['input.txt']);
});
test('paused native resume consumes only a current owner grant, retains original scope, and re-verifies facts',async t=>{const f=fixture(t),factory=createConversationFactory(f.options),old=await factory(f.input);await old.dispatch('workflow_search_skills',{query:'ordinary task'});old.abort('Native Agent disposed');await assert.rejects(factory({...f.input,kind:'resume',userMessage:undefined}),/explicit external/);await assert.rejects(factory({...f.input,kind:'resume',userMessage:'/workflow resume',resumeAuthorized:true,authorization:{passed:true}}),/explicit external|authorization/i);authorizeResume({...f.options,...f.input});const restored=await factory({...f.input,kind:'resume',userMessage:undefined});assert.equal(restored.stage,'discovery');assert.equal(restored.exportAudit().failed,null);assert.match(restored.instructions,/Inspect the current project/);assert.equal((await restored.dispatch('workflow_status')).state.candidates.length,0);assert.equal(restored.exportAudit().restoration.strategy,'reverify-current-facts');});
test('factory owns lease issuance, re-verifies cold restore, and never trusts actor input as owner authorization',async t=>{
 const f=fixture(t),w=worktreeFixture(f.root),options={...f.options,privateRoots:[w.legacyRoot],worktreeAuthorizations:[w.authorization]},input={...f.input,workspace:w.workspace};writeFileSync(join(w.workspace,'input.txt'),'public');
 const factory=createConversationFactory(options),first=await factory(input);assert.equal((await first.dispatch('workflow_search_skills',{query:'inspect current project'})).ok,true);assert.equal((await first.dispatch('workflow_read_workspace',{path:'input.txt'})).ok,true);
 const cold=await createConversationFactory(options)({...input,kind:'resume',userMessage:undefined});assert.equal((await cold.dispatch('workflow_read_workspace',{path:'input.txt'})).ok,false);assert.equal((await cold.dispatch('workflow_search_skills',{query:'inspect current project'})).ok,true);assert.equal((await cold.dispatch('workflow_read_workspace',{path:'input.txt'})).ok,true);
 await assert.rejects(createConversationFactory({...options,stateRoot:join(f.root,'unauthorized'),worktreeAuthorizations:[]})({...input,worktreeLease:{workspace:w.workspace,legacyRoot:w.legacyRoot}}),/private|lease/i);
 const pointer=join(w.admin,'gitdir'),old=readFileSync(pointer);renameSync(pointer,pointer+'.old');writeFileSync(pointer,old);await assert.rejects(factory({...input,previousController:first,userMessage:'status'}),/identity|metadata/i);
 writeFileSync(join(w.admin,'commondir'),'changed');await assert.rejects(createConversationFactory(options)({...input,kind:'resume',userMessage:undefined}),/metadata|identity|worktree/i);
});
function fixture(t){const root=mkdtempSync(join(tmpdir(),'conversation-factory-test-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});const workspace=join(root,'project'),installed=join(root,'skills'),expert=join(installed,'test-expert');mkdirSync(workspace);mkdirSync(expert,{recursive:true});writeFileSync(join(expert,'SKILL.md'),'---\nname: test-expert\ndescription: test actual ordinary task method\n---\nRead current input and validate the actual result.\n');writeFileSync(join(expert,'LICENSE'),'MIT test fixture license');const options={stateRoot:join(root,'private'),installedRoots:[installed],external:false};return{root,workspace,options,input:{workspace,sessionId:'ordinary-session',taskId:'external-task',userMessage:'Inspect the current project and propose a repair; preserve existing behavior.'}};}
test('ordinary human task creates scope and real local discovery without a JSON export fixture',async t=>{
 const f=fixture(t),factory=createConversationFactory(f.options),controller=await factory(f.input);
 assert.equal(controller.stage,'discovery');assert.equal(controller.complete,false);assert.deepEqual(controller.toolSchemas,toolSchemas);
 assert.match(controller.instructions,/Inspect the current project/);assert(!controller.instructions.includes('generation, total'));
 const early=await controller.dispatch('workflow_write',{path:'out.md',content:'skip'});assert.equal(early.ok,false);
 const found=await controller.dispatch('workflow_search_skills',{query:'ordinary task'});assert.equal(found.ok,true);assert.equal(found.data.candidates.length,1);
 const opened=await controller.dispatch('workflow_open_skill',{candidate:found.data.candidates[0].id});assert.equal(opened.ok,true);
 assert.equal((await controller.dispatch('pwsh',{command:'raw bypass'})).ok,false);
});
test('restart rebinds original human scope but invalidates old source delivery facts',async t=>{
 const f=fixture(t),factory=createConversationFactory(f.options),controller=await factory(f.input);
 await controller.dispatch('workflow_search_skills',{query:'ordinary task'});
 const restored=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(restored.stage,'discovery');assert.match(restored.instructions,/Inspect the current project/);
 const status=await restored.dispatch('workflow_status');assert.equal(status.state.candidates.length,0);
 assert.equal(restored.exportAudit().restoration.strategy,'reverify-current-facts');
});

test('automatic native rebind preserves unfinished scope and adds the actual new human message',async t=>{
 const f=fixture(t);await createConversationFactory(f.options)(f.input);
 const restored=await createConversationFactory(f.options)({...f.input,kind:'auto',userMessage:'Continue and preserve the input BOM.'});
 assert.match(restored.instructions,/Inspect the current project/);assert.match(restored.instructions,/preserve the input BOM/);assert.equal(restored.ready,true);
 assert.equal((await restored.dispatch('workflow_status')).state.revision,2);
 const first=await createConversationFactory({...f.options,stateRoot:join(f.root,'fresh')})({...f.input,kind:'auto',userMessage:'A genuinely new actual user task.'});
 assert.match(first.instructions,/genuinely new actual user task/);assert.equal(first.exportAudit().restoration,null);
});

test('same-process native resume retains task evidence while rebinding every read to the new Agent executor',async t=>{
 const f=fixture(t),bytes=Buffer.from('CURRENT NATIVE BYTES');writeFileSync(join(f.workspace,'native.txt'),bytes);let first=0,second=0;
 const executor=which=>({catalog:[{name:'pwsh'}],execute:async()=>{if(which===1)first++;else second++;return{isError:false,value:{kind:'foreground',exitCode:0,stdout:{text:JSON.stringify({offset:0,total:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')}),truncated:false},stderr:{text:'',truncated:false}}};}});
 const factory=createConversationFactory(f.options),old=await factory({...f.input,nativeExecutor:executor(1)});
 await old.dispatch('workflow_search_skills',{query:'ordinary task'});assert.equal((await old.dispatch('workflow_read_workspace',{path:'native.txt'})).ok,true);assert.equal(first,1);
 const resumed=await factory({...f.input,kind:'resume',userMessage:undefined,previousController:old,nativeExecutor:executor(2)});
 assert.equal(resumed,old);assert.equal(resumed.stage,'discovery');assert.equal((await resumed.dispatch('workflow_read_workspace',{path:'native.txt'})).data.content,'CURRENT NATIVE BYTES');assert.equal(first,1);assert.equal(second,1);
});

test('a broad home-like workspace cannot read the nested private controller state',async t=>{
 const f=fixture(t),controller=await createConversationFactory(f.options)({...f.input,workspace:f.root});
 const denied=await controller.dispatch('workflow_read_workspace',{path:'private/envelope.key'});
 assert.equal(denied.ok,false);assert.match(denied.error,/private host/i);
});

test('a broad user workspace cannot use an MSIX physical-path alias to read private state',async t=>{
 const f=fixture(t),home=realpathSync.native(userInfo().homedir);
 if(process.platform==='win32'){
  const parent=join(home,'AppData/Local'),parentPhysical=realpathSync.native(parent),extra=mkdtempSync(join(parent,'workflow-canonical-fixture-')),physical=realpathSync.native(extra);
  assert(!relative(parentPhysical,physical).startsWith('..'));
  t.after(()=>{assert.equal(realpathSync.native(extra),physical);assert(!relative(parentPhysical,physical).startsWith('..'));rmSync(extra,{recursive:true,force:true});});
  f.options.stateRoot=join(extra,'private');
 }
 const controller=await createConversationFactory(f.options)({...f.input,workspace:home});
 const note=join(f.options.stateRoot,'private-note.txt');writeFileSync(note,'PRIVATE_MSIX_SENTINEL');
 const path=relative(home,realpathSync.native(note)).replaceAll('\\','/');
 if(path.startsWith('../'))return t.skip('OS temp fixture is outside the user home');
 const r=await controller.dispatch('workflow_read_workspace',{path});assert.equal(r.ok,false);assert(!JSON.stringify(r).includes('PRIVATE_MSIX_SENTINEL'));
});
test('pending actual user continuation preserves controller identity and corrections reopen scope',async t=>{
 const f=fixture(t),factory=createConversationFactory(f.options),controller=await factory(f.input);
 const next=await factory({...f.input,userMessage:'Also preserve the input BOM.',previousController:controller});assert.equal(next,controller);
 await next.acceptUserMessage('Also preserve the input BOM.');assert.equal(next.stage,'discovery');assert.match(next.instructions,/preserve the input BOM/);
 assert.equal((await next.dispatch('workflow_status')).state.revision,2);
});

test('plain progress queries preserve current work; a neighboring request change still reopens scope',async t=>{
 const f=fixture(t),controller=await createConversationFactory(f.options)(f.input);
 await controller.dispatch('workflow_search_skills',{query:'ordinary task'});
 for(const text of ['/workflow status','弄好了吗？','现在进度怎么样？','status update']){
  await controller.acceptUserMessage(text);assert.equal((await controller.dispatch('workflow_status')).state.revision,1,text);
 }
 await controller.acceptUserMessage('弄好了吗？并把输出改成另一个文件。');
 assert.equal((await controller.dispatch('workflow_status')).state.revision,2);
 assert.match(controller.instructions,/输出改成另一个文件/);
});
test('tampered durable envelope is rejected rather than trusting an old successful state',async t=>{
 const f=fixture(t);await createConversationFactory(f.options)(f.input);
 const envelopes=join(f.options.stateRoot,'sessions'),file=join(envelopes,readdirSync(envelopes)[0]);
 const stored=JSON.parse(readFileSync(file));stored.body.stage='complete';writeFileSync(file,JSON.stringify(stored));
 await assert.rejects(createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined}),/integrity|signature/i);
});

test('ordinary task full chain binds writes to the externally selected plan and cannot self-approve semantics',async t=>{
 const f=fixture(t),cards=[];f.options.onCard=card=>cards.push(card);
 f.options.sourceProviderOptions={get:async url=>({status:200,headers:{'content-type':'text/plain'},bytes:Buffer.from(url.endsWith('/a')?'Reference A: preserve current input identity.':'Reference B: independently check the current output.')})};
 const controller=await createConversationFactory(f.options)(f.input),call=(name,args={})=>controller.dispatch(name,args);
 const found=await call('workflow_search_skills',{query:'ordinary task'}),candidate=found.data.candidates[0].id;
 const o=await call('workflow_open_skill',{candidate}),proofs=[];
 for(const file of o.data.files){const r=await call('workflow_read_source',{source:o.data.source,path:file.path});proofs.push(r.data.source_receipt);}
 await call('workflow_confirm_sources',{receipts:proofs});
 assert.equal((await call('workflow_review_skill',{candidate,decision:'adopt',reason:'Use current input and independent output checking.',covers:['artifact-readable','original-user-task']})).ok,true);
 await call('workflow_install_skill',{candidate});
 const sources=[];
 for(const id of ['a','b']){const ref=await call('workflow_open_reference',{reference:'https://example.com/'+id});assert.equal(ref.ok,true,ref.error);sources.push(ref.data.source);const r=await call('workflow_read_source',{source:ref.data.source,path:ref.data.files[0].path});await call('workflow_confirm_sources',{receipts:[r.data.source_receipt]});await call('workflow_observe_reference',{source:ref.data.source,observation:'Actually read this deterministic test reference.'});}
 assert.equal(controller.stage,'selection');
 const options=['a','b','c'].map(id=>({id,description:'Plan '+id,sources,artifacts:['result-'+id+'.md']}));
 assert.equal((await call('workflow_checkpoint',{done:['Shown supported plans.'],evidence:(await call('workflow_status')).state.evidence,next_action:'Wait for the actual external choice.',options})).ok,false);
 assert(cards.some(x=>x.kind==='options'&&x.options[0].artifacts[0]==='result-a.md'));
 await controller.acceptUserMessage('/workflow choose b');assert.equal(controller.stage,'draft');
 assert.equal((await call('workflow_write',{path:'result-a.md',content:'unselected'})).ok,false);
 assert.equal((await call('workflow_write',{path:'result-b.md',content:'Current artifact for human review.\n'})).ok,true);
 assert.equal((await call('workflow_validate',{validator:'artifact-current',artifact:'result-b.md'})).data.semantic_goal_verified,false);
 assert.equal(controller.stage,'feedback');assert.equal((await call('workflow_accept',{passed:true})).ok,false);assert.equal(controller.complete,false);
 await controller.acceptUserMessage('/workflow accept');assert.equal(controller.stage,'learning');
 assert.equal((await call('workflow_learn',{decision:'no_increment',reason:'This fixture repeats the already installed current-input and output-checking method without a new reusable mechanism.',evidence:['Actual current artifact readback and actual external feedback bound to its hash.']})).ok,true);
 assert.equal(controller.complete,true);assert.equal(readFileSync(join(f.workspace,'result-b.md'),'utf8'),'Current artifact for human review.\n');
 assert.deepEqual(cards.filter(x=>x.kind==='checkpoint').map(x=>x.report.stage),['scope','discovery','selection','draft','feedback','delivery','learning']);
});

async function publishedConversationOptions(t,configure=()=>{}){
 const f=fixture(t),cards=[];configure(f);f.options.onCard=card=>cards.push(card);f.options.sourceProviderOptions={get:async url=>({status:200,headers:{'content-type':'text/plain'},bytes:Buffer.from('Current independently inspected reference '+url)})};
 const factory=createConversationFactory(f.options),controller=await factory(f.input),call=(name,args={})=>controller.dispatch(name,args);
 const found=await call('workflow_search_skills',{query:'ordinary task'}),candidate=found.data.candidates[0].id,opened=await call('workflow_open_skill',{candidate}),receipts=[];
 for(const file of opened.data.files){const read=await call('workflow_read_source',{source:opened.data.source,path:file.path});receipts.push(read.data.source_receipt);}
 await call('workflow_confirm_sources',{receipts});assert.equal((await call('workflow_review_skill',{candidate,decision:'adopt',reason:'Current input and independent output checking.',covers:['artifact-readable','original-user-task']})).ok,true);await call('workflow_install_skill',{candidate});
 const sources=[];for(const id of ['a','b']){const ref=await call('workflow_open_reference',{reference:'https://example.com/'+id}),read=await call('workflow_read_source',{source:ref.data.source,path:ref.data.files[0].path});sources.push(ref.data.source);await call('workflow_confirm_sources',{receipts:[read.data.source_receipt]});await call('workflow_observe_reference',{source:ref.data.source,observation:'Read actual current reference bytes.'});}
 if(f.beforeOptions)await f.beforeOptions({controller,call});
 await call('workflow_checkpoint',{done:['Present current inspected plans'],evidence:(await call('workflow_status')).state.evidence,next_action:'Wait for real external choice',options:['A','B','C'].map(id=>({id,description:'Current approach '+id,sources,artifacts:f.artifactPaths??['result-'+id+'.md']}))});assert.equal(controller.stage,'selection');
 const durable=()=>JSON.parse(readFileSync(join(f.options.stateRoot,'sessions',readdirSync(join(f.options.stateRoot,'sessions'))[0]))).body;
 return{...f,factory,controller,call,cards,durable};
}

for(const mutation of ['none','skill','reference','unavailable'])test(`cold selected task reuses only authenticated research with current bytes: ${mutation}`,async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');
 assert(f.durable().reusableDiscovery,'Only the completed inspected research is signed for reuse');
 assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Original selected draft.'})).ok,true);
 await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'});
 if(mutation==='skill')writeFileSync(join(f.options.installedRoots[0],'test-expert','SKILL.md'),'changed method');
 if(mutation==='reference')f.options.sourceProviderOptions.get=async url=>({status:200,headers:{'content-type':'text/plain'},bytes:Buffer.from('Changed reference '+url)});
 if(mutation==='unavailable')f.options.sourceProviderOptions.get=async()=>{throw Error('network unavailable');};
 const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 if(mutation==='none'){
  assert.equal(c.stage,'draft');assert.equal(c.exportAudit().restoration.strategy,'authenticated-discovery-current-bytes');
  assert.equal((await c.dispatch('workflow_write',{path:'result-B.md',content:'Unselected plan'})).ok,false);
  assert.equal((await c.dispatch('workflow_write',{path:'result-A.md',content:'Revised selected draft.'})).ok,true);
  assert.equal((await c.dispatch('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'})).ok,true);
  assert.equal(c.stage,'feedback');assert.equal(c.complete,false);
 }else{
  assert.equal(c.stage,'discovery');assert.equal(c.exportAudit().restoration.strategy,'reverify-current-facts');
  assert.equal((await c.dispatch('workflow_write',{path:'result-A.md',content:'Must not bypass discovery'})).ok,false);
 }
});

test('cold restore cannot reuse pending source receipts and never invents an unchosen option',async t=>{
 const f=await publishedConversationOptions(t),unselected=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(unselected.stage,'discovery');assert.equal((await unselected.dispatch('workflow_write',{path:'result-A.md',content:'No human choice'})).ok,false);
 // Reestablish the selected live owner and leave a newly returned challenge unconfirmed.
 await f.controller.acceptUserMessage('/workflow choose A');const ref=f.controller.exportAudit().events.find(e=>e.event==='source_delivered'&&String(e.source).startsWith('reference:'));
 const pending=await f.call('workflow_read_source',{source:ref.source,path:ref.path});assert(pending.data.source_receipt);
 assert.equal(f.durable().reusableDiscovery,null);
 const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(c.stage,'discovery');assert.equal((await c.dispatch('workflow_confirm_sources',{receipts:[pending.data.source_receipt]})).ok,false);
 assert.equal((await c.dispatch('workflow_write',{path:'result-A.md',content:'No confirmed source'})).ok,false);
});

test('disposed native task needs an owner grant before revalidating saved research',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');f.controller.abort('Native Agent disposed');
 assert(f.durable().reusableDiscovery);await assert.rejects(createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined}),/explicit external/);
 authorizeResume({...f.options,...f.input});const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(c.stage,'draft');assert.equal(c.exportAudit().restoration.strategy,'authenticated-discovery-current-bytes');
 assert.equal((await c.dispatch('workflow_write',{path:'result-B.md',content:'Wrong choice'})).ok,false);
});

test('clean idle shutdown restores a signed selected task without an extra user command',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');f.controller.abort('Native Agent disposed while idle');
 const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(c.stage,'draft');assert.equal(c.exportAudit().restoration.strategy,'authenticated-discovery-current-bytes');
 assert.equal((await c.dispatch('workflow_write',{path:'result-B.md',content:'Wrong choice'})).ok,false);
});

test('an actual user pause remains stopped until its owner grant, then unchanged research can be revalidated',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');await f.controller.acceptUserMessage('/workflow pause');
 assert.match(f.durable().failed,/External user paused/);assert(f.durable().reusableDiscovery);
 await assert.rejects(createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined}),/explicit external/);
 authorizeResume({...f.options,...f.input});const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(c.stage,'draft');assert.equal(c.exportAudit().restoration.strategy,'authenticated-discovery-current-bytes');
 assert.equal((await c.dispatch('workflow_write',{path:'result-B.md',content:'Wrong choice'})).ok,false);
});

test('restored search records the current candidate list, not the stale original list',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');const prior=f.durable().reusableDiscovery.search.results;
 const newer=join(f.options.installedRoots[0],'another-expert');mkdirSync(newer);writeFileSync(join(newer,'SKILL.md'),'ordinary task new candidate');writeFileSync(join(newer,'LICENSE'),'MIT fixture');
 const c=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});assert.equal(c.stage,'draft');
 const current=f.durable().reusableDiscovery.search.results;assert(current.length>prior.length);assert(current.every(id=>typeof id==='string'));
});

test('one overall task keeps reviewed methods and selection through questions, choice, drafting and detail feedback',async t=>{
 const f=await publishedConversationOptions(t),initial=f.controller.exportAudit(),seenOptions=f.cards.filter(c=>c.kind==='options').length;
 await f.controller.acceptUserMessage('这几个方案有什么区别？');assert.equal(f.controller.stage,'selection');assert.equal(f.controller.exportAudit().revision,initial.revision);
 await f.controller.acceptUserMessage('/workflow choose A');assert.equal(f.controller.stage,'draft');
 assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'First selected draft.'})).ok,true);
 await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'});assert.equal(f.controller.stage,'feedback');
 await f.controller.acceptUserMessage('为什么要这样安排？');assert.equal(f.controller.stage,'feedback');assert.equal(f.controller.exportAudit().revision,initial.revision);
 await f.controller.acceptUserMessage('保留这个方案，把说明改短一点。');assert.equal(f.controller.stage,'draft');
 assert.doesNotMatch(f.controller.instructions,/Before reading regular project files, perform an actual workflow_search_skills/,'Retained discovery must not prompt a redundant search');
 assert.doesNotMatch(f.controller.instructions,/Discovery: search -> open Skill/,'Completed discovery instructions do not need repeating on detail feedback');
 const after=f.controller.exportAudit();assert.equal(after.events.filter(e=>e.event==='source_delivered').length,initial.events.filter(e=>e.event==='source_delivered').length);
 assert.equal((await f.call('workflow_write',{path:'result-B.md',content:'Unselected alternative.'})).ok,false);
 assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Short revised draft.'})).ok,true);
 await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'});assert.equal(f.controller.stage,'feedback');
 await f.controller.acceptUserMessage('/workflow accept');assert.equal(f.controller.stage,'learning');
 assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'Same inspected method and revised selected artifact, no new reusable mechanism.',evidence:['Current revised bytes and actual external acceptance.']})).ok,true);
 assert.equal(f.controller.complete,true);assert.equal(f.cards.filter(c=>c.kind==='options').length,seenOptions);
 assert.equal(f.controller.exportAudit().events.filter(e=>e.event==='observed'&&e.kind==='skill_search').length,initial.events.filter(e=>e.event==='observed'&&e.kind==='skill_search').length);
});

test('published options are explained without another menu and mixed questions retain actual detail corrections',async t=>{
 const f=await publishedConversationOptions(t),menus=f.cards.filter(c=>c.kind==='options').length;
 assert.match(f.controller.instructions,/already published.*explain/i);assert.doesNotMatch(f.controller.instructions,/Present 3–5 supported options/);
 await f.controller.acceptUserMessage('这几个方案有什么区别？');assert.equal(f.controller.stage,'selection');assert.equal(f.cards.filter(c=>c.kind==='options').length,menus);
 await f.controller.acceptUserMessage('/workflow choose A');await f.call('workflow_write',{path:'result-A.md',content:'Current draft.'});await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'});assert.equal(f.controller.stage,'feedback');
 await f.controller.acceptUserMessage('为什么这样安排？把说明改短一点。');assert.equal(f.controller.stage,'draft');assert.match(f.controller.instructions,/把说明改短一点/);assert.equal(f.cards.filter(c=>c.kind==='options').length,menus);
 await f.controller.acceptUserMessage('先停一下可以吗？');assert.match(f.controller.blockedReason,/paused/i);
});

test('explicit revocation of a selected plan clears old write authority instead of treating it as detail feedback',async t=>{
 for(const text of ['取消方案 A，重新给我三个选择。','不要这个方案了，改用方案 B。','Why this design? Discard the current approach.']){
  const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');
  await f.controller.acceptUserMessage(text);assert.equal(f.controller.stage,'discovery',text);assert.equal(f.durable().continuationPlan,null,text);
  assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Revoked old option.'})).ok,false,text);
  assert.equal((await f.call('workflow_status')).data.selection,null,text);
 }
});

test('a new native Agent for this live session retains the chosen plan instead of restarting discovery',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');
 const resumed=await f.factory({...f.input,kind:'resume',previousController:f.controller,userMessage:undefined});
 assert.equal(resumed,f.controller);assert.equal(resumed.stage,'draft');
 assert.equal((await resumed.dispatch('workflow_write',{path:'result-A.md',content:'Continue the already selected approach.'})).ok,true);
 assert.equal((await resumed.dispatch('workflow_write',{path:'result-B.md',content:'Wrong option.'})).ok,false);
});

test('cold restoration rechecks actual facts and retains the human choice without a new menu',async t=>{
 const f=await publishedConversationOptions(t);await f.controller.acceptUserMessage('/workflow choose A');
 const restored=await createConversationFactory(f.options)({...f.input,kind:'resume',userMessage:undefined});
 assert.equal(restored.stage,'draft');assert.equal((await restored.dispatch('workflow_status')).data.selection.selected,'A');
 assert.match(restored.instructions,/already selected|selection is retained|已选/i);
 assert.equal((await restored.dispatch('workflow_write',{path:'result-B.md',content:'Unselected plan.'})).ok,false);
});

test('generic GUI continuations with LF CRLF and outer whitespace select exactly one plan and preserve raw audits',async t=>{
 for(const [raw,accept]of [['/workflow choose A\n','/workflow accept\n'],['/workflow choose A\r\n','/workflow accept\r\n'],[' \t/workflow choose A \r\n',' \t/workflow accept \r\n']])await t.test(JSON.stringify(raw),async t=>{
  const f=await publishedConversationOptions(t),controller=await f.factory({...f.input,kind:'auto',previousController:f.controller,userMessage:raw});assert.equal(controller,f.controller);
  await controller.acceptUserMessage(raw);assert.equal(controller.stage,'draft');assert.equal(controller.exportAudit().revision,1);assert.equal(f.durable().userMessage,f.input.userMessage);assert.equal(controller.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,raw);
  assert.equal((await f.call('workflow_write',{path:'result-B.md',content:'Unselected path'})).ok,false);assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Actual selected artifact for external review.\n'})).ok,true);assert.equal((await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'})).ok,true);assert.equal(controller.stage,'feedback');
  await controller.acceptUserMessage(accept);assert.equal(controller.stage,'learning');assert.equal(controller.exportAudit().revision,1);assert.equal(controller.exportAudit().events.find(e=>e.event==='user_acceptance').instruction,accept);assert.equal(controller.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,accept);
  assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'This fixture uses the already inspected current-source method without a verified reusable change.',evidence:['Current selected artifact and actual external acceptance.']})).ok,true);assert.equal(controller.complete,true);assert.equal(f.durable().complete,true);assert.deepEqual(f.cards.filter(c=>c.kind==='checkpoint').map(c=>c.report.stage),['scope','discovery','selection','draft','feedback','delivery','learning']);
 });
});

test('generic multiline choice or approval text reopens the full raw correction instead of granting control',async t=>{
 for(const [atFeedback,raw]of [[false,'/workflow choose A\n/workflow accept'],[false,' /workflow choose A\r\nPlease preserve this full correction.\n'],[true,'/workflow accept\nPlease change the date.'],[true,' /workflow accept\r\n/workflow choose B\n']])await t.test(JSON.stringify(raw),async t=>{
  const f=await publishedConversationOptions(t);if(atFeedback){await f.controller.acceptUserMessage('/workflow choose A');await f.call('workflow_write',{path:'result-A.md',content:'Prior validated draft.\n'});await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'});assert.equal(f.controller.stage,'feedback');}
  const c=await f.factory({...f.input,kind:'auto',previousController:f.controller,userMessage:raw});assert.equal(c,f.controller);await c.acceptUserMessage(raw);assert.equal(c.stage,'discovery');assert.equal(c.complete,false);assert.equal(c.exportAudit().revision,2);assert(c.instructions.includes(raw));assert(f.durable().userMessage.endsWith(raw));assert.equal(c.exportAudit().events.filter(e=>e.event==='external_user_input').at(-1).text,raw);assert(!c.exportAudit().events.some(e=>e.event==='user_acceptance'));
  assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Not permitted by multiline input'})).ok,false);assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'Cannot approve this correction.',evidence:['actor assertion']})).ok,false);
 });
});

test('production factory rejects an installed Skill document as a method and can finish through guarded writing',async t=>{
 let nativeCalls=0;const f=await publishedConversationOptions(t,f=>{
  const workspace=f.workspace;f.artifactPaths=['announcement.md'];f.input.userMessage='Revise announcement-input.txt into announcement.md, preserving the original bytes and waiting for real choice and acceptance.';writeFileSync(join(workspace,'announcement-input.txt'),'\ufeffOriginal announcement input\r\n');f.options.workspaceIOFactory=()=>({read:async path=>readFileSync(join(workspace,path)),write:async(path,bytes)=>{writeFileSync(join(workspace,path),bytes);return bytes;},invoke:async()=>{nativeCalls++;throw Error('Documentation must never reach native execution');}});
 });await f.controller.acceptUserMessage('/workflow choose A\n');assert.equal(f.controller.stage,'draft');
 const status=await f.call('workflow_status'),candidate=status.state.candidates.find(x=>x.installed).id,instructions=f.controller.instructions;
 for(const path of ['SKILL.md','LICENSE']){const r=await f.call('workflow_apply_method',{candidate,path,args:[],inputs:['announcement-input.txt'],outputs:['announcement.md']});assert.equal(r.fatal,undefined,JSON.stringify(r));assert.equal(r.ok,false);assert.equal(f.controller.ready,true);assert.equal(f.controller.stage,'draft');assert.equal(f.controller.instructions,instructions);assert.deepEqual(r.state.evidence,status.state.evidence);assert(r.recovery.next_tools.includes('workflow_write'));assert(r.recovery.next_tools.includes('workflow_validate'));}
 assert.equal(nativeCalls,0);assert.deepEqual(readdirSync(f.workspace),['announcement-input.txt']);assert(!f.controller.exportAudit().events.some(e=>e.event==='isolated_method_executed'||e.kind==='application'));assert.equal(f.durable().failed,null);
 assert.equal((await f.call('workflow_write',{path:'announcement.md',content:'Current text drafted after inspecting the method.\n'})).ok,true);assert.equal((await f.call('workflow_validate',{validator:'artifact-current',artifact:'announcement.md'})).ok,true);assert.equal(f.controller.stage,'feedback');
 await f.controller.acceptUserMessage('/workflow accept\n');await f.call('workflow_status');assert.equal(f.controller.stage,'learning');assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'The already inspected text method covers this fixture; no new verified reusable skill change.',evidence:['Actual selected artifact and external acceptance.']})).ok,true);assert.equal(f.controller.complete,true);assert.equal(f.durable().complete,true);assert.equal(nativeCalls,0);assert.equal(readFileSync(join(f.workspace,'announcement-input.txt'),'utf8'),'\ufeffOriginal announcement input\r\n');assert.deepEqual(f.cards.filter(c=>c.kind==='checkpoint').map(c=>c.report.stage),['scope','discovery','selection','draft','feedback','delivery','learning']);
});

test('production factory keeps genuine Python executor errors fatal even when their class or business field looks recoverable',async t=>{
 for(const error of [Error('Actual native executor failed'),Object.assign(Error('Forged business field'),{business:true}),Object.assign(new SourceError('SOURCE_TIMEOUT','Executor source-looking error'),{business:true})]){
  let calls=0;const f=await publishedConversationOptions(t,f=>{
   const scripts=join(f.options.installedRoots[0],'test-expert/scripts');mkdirSync(scripts);writeFileSync(join(scripts,'run.py'),'print("actually inspected Python")\n');
   f.options.workspaceIOFactory=()=>({read:async path=>readFileSync(join(f.workspace,path)),write:async()=>{throw Error('No artifact may be committed');},invoke:async()=>{calls++;throw error;}});
  });await f.controller.acceptUserMessage('/workflow choose A');const candidate=(await f.call('workflow_status')).state.candidates.find(x=>x.installed).id;
  const r=await f.call('workflow_apply_method',{candidate,path:'scripts/run.py',args:[],inputs:[],outputs:['result-A.md']});assert.equal(r.fatal,true);assert.equal(calls,1);assert.equal(f.controller.ready,false);assert.equal(f.controller.complete,false);assert(f.durable().failed);assert(!r.recovery);assert.deepEqual(readdirSync(f.workspace),[]);assert(!f.controller.exportAudit().events.some(e=>e.event==='isolated_method_executed'||e.kind==='application'));
 }
});

// Script only the existing original service boundary; the real production
// factory, native workspace IO, selected path checks and byte readback run.
function nativeFileFixture(workspace,{denyWrite=false,tamperWrite=false,readError,afterRead}={}){
 const calls=[];return{calls,catalog:[{name:'pwsh'},{name:'write'}],execute:async(name,args)=>{
  calls.push(name);if(name==='write'){if(denyWrite)return{isError:true};assert(!relative(workspace,args.file_path).startsWith('..'));writeFileSync(args.file_path,args.content+(tamperWrite?'tampered':''));return{isError:false,content:[]};}
  assert.equal(name,'pwsh');if(readError)throw readError;const match=args.command.match(/\$p='((?:''|[^'])*)';/);assert(match,'Exact fixed native reader path');const path=match[1].replaceAll("''","'"),offset=Number(args.command.match(/offset=(\d+)/)?.[1]??0),bytes=readFileSync(path),sha256=createHash('sha256').update(bytes).digest('hex');afterRead?.({path,bytes});
  return{isError:false,value:{kind:'foreground',exitCode:0,timedOut:false,aborted:false,stdout:{text:JSON.stringify({offset,total:bytes.length,sha256,base64:bytes.subarray(offset,offset+8192).toString('base64')}),truncated:false},stderr:{text:'',truncated:false}}};
 }};
}

test('actual factory and native IO refuse a missing new draft before service calls, then write declared CRLF through the original writer',async t=>{
 let native,observed=0;const f=await publishedConversationOptions(t,f=>{
  native=nativeFileFixture(f.workspace);f.input.nativeExecutor=native;mkdirSync(join(f.workspace,'read-directory'));f.beforeOptions=async({controller,call})=>{
   assert.equal(controller.stage,'selection');const old=controller.instructions,status=(await call('workflow_status')).state;
   for(const path of ['web-notice.md','read-directory/absent.txt']){const r=await call('workflow_read_workspace',{path});assert.equal(r.fatal,undefined,JSON.stringify(r));assert.equal(r.ok,false);assert.equal(controller.ready,true);assert.equal(controller.stage,'selection');assert.equal(controller.instructions,old);assert.deepEqual(r.state.evidence,status.evidence);assert.equal(controller.exportAudit().failed,null);assert(r.recovery.next_tools.includes('workflow_checkpoint'));observed++;}
   const early=await call('workflow_write',{path:'result-A.md',content:'premature\ntext',newline:'CRLF'});assert.equal(early.ok,false);assert.deepEqual(native.calls,[]);
  };
 });assert.equal(observed,2);assert.deepEqual(native.calls,[]);await f.controller.acceptUserMessage('/workflow choose A\n');
 const foreign=await f.call('workflow_write',{path:'result-B.md',content:'unselected\ntext',newline:'LF'});assert.equal(foreign.ok,false);assert.deepEqual(native.calls,[]);
 const raw='\ufeff实际😀\nA\rB\r\nC\\r\\n',expected='\ufeff实际😀\r\nA\r\nB\r\nC\\r\\n',written=await f.call('workflow_write',{path:'result-A.md',content:raw,newline:'CRLF'});assert.equal(written.ok,true,written.error);assert(readFileSync(join(f.workspace,'result-A.md')).equals(Buffer.from(expected)));assert.equal(native.calls.filter(x=>x==='write').length,1);assert(native.calls.filter(x=>x==='pwsh').length>=2);assert.equal(written.data.normalization.raw_input_sha256,createHash('sha256').update(raw).digest('hex'));assert.equal(written.data.normalization.output_sha256,createHash('sha256').update(expected).digest('hex'));
 assert.equal((await f.call('workflow_validate',{validator:'artifact-current',artifact:'result-A.md'})).ok,true);await f.controller.acceptUserMessage('/workflow accept\n');await f.call('workflow_status');assert.equal(f.controller.stage,'learning');assert.equal((await f.call('workflow_learn',{decision:'no_increment',reason:'The existing method was applied to this bounded fixture with actual byte verification; no automatic Skill update.',evidence:['Native writer, exact readback and external acceptance.']})).ok,true);assert.equal(f.controller.complete,true);
});

test('declared newline never bypasses native writer denial or native readback tampering in the production factory',async t=>{
 for(const options of [{denyWrite:true},{tamperWrite:true}])await t.test(JSON.stringify(options),async t=>{
  let native;const f=await publishedConversationOptions(t,f=>{native=nativeFileFixture(f.workspace,options);f.input.nativeExecutor=native;});await f.controller.acceptUserMessage('/workflow choose A');const r=await f.call('workflow_write',{path:'result-A.md',content:'a\nb',newline:'CRLF'});assert.equal(r.fatal,true);assert.equal(native.calls.filter(x=>x==='write').length,1);assert.equal(f.controller.ready,false);assert(f.durable().failed);assert(!f.controller.exportAudit().events.some(e=>e.event==='write_normalization'||e.kind==='application'));
 });
});

test('an existing actor input still enters actual native IO and native exceptions cannot masquerade as missing-argument refusals',async t=>{
 for(const error of [Error('Native permission failure'),Object.assign(Error('Native forged marker'),{business:true}),Object.assign(new SourceError('SOURCE_TIMEOUT','A native reader is not a source fetch'),{business:true})]){
  let native;const f=await publishedConversationOptions(t,f=>{writeFileSync(join(f.workspace,'existing.txt'),'Original readable metadata, denied native bytes.');native=nativeFileFixture(f.workspace,{readError:error});f.input.nativeExecutor=native;});const r=await f.call('workflow_read_workspace',{path:'existing.txt'});assert.equal(r.fatal,true);assert.deepEqual(native.calls,['pwsh']);assert.equal(f.controller.ready,false);assert(f.durable().failed);assert(!r.recovery);assert(!f.controller.exportAudit().events.some(e=>e.event==='workspace_input_delivered'));
 }
});

test('production factory preserves fatal artifact identity across integrity-to-use and actual native read response races',async t=>{
 for(const window of ['integrity','actor'])for(const mode of ['missing','directory','hardlink','content'])await t.test(window+' '+mode,async t=>{
  let armed=false,reads=0,changed=false;const f=await publishedConversationOptions(t,f=>{
   f.input.nativeExecutor=nativeFileFixture(f.workspace,{afterRead:({path,bytes})=>{if(armed&&path.toLowerCase()===join(f.workspace,'result-A.md').toLowerCase()&&++reads===(window==='integrity'?1:2)){
    changed=true;if(mode==='content'){const different=Buffer.from(bytes);different[0]^=1;writeFileSync(path,different);}else{const moved=join(f.root,'moved-artifact.md');renameSync(path,moved);if(mode==='directory')mkdirSync(path);if(mode==='hardlink')linkSync(moved,path);}
   }}});
  });await f.controller.acceptUserMessage('/workflow choose A');assert.equal((await f.call('workflow_write',{path:'result-A.md',content:'Original known artifact.\n'})).ok,true);armed=true;
  const r=await f.call('workflow_read_workspace',{path:'result-A.md'});assert.equal(changed,true,JSON.stringify({error:r.error,fatal:r.fatal,reads}));assert.equal(r.fatal,true,JSON.stringify(r));assert.equal(f.controller.ready,false);assert(f.durable().failed);assert(!r.recovery);assert(!f.controller.exportAudit().events.some(e=>e.event==='workspace_input_delivered'));
 });
});
