import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,realpathSync as fsRealpathSync,existsSync,lstatSync,statSync,unlinkSync,statfsSync,openSync,readSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';import path from 'node:path';
const realpathSync=fsRealpathSync.native;
export const inside=(root,p)=>{const r=path.relative(root,p);return r===''||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
const hash=b=>createHash('sha256').update(b).digest('hex');
const ident=s=>{if(!/^[a-z_][a-z0-9_]*$/.test(s))throw Error('Unsafe SQLite identifier');return '"'+s+'"';};
const has=(db,table,schema='main')=>!!db.prepare(`SELECT 1 FROM ${schema}.sqlite_master WHERE type='table' AND name=?`).get(table);
const cols=(db,table,schema='main')=>db.prepare(`PRAGMA ${schema}.table_info(${ident(table)})`).all().map(x=>x.name);
function insert(db,schema,table,row){const names=cols(db,table,schema);if(Object.keys(row).some(k=>!names.includes(k)))throw Error(`Incompatible native schema: ${table}`);const keys=Object.keys(row);db.prepare(`INSERT INTO ${schema}.${ident(table)} (${keys.map(ident)}) VALUES (${keys.map(()=>'?')})`).run(...keys.map(k=>row[k]));}
const NATIVE_HISTORY_SCHEMA='ec7cf6b7fa863bc061b29929b6f6c151834ffb7ae50277fbf13639d57077043a';
function initializeHistory(source,target){
 if(existsSync(target))return;
 const src=new DatabaseSync(source,{readOnly:true});let dest,owned=false,committed=false;
 try{src.exec('BEGIN');const ddl=src.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name').all();
  if(hash(JSON.stringify(ddl))!==NATIVE_HISTORY_SCHEMA)throw Error('Unrecognized 0.164 history schema; refusing bootstrap');
  writeFileSync(target,'',{flag:'wx',mode:0o600});owned=true;dest=new DatabaseSync(target);dest.exec('BEGIN');
  for(const r of [...ddl.filter(x=>x.type==='table'),...ddl.filter(x=>x.type!=='table')])dest.exec(r.sql);
  for(const row of src.prepare('SELECT * FROM _sqlx_migrations').all())insert(dest,'main','_sqlx_migrations',row);
  dest.exec('COMMIT');committed=true;
 }finally{dest?.close();src.close();if(owned&&!committed&&existsSync(target))unlinkSync(target);}
}
export function rebindRollout(bytes,tools){
 if(!bytes.length||bytes.at(-1)!==10)throw Error('Live or incomplete rollout: retry after source is stable');
 const parts=[],edits=[];let start=0,records=0,meta=0;
 while(start<bytes.length){const end=bytes.indexOf(10,start)+1;const original=bytes.subarray(start,end);if(!original.toString('utf8').trim()){parts.push(original);start=end;continue;}const row=JSON.parse(original);let replacement=original;
  if(row.type==='session_meta'){if(++meta!==1)throw Error('Multiple session metadata records');row.payload.dynamic_tools=tools;replacement=Buffer.from(JSON.stringify(row)+'\n');}
  else if(row.type==='response_item'&&row.payload?.type==='additional_tools'){row.payload.tools=[];replacement=Buffer.from(JSON.stringify(row)+'\n');}
  parts.push(replacement);if(replacement.length!==original.length)edits.push({end,delta:replacement.length-original.length});start=end;records++;
 }
 if(meta!==1)throw Error('Missing session metadata');
 return {bytes:Buffer.concat(parts),records,shift:n=>n==null?n:n+edits.filter(x=>x.end<=n).reduce((v,x)=>v+x.delta,0)};
}
/** Original databases are opened readOnly; only one selected thread is materialized. */
export function migrateSelectedThread({sourceHome,targetHome,threadId,toolSchemas,maxBytes=64*1024*1024,maxRows=100000}){
 const source=realpathSync(sourceHome),target=realpathSync(targetHome);
 if(inside(source,target)||inside(target,source))throw Error('Source and private state must be disjoint');
 if(typeof threadId!=='string'||!threadId||threadId.length>200)throw Error('Invalid thread identity');
 if(!Array.isArray(toolSchemas)||!toolSchemas.length||toolSchemas.some(x=>!/^workflow_[a-z0-9_]+$/.test(x.name)))throw Error('Guarded schemas required');
 const statePath=path.join(target,'state_5.sqlite'),historyPath=path.join(target,'thread_history_1.sqlite');
 // Native creates this database lazily on first turn. Bootstrap only pinned schema,
 // never source user-history rows or a full database snapshot.
 if(existsSync(statePath)&&!existsSync(historyPath))initializeHistory(path.join(source,'thread_history_1.sqlite'),historyPath);
 for(const file of [statePath,historyPath])if(!existsSync(file)||lstatSync(file).isSymbolicLink()||!inside(target,realpathSync(file)))throw Error('Initialized private native databases required');
 const sourceDb=new DatabaseSync(path.join(source,'state_5.sqlite'),{readOnly:true});let history,db,file,ownedFile=false,committed=false;
 try{
  sourceDb.exec('BEGIN');const row=sourceDb.prepare('SELECT * FROM threads WHERE id=?').get(threadId);if(!row)throw Error('Unknown source thread');
  const original=realpathSync(row.rollout_path);
  if(!['sessions','archived_sessions'].some(d=>inside(path.join(source,d),original)))throw Error('Original rollout escaped allowed history roots');
  const size=statSync(original).size;if(size>maxBytes)throw Error('Selected rollout exceeds migration budget');
  const disk=statfsSync(target);if(disk.bavail*disk.bsize<size*3+16*1024*1024)throw Error('Insufficient private migration disk budget');
  const bytes=readFileSync(original);if(bytes.length>maxBytes)throw Error('Selected rollout exceeds migration budget');const transformed=rebindRollout(bytes,toolSchemas);
  const destDir=path.join(target,'sessions','guarded-import',hash(threadId));mkdirSync(destDir,{recursive:true});if(!inside(target,realpathSync(destDir)))throw Error('Private rollout symlink escape');
  // Paginated native resume derives identity from its canonical rollout basename.
  file=path.join(destDir,path.basename(original));if(existsSync(file))throw Error('Private rollout already exists');
  history=new DatabaseSync(path.join(source,'thread_history_1.sqlite'),{readOnly:true});history.exec('BEGIN');
  db=new DatabaseSync(statePath);db.prepare('ATTACH DATABASE ? AS history').run(historyPath);db.exec('BEGIN IMMEDIATE');
  if(db.prepare('SELECT 1 FROM threads WHERE id=?').get(threadId))throw Error('Private thread already exists');
  const copyIdentity=(table,id)=>{if(id&&has(sourceDb,table)&&has(db,table)){const value=sourceDb.prepare(`SELECT * FROM ${ident(table)} WHERE id=?`).get(id);if(value&&!db.prepare(`SELECT 1 FROM ${ident(table)} WHERE id=?`).get(id))insert(db,'main',table,value);}};
  copyIdentity('projects',row.project_id);copyIdentity('thread_sections',row.thread_section_id);
  writeFileSync(file,transformed.bytes,{flag:'wx',mode:0o600});ownedFile=true;row.rollout_path=file;insert(db,'main','threads',row);
  for(const [i,t]of toolSchemas.entries())insert(db,'main','thread_dynamic_tools',{thread_id:threadId,position:i,name:t.name,description:t.description,input_schema:JSON.stringify(t.inputSchema),defer_loading:0,namespace:null});
  let copied=0;
  for(const table of ['thread_turns','thread_items','thread_history_projection_state','thread_realtime_items']){
   if(!has(history,table))continue;if(!has(db,table,'history'))throw Error(`Missing private history table: ${table}`);
   for(const r of history.prepare(`SELECT * FROM ${ident(table)} WHERE thread_id=?`).iterate(threadId)){
    if(++copied>maxRows)throw Error('Selected thread exceeds row budget');
    if(table==='thread_turns')for(const k of ['rollout_byte_offset','rollout_end_byte_offset'])r[k]=transformed.shift(r[k]);
    if(table==='thread_history_projection_state')r.next_rollout_byte_offset=transformed.shift(r.next_rollout_byte_offset);
    insert(db,'history',table,r);
   }
  }
  if(statSync(original).size!==bytes.length||hash(readFileSync(original))!==hash(bytes))throw Error('Original rollout changed during migration; retry after stable');
  db.exec('COMMIT');committed=true;
  return {threadId,workspace:row.cwd,rolloutPath:file,sourceBytes:bytes.length,sourceSha256:hash(bytes),privateSha256:hash(transformed.bytes),historyRows:copied,records:transformed.records};
 }finally{if(db){if(!committed)try{db.exec('ROLLBACK');}catch{}db.close();}history?.close();sourceDb.close();if(ownedFile&&!committed&&existsSync(file))unlinkSync(file);}
}
export function readThreadMetadata(home,threadId){const file=path.join(home,'state_5.sqlite');if(!existsSync(file))return null;const db=new DatabaseSync(file,{readOnly:true});try{return db.prepare('SELECT * FROM threads WHERE id=?').get(threadId)??null;}finally{db.close();}}
export function sameToolSchemas(actual,expected){
 const normalize=tools=>tools.map(t=>{if(Object.keys(t).some(k=>!['type','name','description','inputSchema','namespace','deferLoading'].includes(k))||t.type&&t.type!=='function'||t.namespace||t.deferLoading)throw Error('Unsafe persisted tool');return {name:t.name,description:t.description,inputSchema:t.inputSchema};});
 try{return Array.isArray(actual)&&JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected));}catch{return false;}
}
export function assertPersistedTools(home,threadId,file,schemas){
 const fd=openSync(file,'r'),parts=[];let size=0,complete=false;
 try{while(size<1024*1024){const chunk=Buffer.alloc(16384),n=readSync(fd,chunk,0,chunk.length,null);if(!n)break;const lineEnd=chunk.subarray(0,n).indexOf(10);parts.push(chunk.subarray(0,lineEnd<0?n:lineEnd));size+=n;if(lineEnd>=0){complete=true;break;}}}finally{closeSync(fd);}
 if(!complete)throw Error('Session metadata exceeds complete bounded read');const first=JSON.parse(Buffer.concat(parts));if(first.type!=='session_meta'||!sameToolSchemas(first.payload?.dynamic_tools,schemas))throw Error('Private persisted tool schema mismatch; refusing inherited tools');
 const db=new DatabaseSync(path.join(home,'state_5.sqlite'),{readOnly:true});try{const tools=db.prepare('SELECT * FROM thread_dynamic_tools WHERE thread_id=? ORDER BY position').all(threadId).map(t=>({name:t.name,description:t.description,inputSchema:JSON.parse(t.input_schema),namespace:t.namespace,deferLoading:!!t.defer_loading}));
  // 0.164 newly-created native threads leave this table empty and restore from
  // SessionMeta. Nonempty auxiliary rows must agree with the already-checked meta.
  if(tools.length&&!sameToolSchemas(tools,schemas))throw Error('Private SQLite tool schema mismatch');
 }finally{db.close();}
}
export function listThreadMetadata(homes,{maxEntries=10000}={}){
 const rows=new Map();for(const home of homes.filter(Boolean)){const file=path.join(home,'state_5.sqlite');if(!existsSync(file))continue;const db=new DatabaseSync(file,{readOnly:true});try{for(const row of db.prepare('SELECT * FROM threads LIMIT ?').all(maxEntries+1)){if(rows.size>=maxEntries&&!rows.has(row.id))throw Error('Thread index exceeds bounded metadata budget');rows.set(row.id,row);}}finally{db.close();}}return [...rows.values()];
}
const parsed=(v,fallback)=>{if(v==null)return fallback;try{return JSON.parse(v);}catch{return v;}};
export function metadataThread(r){return {id:r.id,sessionId:r.id,cwd:r.cwd,cliVersion:r.cli_version??'',createdAt:r.created_at??0,updatedAt:r.updated_at??0,recencyAt:r.recency_at??null,ephemeral:false,modelProvider:r.model_provider??'openai',model:r.model??null,reasoningEffort:r.reasoning_effort??null,preview:r.preview??r.first_user_message??'',name:r.name??r.title??null,projectId:r.project_id??null,source:parsed(r.source,'vscode'),originator:r.originator??null,threadSource:parsed(r.thread_source,null),status:{type:'notLoaded'},environments:null,path:null,turns:[],historyMode:r.history_mode??'legacy',section:null,canAcceptDirectInput:null};}
