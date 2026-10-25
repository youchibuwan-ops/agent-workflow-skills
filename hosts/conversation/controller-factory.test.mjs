import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {relative} from 'node:path';
import {userInfo} from 'node:os';
import {realpathSync} from 'node:fs';
import {createConversationFactory,toolSchemas} from './controller-factory.mjs';
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

test('same-process native resume creates a fresh controller instead of retaining the old Agent executor',async t=>{
 const f=fixture(t),factory=createConversationFactory(f.options),old=await factory(f.input);
 const resumed=await factory({...f.input,kind:'resume',userMessage:undefined,previousController:old});
 assert.notEqual(resumed,old);assert.equal(resumed.stage,'discovery');assert.equal(resumed.exportAudit().restoration.strategy,'reverify-current-facts');
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
