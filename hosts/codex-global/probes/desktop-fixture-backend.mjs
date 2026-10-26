// Native transport double for control-state tests. It performs no OS setup.
import {createInterface} from 'node:readline';import {readFileSync,writeFileSync,existsSync,statSync,readdirSync,renameSync,mkdirSync} from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
if(process.argv.includes('--version')){console.log('codex-cli 0.164.0-alpha.11.1');process.exit(0);}
const home=process.env.CODEX_HOME,file=path.join(home,'config.toml'),store=path.join(home,'desktop-projects.json'),threadFile=path.join(home,'desktop-threads.json'),threads=existsSync(threadFile)?JSON.parse(readFileSync(threadFile)):[],loadedMode=readFileSync(file,'utf8').match(/\[windows\]\nsandbox = "(elevated|unelevated)"/)?.[1];let nextToolRequest=7;const toolRequests=new Map();
const send=m=>process.stdout.write(JSON.stringify(m)+'\n'),reply=(id,result)=>send({id,result}),version=()=> 'native-opaque:'+createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,20);
const quote=p=>p.includes('\\')&&!p.includes("'")?"'"+p+"'":JSON.stringify(p);
function edit(key,value){let text=readFileSync(file,'utf8');if(key==='windows.sandbox'){const block='\n[windows]\nsandbox = "'+value+'"\n';text=text.includes('\n[windows]\n')?text.replace(/\n\[windows\]\nsandbox = "[^"]+"\n/,block):text+block;}else{const root=JSON.parse(key.slice(9,-12)),header='\n[projects.'+quote(root)+']\n',block=header+'trust_level = "'+value+'"\n';const start=text.indexOf(header);text=start<0?text+block:text.slice(0,start)+block+text.slice(text.indexOf('\n',start+header.length)+1);}
const pending=file+'.native-temp';writeFileSync(pending,text);renameSync(pending,file);}
for await(const line of createInterface({input:process.stdin})){let m;try{m=JSON.parse(line);}catch{continue;}if(m.id===undefined)continue;if(!m.method){const task=toolRequests.get(m.id);if(task){toolRequests.delete(m.id);send({method:'turn/completed',params:{threadId:task.threadId,turn:{id:task.turnId,status:'completed',error:null}}});}continue;}const p=m.params??{};
try{switch(m.method){
case 'initialize':reply(m.id,{serverVersion:'desktop-control-fixture'});break;
case 'windowsSandbox/readiness':reply(m.id,{status:loadedMode?'ready':'notConfigured'});break;
case 'windowsSandbox/setupStart':reply(m.id,{started:true});setTimeout(()=>{edit('windows.sandbox',p.mode);send({method:'windowsSandbox/setupCompleted',params:{mode:p.mode,success:true,error:null}});},15);break;
case 'config/batchWrite':if(p.expectedVersion!=null&&p.expectedVersion!==version())throw Error('Native config version conflict');for(const e of p.edits)edit(e.keyPath,e.value);reply(m.id,{filePath:file,status:'ok',version:version(),overriddenMetadata:null});break;
case 'config/read':reply(m.id,{config:{windows:{sandbox:loadedMode??null}},origins:{},layers:p.includeLayers?[{name:{type:'user',file},version:version(),config:{}}]:null});break;
case 'project/create':{const projects=existsSync(store)?JSON.parse(readFileSync(store)):[];let project=projects.find(x=>x.idempotencyKey===p.idempotencyKey);if(!project){project={id:'project-'+(projects.length+1),name:p.name,roots:p.roots,metadata:p.metadata??{},createdAt:1,updatedAt:1,position:projects.length,idempotencyKey:p.idempotencyKey};projects.push(project);writeFileSync(store,JSON.stringify(projects));}reply(m.id,{project});break;}
case 'project/list':reply(m.id,{data:existsSync(store)?JSON.parse(readFileSync(store)):[],nextCursor:null});break;
case 'project/read':{const project=(existsSync(store)?JSON.parse(readFileSync(store)):[]).find(x=>x.id===p.projectId);if(!project)throw Error('Missing project');reply(m.id,{project});break;}
case 'project/move':reply(m.id,{});break;
case 'thread/start':{const thread={id:randomUUID(),cwd:p.cwd,projectId:p.projectId??null,name:null,preview:'',createdAt:1,updatedAt:1,source:'appServer'};threads.push(thread);writeFileSync(threadFile,JSON.stringify(threads));reply(m.id,{thread});break;}
case 'thread/resume':case 'thread/read':{const thread=threads.find(t=>t.id===p.threadId);if(!thread)throw Error('Unknown thread');reply(m.id,{thread});break;}
case 'thread/queue/list':reply(m.id,{data:[],nextCursor:null});break;
case 'thread/metadata/update':{const thread=threads.find(t=>t.id===p.threadId);if(!thread)throw Error('Unknown thread');if(p.projectId!=null)thread.projectId=p.projectId||null;writeFileSync(threadFile,JSON.stringify(threads));reply(m.id,{thread});send({method:'thread/project/updated',params:{threadId:thread.id,projectId:thread.projectId}});break;}
case 'turn/start':{const turnId=randomUUID(),requestId=nextToolRequest++,task={threadId:p.threadId,turnId};reply(m.id,{turn:{id:turnId,status:'inProgress'}});send({method:'turn/started',params:{threadId:p.threadId,turn:{id:turnId,status:'inProgress'}}});toolRequests.set(requestId,task);send({id:requestId,method:'item/tool/call',params:{...task,callId:randomUUID(),tool:'workflow_status',arguments:{}}});break;}
case 'fs/getMetadata':{const s=statSync(p.path);reply(m.id,{isDirectory:s.isDirectory(),isFile:s.isFile(),isSymlink:false,createdAtMs:s.birthtimeMs,modifiedAtMs:s.mtimeMs});break;}
case 'fs/readDirectory':reply(m.id,{entries:readdirSync(p.path,{withFileTypes:true}).map(s=>({fileName:s.name,isFile:s.isFile(),isDirectory:s.isDirectory()}))});break;
case 'fs/readFile':reply(m.id,{dataBase64:readFileSync(p.path).toString('base64')});break;
default:reply(m.id,{});
}}catch(e){send({id:m.id,error:{code:-32000,message:e.message}});}}
