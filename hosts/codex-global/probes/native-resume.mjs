import {DatabaseSync,backup} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {isolatedBackendEnv} from '../../codex/proxy.mjs';
import {restrictCatalog,strictConfig,strictArguments} from '../../codex/strict-config.mjs';
const root=path.resolve(process.argv[2]);if(existsSync(root))throw Error('Refuse overwrite');mkdirSync(root,{recursive:true});
const workspace=path.join(root,'workspace');mkdirSync(workspace);const schema=name=>({name,description:'Native migration feasibility fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}});
const legacy=[schema('legacy_write')],guarded=[schema('workflow_status')],requests=[],allRpc=[];let phase='seed',counter=0;
const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);if(!req.url.includes('responses')){res.writeHead(200,{'content-type':'application/json'});res.end('{"data":[]}');return;}
 const body=JSON.parse(Buffer.concat(chunks));requests.push({phase,body});const names=counter++===0?(phase==='seed'?['legacy_write']:['legacy_write','workflow_status','exec_command','apply_patch','write_stdin','spawn_agent','exec','mcp__probe__write']):[];
 const items=names.length?names.map((name,i)=>({type:'function_call',id:`fc-${phase}-${i}`,call_id:`call-${phase}-${i}`,name,arguments:JSON.stringify(name==='exec_command'?{cmd:'Set-Content native-marker.txt BYPASS'}:name==='apply_patch'?{patch:'*** Begin Patch\n*** Add File: patch-marker.txt\n+BYPASS\n*** End Patch'}:{})})):[{type:'message',id:`msg-${phase}`,role:'assistant',content:[{type:'output_text',text:'done'}]}];
 res.writeHead(200,{'content-type':'text/event-stream'});const emit=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);emit('response.created',{response:{id:`r-${phase}-${counter}`}});items.forEach((item,i)=>emit('response.output_item.done',{output_index:i,item}));emit('response.completed',{response:{id:`r-${phase}-${counter}`,status:'completed',usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});res.end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const catalog=restrictCatalog(JSON.parse(readFileSync(process.env.WORKFLOW_MODEL_CATALOG??path.join(os.homedir(),'.codex/models_cache.json'))));const catalogPath=path.join(root,'strict-models.json');writeFileSync(catalogPath,JSON.stringify(catalog));
async function backend(label,clone){
 const home=path.join(root,label),env=isolatedBackendEnv(home);
 if(clone){
  for(const name of ['state_5.sqlite','thread_history_1.sqlite']){const src=new DatabaseSync(path.join(clone.home,name),{readOnly:true});try{await backup(src,path.join(env.CODEX_HOME,name));}finally{src.close();}}
  const file=path.join(env.CODEX_HOME,'sessions',path.basename(clone.file));mkdirSync(path.dirname(file),{recursive:true});copyFileSync(clone.file,file);
  if(clone.rebind){
   const bytes=readFileSync(file),parts=[],edits=[];let start=0;
   while(start<bytes.length){let end=bytes.indexOf(10,start);if(end<0)end=bytes.length;else end++;
    const original=bytes.subarray(start,end),row=JSON.parse(original);let replacement=original;
    if(row.type==='session_meta'){row.payload.dynamic_tools=guarded;replacement=Buffer.from(JSON.stringify(row)+'\n');}
    else if(row.type==='response_item'&&row.payload?.type==='additional_tools'){row.payload.tools=[];replacement=Buffer.from(JSON.stringify(row)+'\n');}
    parts.push(replacement);if(replacement.length!==original.length)edits.push({end,delta:replacement.length-original.length});start=end;
   }
   writeFileSync(file,Buffer.concat(parts));const shifted=value=>value==null?value:value+edits.filter(x=>x.end<=value).reduce((n,x)=>n+x.delta,0);
   const history=new DatabaseSync(path.join(env.CODEX_HOME,'thread_history_1.sqlite'));
   try{for(const [table,columns]of [['thread_turns',['rollout_byte_offset','rollout_end_byte_offset']],['thread_history_projection_state',['next_rollout_byte_offset']]]){
    for(const row of history.prepare(`SELECT rowid,${columns.join(',')} FROM ${table} WHERE thread_id=?`).all(clone.id))history.prepare(`UPDATE ${table} SET ${columns.map(x=>x+'=?').join(',')} WHERE rowid=?`).run(...columns.map(x=>shifted(row[x])),row.rowid);
   }}finally{history.close();}
  }
  const db=new DatabaseSync(path.join(env.CODEX_HOME,'state_5.sqlite'));
  try{db.prepare('UPDATE threads SET rollout_path=? WHERE id=?').run(file,clone.id);
   if(clone.rebind){db.prepare('DELETE FROM thread_dynamic_tools WHERE thread_id=?').run(clone.id);for(const [i,tool]of guarded.entries())db.prepare('INSERT INTO thread_dynamic_tools(thread_id,position,name,description,input_schema,defer_loading,namespace) VALUES(?,?,?,?,?,0,NULL)').run(clone.id,i,tool.name,tool.description,JSON.stringify(tool.inputSchema));}
  }finally{db.close();}
 }
 writeFileSync(path.join(env.CODEX_HOME,'config.toml'),strictConfig(catalogPath));
 const command=process.env.CODEX_APP_RUNTIME_CLI_PATH;if(!command)throw Error('Installed runtime required');
 const child=spawn(command,['-c','model_provider="probe"','-c',`model_providers.probe={name="private",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false,supports_websockets=false}`,...strictArguments(catalogPath),'app-server','--strict-config'],{cwd:home,env,windowsHide:true});
 let buffer='',next=1;const waiting=new Map(),tools=[];let complete;
 child.stderr.on('data',b=>writeFileSync(path.join(root,label+'.stderr.log'),b,{flag:'a'}));
 const send=m=>{allRpc.push({phase,label,direction:'out',message:m});child.stdin.write(JSON.stringify(m)+'\n');};
 child.stdout.on('data',bytes=>{buffer+=bytes;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;const m=JSON.parse(line);allRpc.push({phase,label,direction:'in',message:m});if(m.id!==undefined&&waiting.has(m.id)){const w=waiting.get(m.id);waiting.delete(m.id);m.error?w.reject(Error(JSON.stringify(m.error))):w.resolve(m.result);}else if(m.id!==undefined&&m.method==='item/tool/call'){tools.push(m.params.tool);send({id:m.id,result:{success:false,contentItems:[{type:'inputText',text:'HOST_DENIED_FIXTURE_NO_BODY'}]}});}else if(m.id!==undefined)send({id:m.id,error:{code:-32601,message:'No test authority'}});else if(m.method==='turn/completed')complete?.(m.params);}});
 child.on('exit',()=>{for(const w of waiting.values())w.reject(Error('Native backend exited'));});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>reject(Error('RPC timeout '+method)),15000);waiting.set(id,{resolve:x=>{clearTimeout(timer);resolve(x);},reject:e=>{clearTimeout(timer);reject(e);}});send({id,method,params});});
 return {child,env,tools,rpc,async init(){await rpc('initialize',{clientInfo:{name:'desktop-migration-feasibility',version:'1'},capabilities:{experimentalApi:true}});if(!process.argv.includes('--no-ack'))send({method:'initialized',params:{}});},async turn(id){const done=new Promise(resolve=>complete=resolve);await rpc('turn/start',{threadId:id,environments:[],input:[{type:'text',text:'Private deterministic dispatch probe.'}]});return await done;},async close(){if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise(r=>child.once('close',r));child.stdin.end();child.kill();await done;}};
}
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.jsonl')?[path.join(d,e.name)]:[]);
const visible=record=>{const names=[];function add(tools){for(const t of tools??[])if(t.type==='namespace')add(t.tools);else names.push(t.name??t.type);}add(record.body.tools);for(const i of record.body.input??[])if(i.type==='additional_tools')add(i.tools);return names;};
let current,result;const capabilityResults={};
try{
 current=await backend('seed');await current.init();for(const [method,params]of [['getAuthStatus',{includeToken:false,refreshToken:false}],['configRequirements/read',{}],['account/read',{refreshToken:false}],['collaborationMode/list',{}],['experimentalFeature/list',{}],['permissionProfile/list',{}],['thread/startAeon',{}],['turn/addUserMessage',{}],['thread/settings/update',{}],['thread/loaded/list',{}]]){try{const value=await current.rpc(method,params);capabilityResults[method]={supported:true,keys:Object.keys(value??{})};}catch(error){capabilityResults[method]={supported:!error.message.includes('Unknown method')&&!error.message.includes('Method not found')&&!error.message.includes('unknown variant'),error:error.message.slice(0,300)};}}const t=await current.rpc('thread/start',{cwd:workspace,dynamicTools:legacy,environments:[],approvalPolicy:'never'});await current.turn(t.thread.id);await current.close();const file=walk(path.join(current.env.CODEX_HOME,'sessions'))[0],original=readFileSync(file,'utf8'),originalHash=createHash('sha256').update(original).digest('hex');
 const seedHome=current.env.CODEX_HOME;phase='baseline';counter=0;current=await backend('baseline',{home:seedHome,file,id:t.thread.id});await current.init();const baseline=await current.rpc('thread/resume',{threadId:t.thread.id,dynamicTools:guarded,approvalPolicy:'never',sandbox:'read-only',cwd:workspace});const beforeTurnRequests=requests.filter(x=>x.phase===phase).length;await current.turn(baseline.thread.id);await current.close();assert.deepEqual(visible(requests.find(x=>x.phase===phase)),['legacy_write']);assert.deepEqual(current.tools,['legacy_write']);
 const rows=original.trimEnd().split('\n').map(x=>JSON.parse(x));
 phase='migrated';counter=0;current=await backend('migrated',{home:seedHome,file,id:t.thread.id,rebind:true});await current.init();const resumed=await current.rpc('thread/resume',{threadId:t.thread.id,approvalPolicy:'never',sandbox:'read-only',cwd:workspace});const historicalPage=await current.rpc('thread/turns/list',{threadId:resumed.thread.id,limit:10,sortDirection:'asc',itemsView:'full'});assert.ok(historicalPage.data.length>=1);assert.ok(JSON.stringify(historicalPage).includes('legacy_write'));const migratedBeforeTurnRequests=requests.filter(x=>x.phase===phase).length;await current.turn(resumed.thread.id);await current.close();assert.equal(resumed.thread.id,t.thread.id);assert.deepEqual(visible(requests.find(x=>x.phase===phase)),['workflow_status']);assert.deepEqual(current.tools,['workflow_status']);assert.ok(JSON.stringify(requests.find(x=>x.phase===phase).body.input).includes('call-seed-0'));
 assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),originalHash);for(const name of ['native-marker.txt','patch-marker.txt'])assert.equal(existsSync(path.join(workspace,name)),false);
 const errors=requests.filter(x=>x.phase==='migrated')[1].body.input.filter(x=>x.type==='function_call_output');for(const name of ['legacy_write','exec_command','apply_patch','write_stdin','spawn_agent','exec','mcp__probe__write'])assert.ok(JSON.stringify(errors).includes('unsupported call: '+name));
 result={status:'pass',testKind:'actual-0.164-native-deterministic-provider-resume-metadata-rebind-feasibility-not-desktop-UI',clientInitializedNotification:!process.argv.includes('--no-ack'),rpcCapabilities:capabilityResults,sameThreadId:true,paginatedOldTurnsReadable:historicalPage.data.length,oldToolHistoryRetained:true,baselineResumeIgnoresDynamicTools:true,baselineVisible:['legacy_write'],migratedVisible:['workflow_status'],onlyGuardedCallback:true,rawAndLegacyUnsupported:7,originalUnchanged:true,markersAbsent:true,beforeTurnModelRequests:{baseline:beforeTurnRequests,migrated:migratedBeforeTurnRequests},privateToolRebind:'private SQLite+SessionMeta tools, obsolete historical declarations cleared; projection offsets adjusted, original untouched',historyItemsPreserved:rows.filter(x=>x.type==='response_item').length};
}catch(e){result={status:'failed',phase,error:e.stack};process.exitCode=1;}finally{await current?.close();await new Promise(r=>server.close(r));writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(root,'requests.json'),JSON.stringify(requests,null,2));writeFileSync(path.join(root,'rpc.json'),JSON.stringify(allRpc,null,2));console.log(JSON.stringify(result,null,2));}
