import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {migrateSelectedThread,rebindRollout,listThreadMetadata,metadataThread,sameToolSchemas} from './legacy-store.mjs';
const tools=[{name:'workflow_status',description:'safe',inputSchema:{type:'object'}}];
test('native serializer type:function is allowed, inherited namespace/deferred/extra tool denied',()=>{
 assert.equal(sameToolSchemas([{type:'function',...tools[0]}],tools),true);assert.equal(sameToolSchemas([{...tools[0],namespace:'raw'}],tools),false);assert.equal(sameToolSchemas([...tools,{...tools[0],name:'exec_command'}],tools),false);assert.equal(sameToolSchemas([{...tools[0],deferLoading:true}],tools),false);
});
test('rollout preserves historical calls but removes model-visible obsolete tools and shifts projection offsets',()=>{
 const rows=[{type:'session_meta',payload:{dynamic_tools:[{name:'unsafe'}]}},{type:'response_item',payload:{type:'additional_tools',tools:[{name:'unsafe'}]}},{type:'response_item',payload:{type:'function_call',name:'unsafe',arguments:'历史中文'} }];
 const bytes=Buffer.from(rows.map(x=>JSON.stringify(x)+'\n').join(''));const r=rebindRollout(bytes,tools);
 const after=r.bytes.toString().trim().split('\n').map(JSON.parse);assert.deepEqual(after[0].payload.dynamic_tools,tools);assert.deepEqual(after[1].payload.tools,[]);assert.deepEqual(after[2],rows[2]);assert.equal(r.shift(bytes.length),r.bytes.length);assert.equal(r.records,3);
 assert.throws(()=>rebindRollout(bytes.subarray(0,-1),tools),/incomplete/);
});
test('only selected rows are copied; source readonly; oversized and original-path targets refused',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'workflow-migrate-')),source=path.join(root,'source'),target=path.join(root,'private');mkdirSync(path.join(source,'sessions'),{recursive:true});mkdirSync(target);
 const sql=`CREATE TABLE threads(id TEXT PRIMARY KEY,rollout_path TEXT,cwd TEXT,project_id TEXT,thread_section_id TEXT); CREATE TABLE thread_dynamic_tools(thread_id TEXT,position INTEGER,name TEXT,description TEXT,input_schema TEXT,defer_loading INTEGER,namespace TEXT);`;
 const hist=`CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,rollout_byte_offset INTEGER,rollout_end_byte_offset INTEGER);CREATE TABLE thread_items(thread_id TEXT,item_json TEXT);CREATE TABLE thread_history_projection_state(thread_id TEXT,next_rollout_byte_offset INTEGER);CREATE TABLE thread_realtime_items(thread_id TEXT,item_json TEXT);`;
 const file=path.join(source,'sessions','one.jsonl'),bytes=Buffer.from(JSON.stringify({type:'session_meta',payload:{dynamic_tools:[{name:'unsafe'}]}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'user_message',message:'retain'}})+'\n');writeFileSync(file,bytes);
 for(const home of [source,target]){const db=new DatabaseSync(path.join(home,'state_5.sqlite'));db.exec(sql);if(home===source){db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('one',file,root,null,null);db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('unselected',file,root,null,null);}db.close();const h=new DatabaseSync(path.join(home,'thread_history_1.sqlite'));h.exec(hist);if(home===source){h.prepare('INSERT INTO thread_turns VALUES(?,?,?,?)').run('one','turn',0,bytes.length);h.prepare('INSERT INTO thread_items VALUES(?,?)').run('one','historical');h.prepare('INSERT INTO thread_items VALUES(?,?)').run('unselected','do-not-copy');h.prepare('INSERT INTO thread_history_projection_state VALUES(?,?)').run('one',bytes.length);}h.close();}
 try{assert.throws(()=>migrateSelectedThread({sourceHome:source,targetHome:source,threadId:'one',toolSchemas:tools}),/disjoint/);
  assert.throws(()=>migrateSelectedThread({sourceHome:source,targetHome:target,threadId:'one',toolSchemas:tools,maxBytes:1}),/budget/);
  const r=migrateSelectedThread({sourceHome:source,targetHome:target,threadId:'one',toolSchemas:tools});assert.deepEqual(readFileSync(file),bytes);assert.ok(existsSync(r.rolloutPath));assert.equal(r.sourceBytes,bytes.length);
  const index=listThreadMetadata([source,target]);assert.equal(index.length,2);assert.equal(index.find(x=>x.id==='one').rollout_path,r.rolloutPath);assert.equal(metadataThread(index[0]).path,null);assert.equal(metadataThread(index[0]).status.type,'notLoaded');assert.throws(()=>listThreadMetadata([source],{maxEntries:1}),/budget/);
  const d=new DatabaseSync(path.join(target,'state_5.sqlite'),{readOnly:true});assert.equal(d.prepare('SELECT count(*) n FROM threads').get().n,1);assert.equal(d.prepare('SELECT name FROM thread_dynamic_tools').get().name,'workflow_status');assert.notEqual(d.prepare('SELECT rollout_path FROM threads').get().rollout_path,file);d.close();
  const h=new DatabaseSync(path.join(target,'thread_history_1.sqlite'),{readOnly:true});assert.equal(h.prepare('SELECT count(*) n FROM thread_items').get().n,1);assert.equal(h.prepare('SELECT rollout_end_byte_offset n FROM thread_turns').get().n,readFileSync(r.rolloutPath).length);h.close();
 }finally{rmSync(root,{recursive:true,force:true});}
});
