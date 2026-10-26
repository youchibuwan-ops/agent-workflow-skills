import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {createWorkflowHost} from './workflow-host.mjs';

async function fixture(t,extra={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-discovery-')),workspace=path.join(root,'project');fs.mkdirSync(workspace);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const host=await createWorkflowHost({workspace,stateRoot:path.join(root,'private-state'),userMessage:'Inspect the selected project and explain its background setup; do not ask me for filenames.',...extra});return{root,workspace,host};
}

test('selected project can discover unknown nested files before an exact current-byte read',async t=>{
 const{workspace,host}=await fixture(t),folder='scene-'+randomBytes(6).toString('hex');fs.mkdirSync(path.join(workspace,folder));fs.writeFileSync(path.join(workspace,'project.godot'),'config_version=5\n[application]\nconfig/name="Discovery fixture"\n');fs.writeFileSync(path.join(workspace,folder,'背景.tscn'),'[gd_scene format=3]\n[node name="UnknownScene" type="Node2D"]\n');
 const root=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(root.ok,true,root.error);assert.deepEqual(root.data.entries.map(x=>[x.name,x.type]),[['project.godot','file'],[folder,'directory']]);
 const sub=await host.dispatch('workflow_read_workspace',{path:root.data.entries.find(x=>x.type==='directory').path});assert.equal(sub.ok,true,sub.error);assert.equal(sub.data.entries[0].path,folder+'/背景.tscn');const read=await host.dispatch('workflow_read_workspace',{path:sub.data.entries[0].path});assert.equal(read.ok,true,read.error);assert.equal(read.data.content,'[gd_scene format=3]\n[node name="UnknownScene" type="Node2D"]\n');assert.equal(read.state.stage,'discovery');
});

test('status tells the actor its actually bound workspace without the user repeating its path',async t=>{
 const{workspace,host}=await fixture(t),status=await host.dispatch('workflow_status',{});assert.equal(status.ok,true);assert.ok(status.data.workspace,'the actor must receive its bound project context');assert.equal(status.data.workspace.root,fs.realpathSync.native(workspace));assert.equal(status.data.workspace.path_mode,'project-relative');assert.equal(status.data.workspace.directory_tool,'workflow_read_workspace');assert.equal(status.data.workspace.root_directory_path,'.');
});

test('directory pages cover real empty and Unicode entries without silently dropping a tail',async t=>{
 const{workspace,host}=await fixture(t);for(const name of ['a.txt','b.txt','c.txt','中文.txt'])fs.writeFileSync(path.join(workspace,name),name);let offset=0,seen=[];do{const r=await host.dispatch('workflow_read_workspace',{path:'.',offset,length:2});assert.equal(r.ok,true,r.error);seen.push(...r.data.entries.map(x=>x.name));offset=r.data.next_offset;if(offset===null)assert.equal(r.data.complete,true);}while(offset!==null);assert.deepEqual(seen,['a.txt','b.txt','c.txt','中文.txt']);fs.mkdirSync(path.join(workspace,'empty'));const empty=await host.dispatch('workflow_read_workspace',{path:'empty'});assert.equal(empty.ok,true,empty.error);assert.deepEqual(empty.data.entries,[]);assert.equal(empty.data.complete,true);
});

test('directory metadata does not expose protected, private or redirected resources',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-private-list-')),workspace=path.join(root,'project'),privateDir=path.join(workspace,'owner-secret');fs.mkdirSync(privateDir,{recursive:true});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const name of ['.git','.codex','node_modules'])fs.mkdirSync(path.join(workspace,name));fs.writeFileSync(path.join(workspace,'.env'),'private');fs.writeFileSync(path.join(privateDir,'secret.txt'),'private');fs.writeFileSync(path.join(workspace,'visible.txt'),'public');fs.mkdirSync(path.join(root,'outside'));fs.symlinkSync(path.join(root,'outside'),path.join(workspace,'redirect'),process.platform==='win32'?'junction':'dir');fs.writeFileSync(path.join(root,'linked-source'),'private');fs.linkSync(path.join(root,'linked-source'),path.join(workspace,'hard-link'));
 const host=await createWorkflowHost({workspace,stateRoot:path.join(root,'state'),userMessage:'Inspect current project.',privateRoots:[privateDir],protectedPrivateSubroots:true});const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,true,r.error);assert.deepEqual(r.data.entries.map(x=>x.name),['visible.txt']);for(const p of ['../outside','.git','owner-secret','redirect']){const denied=await host.dispatch('workflow_read_workspace',{path:p});assert.equal(denied.ok,false,p);}
});

test('directory navigation cannot act after an actual user pause',async t=>{
 const{host}=await fixture(t);await host.acceptUserMessage('/workflow pause');const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,false);assert.equal(r.state.complete,false);
});

test('configured native IO without enumeration cannot silently use direct filesystem names',async t=>{
 const{workspace,host}=await fixture(t,{workspaceIO:{read:async()=>Buffer.from('unused')}});fs.writeFileSync(path.join(workspace,'must-not-be-returned.txt'),'public');const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,false);assert.match(r.error,/enumeration.*unavailable|no filesystem fallback/);assert.equal(r.fatal,undefined);
});

test('a directory replaced while awaiting native enumeration fails before exposing its names',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-list-race-')),workspace=path.join(root,'project');fs.mkdirSync(workspace);fs.mkdirSync(path.join(workspace,'scene'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const host=await createWorkflowHost({workspace,stateRoot:path.join(root,'state'),userMessage:'Inspect project.',workspaceIO:{list:async()=>{fs.renameSync(path.join(workspace,'scene'),path.join(workspace,'old'));fs.mkdirSync(path.join(workspace,'scene'));return{offset:0,total:1,names:['private-name']};}}});const r=await host.dispatch('workflow_read_workspace',{path:'scene'});assert.equal(r.ok,false);assert.equal(r.fatal,true);assert.equal(r.data,undefined);assert.match(r.error,/directory.*changed/i);
});

test('a replaced workspace root cannot rebind the task to another directory',async t=>{
 for(const mode of ['junction','plain']){
  const{root,workspace,host}=await fixture(t);fs.renameSync(workspace,path.join(root,'original'));
  if(mode==='junction'){const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'outside-name.txt'),'private');fs.symlinkSync(outside,workspace,process.platform==='win32'?'junction':'dir');}
  else{fs.mkdirSync(workspace);fs.writeFileSync(path.join(workspace,'replacement-name.txt'),'different project');}
  const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,false,mode);assert.equal(r.fatal,true,mode);assert.equal(r.data,undefined);assert.equal(r.state.workspace.root,workspace);assert.match(r.error,/workspace.*(?:identity|changed|replaced)/i);
 }
});

test('a missing bound root returns a fail-closed status envelope without throwing',async t=>{
 const{root,workspace,host}=await fixture(t);fs.renameSync(workspace,path.join(root,'original'));const r=await host.dispatch('workflow_status',{});assert.equal(r.ok,false);assert.equal(r.fatal,true);assert.equal(r.state.workspace.root,workspace);assert.equal(r.data,undefined);
});

test('legal dot-dot prefixes are navigable and readable while parent traversal stays denied',async t=>{
 const{workspace,host}=await fixture(t);fs.mkdirSync(path.join(workspace,'..scenes'));fs.writeFileSync(path.join(workspace,'..notes.txt'),'ordinary');fs.writeFileSync(path.join(workspace,'..scenes','room.tscn'),'scene');const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,true,r.error);assert.deepEqual(r.data.entries.map(e=>e.name),['..notes.txt','..scenes']);const sub=await host.dispatch('workflow_read_workspace',{path:'..scenes'});assert.equal(sub.ok,true,sub.error);const read=await host.dispatch('workflow_read_workspace',{path:'..notes.txt'});assert.equal(read.data.content,'ordinary');const denied=await host.dispatch('workflow_read_workspace',{path:'../outside'});assert.equal(denied.ok,false);assert.equal(denied.fatal,undefined);
});

test('root replacement during an awaited directory provider cannot expose returned names',async t=>{
 const{root,workspace}=await fixture(t);const host=await createWorkflowHost({workspace,stateRoot:path.join(root,'other-state'),userMessage:'Inspect project.',workspaceIO:{list:async()=>{fs.renameSync(workspace,path.join(root,'original'));fs.mkdirSync(workspace);return{offset:0,total:1,names:['outside-name.txt']};}}});const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(r.ok,false);assert.equal(r.fatal,true);assert.equal(r.data,undefined);assert.equal(r.state.workspace.root,workspace);
});

test('production conversation refuses a regular-file read until this revision actually searched Skills',async t=>{
 let reads=0;const{workspace,host}=await fixture(t,{contract:{conversationMode:true,catalog:[{id:'current-inspection-method',version:'fixture'}]},workspaceIO:{read:async()=>{reads++;return Buffer.from('current actual source');},list:async()=>({offset:0,total:1,names:['input.txt']})}});fs.writeFileSync(path.join(workspace,'input.txt'),'current actual source');const listing=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(listing.ok,true);const early=await host.dispatch('workflow_read_workspace',{path:'input.txt'});assert.equal(early.ok,false);assert.equal(early.fatal,undefined);assert.match(early.error,/search.*Skill/i);assert.equal(reads,0);assert.deepEqual(early.recovery.next_tools,['workflow_search_skills']);assert.equal((await host.dispatch('workflow_search_skills',{query:'inspect current project'})).ok,true);const read=await host.dispatch('workflow_read_workspace',{path:'input.txt'});assert.equal(read.ok,true,read.error);assert.equal(read.data.content,'current actual source');assert.equal(reads,1);await host.acceptUserMessage('Now inspect a different part of this project.');const renewed=await host.dispatch('workflow_read_workspace',{path:'input.txt'});assert.equal(renewed.ok,false);assert.equal(reads,1);
});

test('ctime-only directory changes require a second identical enumeration; changed names or another change remain fatal',async t=>{
 for(const mode of ['stable','changed-names','changes-again']){
  const{root,workspace}=await fixture(t);fs.writeFileSync(path.join(workspace,'visible.txt'),'source');let calls=0;const host=await createWorkflowHost({workspace,stateRoot:path.join(root,'check-state'),userMessage:'Read only.',workspaceIO:{list:async()=>{calls++;if(calls===1||mode==='changes-again'){await new Promise(r=>setTimeout(r,2));const before=fs.lstatSync(workspace,{bigint:true});fs.renameSync(workspace,workspace+'-moved');fs.renameSync(workspace+'-moved',workspace);const after=fs.lstatSync(workspace,{bigint:true});assert.equal(before.ino,after.ino);assert.equal(before.mtimeNs,after.mtimeNs);assert.notEqual(before.ctimeNs,after.ctimeNs);}return{offset:0,total:1,names:[mode==='changed-names'&&calls>1?'different.txt':'visible.txt']};}}});const r=await host.dispatch('workflow_read_workspace',{path:'.'});assert.equal(calls,2);assert.equal(r.ok,mode==='stable',JSON.stringify(r));if(mode==='stable'){assert.equal(r.data.entries[0].name,'visible.txt');assert.equal(r.data.ctime_reconfirmed,true);}else{assert.equal(r.fatal,true);assert.equal(r.data,undefined);}
 }
});
