import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorkflowHost} from './workflow-host.mjs';
import {createConversationFactory} from '../conversation/controller-factory.mjs';
import {worktreeFixture} from '../security/verified-worktree.test-support.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'project-roots-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const workspace=join(root,'original'),related=join(root,'art-B'),privateRoot=join(root,'private');
 for(const p of [workspace,related,privateRoot])mkdirSync(p);
 writeFileSync(join(workspace,'scene.gd'),'ORIGINAL');writeFileSync(join(related,'scene.gd'),'B ART');
 writeFileSync(join(privateRoot,'secret.txt'),'PRIVATE');
 return{root,workspace,related,privateRoot,config:{workspace,stateRoot:join(root,'state'),userMessage:'Inspect the original and related B project in this same conversation.',privateRoots:[privateRoot],additionalWorkspaces:[{id:'b',workspace:related}]}};
}
test('one task reads both project roots by real absolute paths and stable scoped paths',async t=>{
 const f=fixture(t),host=await createWorkflowHost(f.config);
 const original=await host.dispatch('workflow_read_workspace',{path:join(f.workspace,'scene.gd')});
 assert.equal(original.ok,true,original.error);assert.equal(original.data.content,'ORIGINAL');
 const art=await host.dispatch('workflow_read_workspace',{path:join(f.related,'scene.gd')});
 assert.equal(art.ok,true,art.error);assert.equal(art.data.content,'B ART');
 assert.equal(art.data.path,'@projects/b/scene.gd');
 const listed=await host.dispatch('workflow_read_workspace',{path:join(f.related)});
 assert.equal(listed.ok,true,listed.error);assert.deepEqual(listed.data.entries.map(e=>e.path),['@projects/b/scene.gd']);
 const scoped=await host.dispatch('workflow_read_workspace',{path:'@projects/b/scene.gd'});
 assert.equal(scoped.ok,true,scoped.error);assert.equal(scoped.data.content,'B ART');
 assert.equal(host.exportAudit().task,original.state.task);assert.equal(art.state.workspace.root,f.workspace);
 assert.equal(art.state.workspace.related[0].root,f.related);
});
test('related roots do not expose unrelated directories, private state, protected names or linked aliases',async t=>{
 const f=fixture(t),host=await createWorkflowHost(f.config);
 linkSync(join(f.privateRoot,'secret.txt'),join(f.related,'alias.txt'));
 for(const path of [join(f.privateRoot,'secret.txt'),'@projects/unknown/scene.gd','@projects/b/../secret.txt','@projects/b/.git/config','@projects/b/alias.txt']){
  const r=await host.dispatch('workflow_read_workspace',{path});assert.equal(r.ok,false,path);assert.equal(r.fatal,undefined,path);
 }
 assert.equal((await host.dispatch('workflow_read_workspace',{path:'scene.gd'})).data.content,'ORIGINAL');
 const early=await host.dispatch('workflow_write',{path:join(f.related,'scene.gd'),content:'UNAPPROVED'});assert.equal(early.ok,false);
 assert.equal(readFileSync(join(f.related,'scene.gd'),'utf8'),'B ART');
});
test('replacement of a related directory invalidates its authority rather than rebinding it',async t=>{
 const f=fixture(t),host=await createWorkflowHost(f.config);renameSync(f.related,f.related+'-old');mkdirSync(f.related);writeFileSync(join(f.related,'scene.gd'),'REPLACEMENT');
 const r=await host.dispatch('workflow_read_workspace',{path:'@projects/b/scene.gd'});assert.equal(r.ok,false);assert.equal(r.fatal,true);assert.equal(r.data,undefined);
});
test('an existing conversation automatically attaches its authorized Git worktree without moving or recreating the session',async t=>{
 const f=fixture(t),w=worktreeFixture(f.root),original=join(f.root,'original');
 writeFileSync(join(original,'same.txt'),'MAIN');writeFileSync(join(w.workspace,'same.txt'),'ART');
 const factory=createConversationFactory({stateRoot:join(f.root,'conversation-state'),installedRoots:[],external:false,privateRoots:[w.legacyRoot],worktreeAuthorizations:[w.authorization]});
 const input={workspace:original,sessionId:'keep-existing-session',userMessage:'Inspect both versions in this same project.'};
 const first=await factory(input);await first.dispatch('workflow_search_skills',{query:'inspect project'});
 const art=await first.dispatch('workflow_read_workspace',{path:join(w.workspace,'same.txt')});
 assert.equal(art.ok,true,art.error);assert.equal(art.data.content,'ART');assert.equal(art.state.workspace.root,original);
 assert.equal((await first.dispatch('workflow_read_workspace',{path:'same.txt'})).data.content,'MAIN');
 const secondFactory=createConversationFactory({stateRoot:join(f.root,'conversation-state'),installedRoots:[],external:false,privateRoots:[w.legacyRoot],worktreeAuthorizations:[w.authorization]});
 const restored=await secondFactory({...input,kind:'resume'});await restored.dispatch('workflow_search_skills',{query:'inspect project'});
 const read=await restored.dispatch('workflow_read_workspace',{path:join(w.workspace,'same.txt')});assert.equal(read.ok,true,read.error);assert.equal(read.data.content,'ART');assert.equal(restored.exportAudit().sessionId,'keep-existing-session');
});
test('archived unrelated authorizations cannot prevent opening a healthy project or its related worktree',async t=>{
 for(const missing of ['workspace','common']){
  const f=fixture(t),current=worktreeFixture(f.root),otherParent=join(f.root,'unrelated');mkdirSync(otherParent);const other=worktreeFixture(otherParent);
  rmSync(missing==='workspace'?other.workspace:other.expectedCommonGitDir,{recursive:true,force:true});
  writeFileSync(join(current.workspace,'test.txt'),'CURRENT ART');
  const factory=createConversationFactory({stateRoot:join(f.root,'conversation-stale-test'),installedRoots:[],external:false,privateRoots:[current.legacyRoot,other.legacyRoot],worktreeAuthorizations:[current.authorization,other.authorization]});
  const c=await factory({workspace:f.workspace,sessionId:'healthy-'+missing,userMessage:'Inspect this current project.'});await c.dispatch('workflow_search_skills',{query:'project inspection'});
  const r=await c.dispatch('workflow_read_workspace',{path:join(current.workspace,'test.txt')});assert.equal(r.ok,true,r.error);assert.equal(r.data.content,'CURRENT ART');assert.equal(r.state.workspace.related.length,1);
 }
});
async function writableFixture(t){
 const f=fixture(t),method=join(f.root,'method');mkdirSync(method);
 writeFileSync(join(method,'SKILL.md'),'---\nname: project-text\ndescription: Edit the current text in the selected project directory.\n---\nPreserve the other project directory. Read LICENSE.\n');writeFileSync(join(method,'LICENSE'),'MIT fixture license\n');
 for(const id of ['a','b'])writeFileSync(join(f.root,id+'.md'),'Current '+id+' method reference.\n');
 const host=await createWorkflowHost({...f.config,contract:{requirements:['artifact-readable'],protectedInputs:[],writeAllowlist:['@projects/b/scene.gd'],selection:{mode:'fixed',instruction:'Edit B only.'},feedback:{mode:'delegated_verification',instruction:'Verify the current text.'},catalog:[{id:'text',path:method,version:'fixture'}],references:['a','b'].map(id=>({id,path:join(f.root,id+'.md')})),validators:[{id:'text',type:'current-text',covers:['artifact-readable']}],autoAdvance:false}});
 const call=async(name,args={})=>{const r=await host.dispatch(name,args);assert.equal(r.ok,true,r.error);return r;};
 await call('workflow_search_skills',{query:'project text'});const opened=await call('workflow_open_skill',{candidate:'text'});
 const proofs=[];for(const file of opened.data.files){const r=await call('workflow_read_source',{source:opened.data.source,path:file.path});proofs.push(r.data.source_receipt);}await call('workflow_confirm_sources',{receipts:proofs});
 await call('workflow_review_skill',{candidate:'text',decision:'adopt',reason:'Covers the requested current text edit in the chosen project directory.',covers:['artifact-readable']});await call('workflow_install_skill',{candidate:'text'});
 for(const id of ['a','b']){const r=await call('workflow_open_reference',{reference:id}),read=await call('workflow_read_source',{source:r.data.source,path:r.data.files[0].path});await call('workflow_confirm_sources',{receipts:[read.data.source_receipt]});await call('workflow_observe_reference',{source:r.data.source,observation:'Current reference '+id+' supports preserving the other project.'});}
 const checkpoint=async()=>{const r=await call('workflow_status');return call('workflow_checkpoint',{done:['Current prerequisite evidence is available.'],evidence:r.state.evidence,next_action:'Continue the authorized edit.'});};
 await checkpoint();await checkpoint();assert.equal(host.stage,'draft');return{...f,host,call};
}
test('the selected related edit writes and validates B while an equal relative filename in the original is preserved',async t=>{
 const f=await writableFixture(t);const r=await f.call('workflow_write',{path:join(f.related,'scene.gd'),content:'REVISED B'});assert.equal(r.data.artifact,'@projects/b/scene.gd');
 assert.equal(readFileSync(join(f.related,'scene.gd'),'utf8'),'REVISED B');assert.equal(readFileSync(join(f.workspace,'scene.gd'),'utf8'),'ORIGINAL');
 assert.equal((await f.host.dispatch('workflow_write',{path:join(f.workspace,'scene.gd'),content:'WRONG ROOT'})).ok,false);
 await f.call('workflow_validate',{validator:'text',artifact:join(f.related,'scene.gd')});
 writeFileSync(join(f.related,'scene.gd'),'EXTERNAL CHANGE');const stale=await f.host.dispatch('workflow_read_workspace',{path:'@projects/b/scene.gd'});assert.equal(stale.ok,false);assert.equal(stale.fatal,true);
});
