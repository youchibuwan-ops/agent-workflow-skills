import {createServer} from 'node:http';import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';import {mkdirSync,realpathSync as fsRealpathSync,readFileSync,writeFileSync,lstatSync,statSync,existsSync} from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
import {createStrictBackend} from './native-backend.mjs';import {readParams,threadParams,resumeParams,turnParams,settingsParams} from './rpc-policy.mjs';import {inside,migrateSelectedThread,readThreadMetadata,listThreadMetadata,metadataThread,assertPersistedTools} from './legacy-store.mjs';import {finalState} from '../codex/rpc-policy.mjs';
import {createWorkspacePathPolicy} from '../security/verified-worktree.mjs';
import {createDesktopControls,NOT_DESKTOP_CONTROL} from './desktop-controls.mjs';
import {protectedProjectSegment} from '../security/project-path.mjs';
import {createSkillInventory} from './skill-inventory.mjs';
const realpathSync=fsRealpathSync.native;
const digest=s=>createHash('sha256').update(s).digest('hex');
export async function createDesktopGateway(options={}){
 const {controllerFactory,backendCommand,stateRoot,legacyCodexHome,workspaceResolver,onCard,onAudit}=options;
 if(typeof controllerFactory!=='function')throw Error('Controller factory required before gateway startup');
 // The owner bootstrap verifies the sealed distribution and external dependency
 // tree before invoking this factory. Module import itself loads built-ins only.
 const dependencyAnchor=options.dependencyRoot?path.join(realpathSync(options.dependencyRoot),'package.json'):new URL('../codex/package.json',import.meta.url);
 if(options.dependencyRoot&&!path.isAbsolute(options.dependencyRoot))throw Error('Absolute verified dependencyRoot required');
 const {WebSocketServer,WebSocket}=createRequire(dependencyAnchor)('ws');
 const schemas=structuredClone(options.toolSchemas);if(!Array.isArray(schemas)||!schemas.length||schemas.some(t=>!/^workflow_[a-z0-9_]{1,55}$/.test(t.name)||typeof t.description!=='string'||t.inputSchema?.type!=='object'||t.namespace||t.deferLoading)||new Set(schemas.map(t=>t.name)).size!==schemas.length)throw Error('Strict workflow-only tool schemas required');
 mkdirSync(stateRoot,{recursive:true});const root=realpathSync(stateRoot),legacy=legacyCodexHome?realpathSync(legacyCodexHome):null;
 if(legacy&&(inside(root,legacy)||inside(legacy,root)))throw Error('Legacy and private runtime must be disjoint');
 const models=new Map(options.strictCatalog?.models?.map(x=>[x.slug,x])),tokenPath=options.tokenPath??'/workflow/'+randomBytes(32).toString('hex');if(!/^\/workflow\/[A-Za-z0-9_-]{32,}$/.test(tokenPath))throw Error('Opaque loopback tokenPath required');
 const audit={events:[],failure:null,closed:false},threads=new Map(),clients=new Set(),callIds=new Set(),requestIds=new Set();let closing=false,native,http,wss,closePromise,nativeGeneration=0,actorAdmissions=0;
 const cursorKey=randomBytes(32),sign=s=>createHmac('sha256',cursorKey).update(s).digest('base64url');
 const record=(kind,data={})=>{const e={at:new Date().toISOString(),kind,...data};audit.events.push(e);const p=onAudit?.(e);if(p&&typeof p.then==='function'){p.catch(()=>{});throw Error('Audit collector must be synchronous');}};
 const send=(ws,m)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));};
 const broadcast=(m,threadId)=>{for(const c of clients)if(c.initialized&&(!threadId||c.subscriptions.has(threadId)))send(c.ws,m);};
 async function close(reason){if(closePromise)return closePromise;closing=true;audit.closed=true;if(reason){audit.failure=String(reason);try{record('fatal',{reason:String(reason)});}catch{}}
  closePromise=(async()=>{for(const t of threads.values())try{if(t.controller&&!t.controller.complete&&(reason||t.active||t.admitting))t.controller.abort(reason||'Gateway stopped during active work');}catch{}for(const c of clients)c.ws.terminate();await native?.close(reason);wss?.close();if(http)await new Promise(resolve=>http.close(()=>resolve()));})();return closePromise;
 }
 const fatal=e=>void close(e?.message??String(e));
 if(options.httpServer){const address=options.httpServer.address?.();if(!options.httpServer.listening||!address||address.address!=='127.0.0.1'||address.port!==options.port)throw Error('Verified prebound loopback HTTP owner required');http=options.httpServer;}
 const physical=p=>{let parent=path.resolve(p),tail=[];while(!existsSync(parent)){tail.unshift(path.basename(parent));const next=path.dirname(parent);if(next===parent)throw Error('Private workspace boundary cannot be resolved');parent=next;}return path.join(realpathSync(parent),...tail);};
 const protectedRoots=[root,legacy,...(options.privateRoots??[]).map(physical)].filter(Boolean);
 const workspaceLeases=new Map(),hardPrivateRoots=[root,...(options.hardPrivateRoots??[])];
 const pathPolicy=(cwd,lease)=>createWorkspacePathPolicy({workspace:cwd,privateRoots:protectedRoots,hardPrivateRoots,worktreeLease:lease});
 const assertThreadWorkspace=t=>pathPolicy(t.cwd,t.worktreeLease).assertWorkspace({allowPrivateSubroots:!!options.allowProtectedWorkspaceAncestors});
 const resolveWorkspace=async(cwd,threadId,{ownerDefault=false}={})=>{const selected=ownerDefault?cwd:workspaceResolver?await workspaceResolver({cwd,threadId}):cwd;if(typeof selected!=='string'||!path.isAbsolute(selected))throw Error('Explicit absolute workspace required');const actual=realpathSync(selected);if(!statSync(actual).isDirectory())throw Error('Workspace directory required');const current=threads.get(threadId);if(current)assertThreadWorkspace(current);const lease=current&&actual===current.cwd?current.worktreeLease:options.worktreeAuthority?.leaseForWorkspace(actual)??null;pathPolicy(actual,lease).assertWorkspace({allowPrivateSubroots:!ownerDefault&&!!options.allowProtectedWorkspaceAncestors});workspaceLeases.set(actual,lease);return actual;};
 let defaultWorkspace;try{if(options.defaultWorkspace!==undefined)defaultWorkspace=await resolveWorkspace(options.defaultWorkspace,undefined,{ownerDefault:true});}catch(e){throw Error('Invalid owner default workspace: '+e.message);}
 const requestedWorkspace=async(t,cwd)=>{assertThreadWorkspace(t);if(cwd==null)return t.cwd;const actual=await resolveWorkspace(cwd,t.id);if(actual!==t.cwd&&(t.active||t.controller||t.task!==0||t.legacy))throw Error('Workspace is fixed after task admission; rebinding denied');return actual;};
 const commitWorkspace=(t,cwd)=>{if(cwd===t.cwd)return;t.cwd=cwd;t.worktreeLease=workspaceLeases.get(cwd)??null;if(t.metadata)t.metadata={...t.metadata,cwd};t.provisional=false;record('workspace_bound',{threadId:t.id,workspace:cwd});};
 // A native rejection can occur after the trusted factory persisted a candidate
 // scope. Retain an independent host-only tombstone before aborting it, so cold
 // restart never restores that scope using the old native working directory.
 const failuresRoot=path.join(root,'admission-failures');mkdirSync(failuresRoot,{recursive:true});if(lstatSync(failuresRoot).isSymbolicLink()||!inside(root,realpathSync(failuresRoot)))throw Error('Admission failure directory redirected');
 const failureKeyPath=path.join(failuresRoot,'host.key');if(!existsSync(failureKeyPath))try{writeFileSync(failureKeyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 const failureFile=p=>{const s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!inside(failuresRoot,realpathSync(p)))throw Error('Admission failure authority redirected');return p;};
 const failureKey=readFileSync(failureFile(failureKeyPath));if(failureKey.length!==32)throw Error('Invalid admission failure authority');const failureMac=body=>createHmac('sha256',failureKey).update(JSON.stringify(body)).digest('hex');
 const loadFailure=id=>{const file=path.join(failuresRoot,digest(id)+'.json');if(!existsSync(file))return null;const bytes=readFileSync(failureFile(file));if(bytes.length>2048)throw Error('Admission failure record exceeds bounded authority');const saved=JSON.parse(bytes),body=saved.body,mac=failureMac(body);if(body?.version!==1||body.threadId!==id||body.kind!=='native-turn-admission-failed'||typeof saved.signature!=='string'||!/^[a-f0-9]{64}$/.test(saved.signature)||!timingSafeEqual(Buffer.from(mac),Buffer.from(saved.signature)))throw Error('Admission failure record integrity mismatch');return body.kind;};
 const saveFailure=id=>{const file=path.join(failuresRoot,digest(id)+'.json');if(existsSync(file)){loadFailure(id);return;}const body={version:1,threadId:id,kind:'native-turn-admission-failed',at:new Date().toISOString()};writeFileSync(file,JSON.stringify({body,signature:failureMac(body)}),{flag:'wx',mode:0o600});};
 const cardCallback=t=>async card=>{t.cards.push(structuredClone(card));record('card',{threadId:t.id,card});await onCard?.({threadId:t.id,...card});broadcast({method:'workflow/card',params:{threadId:t.id,...card}},t.id);};
 async function owned(id,{load=false}={}){
  if(typeof id!=='string'||!id||id.length>200)throw Error('Invalid thread identity');let t=threads.get(id);
  if(!t){let row=readThreadMetadata(native.env.CODEX_HOME,id);
   if(!row&&legacy){const sourceRow=readThreadMetadata(legacy,id);if(!sourceRow)throw Error('Unknown or foreign thread denied');await resolveWorkspace(sourceRow.cwd,id);const proof=migrateSelectedThread({sourceHome:legacy,targetHome:native.env.CODEX_HOME,threadId:id,toolSchemas:schemas,maxBytes:options.maxMigrationBytes});record('legacy_migrated',proof);row=readThreadMetadata(native.env.CODEX_HOME,id);}
   if(!row)throw Error('Unknown or foreign thread denied');const file=realpathSync(row.rollout_path);if(!inside(native.env.CODEX_HOME,file))throw Error('Private thread points to original/native external rollout');
   assertPersistedTools(native.env.CODEX_HOME,id,file,schemas);
   const cwd=await resolveWorkspace(row.cwd,id);t={id,cwd,worktreeLease:workspaceLeases.get(cwd)??null,admissionFailure:loadFailure(id),loaded:false,legacy:true,active:false,controller:null,cards:[],task:0};threads.set(id,t);
  }
  assertThreadWorkspace(t);
  if(load&&!t.loaded&&!t.admissionFailure){native.assertIntegrity();await native.rpc('thread/resume',resumeParams({threadId:id,excludeTurns:true},t.cwd));t.loaded=true;record('resumed',{threadId:id});}return t;
 }
 const skillInventory=createSkillInventory({roots:options.installedSkillRoots??[],stateRoot:root,backendCommand,strictCatalog:options.strictCatalog});
 const desktopControls=createDesktopControls({models,listSkills:()=>skillInventory.list(),backend:()=>native,defaultWorkspace,resolveRoot:async input=>{const actual=await resolveWorkspace(input),lease=workspaceLeases.get(actual);pathPolicy(actual,lease).assertWorkspace({allowPrivateSubroots:false});if(!lease&&actual.split(path.sep).some(protectedProjectSegment))throw Error('Protected metadata cannot become a desktop workspace');return actual;},
  assertIdle:()=>{if(closing||actorAdmissions||[...threads.values()].some(t=>t.active||t.admitting))throw Error('Desktop control requires idle native turns');},
  restart:async()=>{const previous=native;await previous.close();native=await openNative();for(const t of threads.values())t.loaded=false;record('native_restarted_after_setup',{});},send:(c,m)=>send(c.ws,m),record,failClosed:fatal,ownThread:id=>owned(id,{load:false})});
 const disabled=new Map([['app/list',{data:[],nextCursor:null}],['app/installed',{data:[],nextCursor:null}],['plugin/list',{marketplaces:[],featuredPluginIds:[],marketplaceLoadErrors:[]}],['hooks/list',{data:[]}],['mcpServerStatus/list',{data:[],nextCursor:null}]]);
 async function clientRpc(c,m){
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.method!=='string')throw Error('Client responses/malformed RPC denied');
  const p=m.params??{};if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid RPC parameters');
  if(m.method==='initialize'){const result=await native.rpc('initialize',{});c.initialized=true;return result;}if(!c.initialized)throw Error('Initialize required');if(m.method==='initialized')return;
  if(disabled.has(m.method))return structuredClone(disabled.get(m.method));
  const desktopResult=await desktopControls.handle(c,m.method,p);if(desktopResult!==NOT_DESKTOP_CONTROL)return desktopResult;
  if(m.method==='thread/list'){
   const safe=readParams(m.method,p),filterHash=digest(JSON.stringify({...safe,cursor:undefined,limit:undefined}));let offset=0;
   if(safe.cursor){if(typeof safe.cursor!=='string'||safe.cursor.length>1024)throw Error('Invalid index cursor');const [body,mac]=safe.cursor.split('.');if(sign(body)!==mac)throw Error('Invalid index cursor');const cursor=JSON.parse(Buffer.from(body,'base64url'));if(cursor.filterHash!==filterHash||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||cursor.offset>10000)throw Error('Invalid index cursor');offset=cursor.offset;}
   const rows=listThreadMetadata([legacy,native.env.CODEX_HOME]),byId=new Map();
   const normalized=s=>path.normalize(String(s).replace(/^\\\\\?\\/,''));
   if(safe.cwd!=null&&typeof safe.cwd!=='string'&&(!Array.isArray(safe.cwd)||safe.cwd.length>100||safe.cwd.some(x=>typeof x!=='string')))throw Error('Invalid cwd index filter');
   const matchesIndex=(r,sectionId=r.section?.id??null)=>!(safe.cwd!=null&&!(Array.isArray(safe.cwd)?safe.cwd:[safe.cwd]).some(x=>normalized(x)===normalized(r.cwd))||safe.projectId!==undefined&&safe.projectId!==(r.projectId??null)||safe.sectionId!==undefined&&safe.sectionId!==sectionId||safe.searchTerm&&!String(r.name??r.preview??'').toLowerCase().includes(String(safe.searchTerm).toLowerCase())||safe.sourceKinds?.length&&!safe.sourceKinds.includes(typeof r.source==='string'?r.source:r.source?.type));
   for(const row of rows){if(Boolean(row.archived)!==(safe.archived===true))continue;const r=metadataThread(row);if(matchesIndex(r,row.thread_section_id??null))byId.set(r.id,r);}
   if(!safe.archived)for(const t of threads.values())if(t.metadata&&!byId.has(t.id)&&matchesIndex(t.metadata))byId.set(t.id,t.metadata);
   const field=safe.sortKey==='updated_at'?'updatedAt':safe.sortKey==='recency_at'?'recencyAt':'createdAt',direction=safe.sortDirection==='asc'?1:-1,list=[...byId.values()].sort((a,b)=>direction*((a[field]??0)-(b[field]??0)||a.id.localeCompare(b.id))),limit=safe.limit??20,data=list.slice(offset,offset+limit),next=offset+data.length;
   if(Buffer.byteLength(JSON.stringify(data))>2*1024*1024)throw Error('Thread index page exceeds bounded complete-response budget');const body=Buffer.from(JSON.stringify({offset:next,filterHash})).toString('base64url');return {data,nextCursor:next<list.length?body+'.'+sign(body):null};
  }
  if(m.method==='thread/start'){
   desktopControls.assertAvailable();actorAdmissions++;try{
   native.assertIntegrity();const safe=threadParams(p,undefined,schemas,models);let selected=p.cwd,provisional=false,selectedProject;
   if(safe.projectId){const found=await desktopControls.handle(c,'project/read',{projectId:safe.projectId});if(found?.project?.id!==safe.projectId||!Array.isArray(found.project.roots)||!found.project.roots.length||typeof found.project.roots[0]?.path!=='string')throw Error('Native project workspace root unavailable');selectedProject=found.project;if(selected==null)selected=found.project.roots[0].path;}
   if(selected==null){if(!defaultWorkspace)throw Error('Explicit absolute workspace required');selected=defaultWorkspace;provisional=true;}
   const cwd=await resolveWorkspace(selected);if(selectedProject&&!selectedProject.roots.some(r=>inside(r.path,cwd)))throw Error('Project identity and selected workspace disagree');const result=await native.rpc(m.method,threadParams(p,cwd,schemas,models));const id=result?.thread?.id;if(typeof id!=='string'||threads.has(id))throw Error('Invalid new native thread identity');threads.set(id,{id,cwd,worktreeLease:workspaceLeases.get(cwd)??null,provisional,metadata:{...result.thread,cwd},loaded:true,active:false,controller:null,cards:[],task:0});c.subscriptions.add(id);record('thread_created',{threadId:id,workspace:cwd,provisional});return result;
   }finally{actorAdmissions--;}
  }
  if(['thread/resume','turn/start','turn/interrupt','thread/settings/update'].includes(m.method)||m.method.startsWith('thread/')&&['thread/read','thread/turns/list','thread/items/list','thread/items/read'].includes(m.method)){
   desktopControls.assertAvailable();actorAdmissions++;try{
   const t=await owned(p.threadId,{load:m.method!=='thread/read'});c.subscriptions.add(t.id);
   if(m.method==='thread/resume')return await native.rpc(m.method,resumeParams(p,t.cwd));
   if(m.method==='thread/settings/update'){if(t.admissionFailure)throw Error('Native turn admission failed; start a new thread');if(t.admitting)throw Error('Concurrent workspace binding denied');t.admitting=true;try{const cwd=await requestedWorkspace(t,p.cwd),result=await native.rpc(m.method,settingsParams(p,models,p.cwd==null?undefined:cwd));commitWorkspace(t,cwd);return result;}finally{t.admitting=false;}}
   if(m.method==='turn/interrupt'){if(!t.active||p.turnId!==t.turnId)throw Error('Unknown active turn');return await native.rpc(m.method,{threadId:t.id,turnId:t.turnId});}
   if(m.method==='turn/start'){
    native.assertIntegrity();if(t.admissionFailure)throw Error('Native turn admission failed; start a new thread');if(t.active||t.admitting)throw Error('Concurrent turn on same thread denied');t.admitting=true;try{const cwd=await requestedWorkspace(t,p.cwd),prepared=await skillInventory.prepareInput(p.input),request={...p,input:prepared.input},safe=turnParams(request,cwd,'',models,prepared.hints);const text=safe.input.map(x=>x.text).join('\n');
    try{const previous=t.controller;const controller=await controllerFactory({workspace:cwd,worktreeLease:cwd===t.cwd?t.worktreeLease:workspaceLeases.get(cwd),userMessage:text,sessionId:t.id,threadId:t.id,taskId:t.id+':'+(++t.task),stateRoot:path.join(root,'workflow',digest(t.id)),previousController:previous,kind:'auto',onCard:cardCallback(t)});
     if(!controller||JSON.stringify(controller.toolSchemas)!==JSON.stringify(schemas))throw Error('Controller schema mismatch');
     if(typeof controller.assertReady!=='function')throw Error('Controller readiness assertion required');if(controller===previous)await controller.acceptUserMessage(text);t.controller=controller;await controller.assertReady();if(controller.ready===false)throw Error('Controller not ready');
    }catch(e){fatal(e);throw e;}
    t.active=true;t.turnId=null;record('turn_allowed',{threadId:t.id,stage:t.controller.stage});
    try{const result=await native.rpc('turn/start',turnParams(request,cwd,t.controller.instructions,models,prepared.hints));if(typeof result?.turn?.id!=='string')throw Error('Native turn identity absent');if(t.turnId&&t.turnId!==result.turn.id)throw Error('Native turn identity mismatch');t.turnId=result.turn.id;commitWorkspace(t,cwd);t.provisional=false;return result;}catch(e){t.active=false;t.admissionFailure='native-turn-admission-failed';try{saveFailure(t.id);await t.controller.abort('Native turn admission failed: '+e.message);}catch(abortError){fatal(abortError);}const state={status:'blocked',stage:t.controller.stage,complete:false,blockedReason:'Native turn admission failed; start a new thread'};record('turn_admission_failed',{threadId:t.id,...state,reason:e.message});broadcast({method:'workflow/state',params:{threadId:t.id,...state}},t.id);throw e;}
    }finally{t.admitting=false;}
   }
   return await native.rpc(m.method,readParams(m.method,p));
   }finally{actorAdmissions--;}
  }
  const params=readParams(m.method,p);return native.rpc(m.method,params);
 }
 async function openNative(){const generation=++nativeGeneration;
  return createStrictBackend({...options,stateRoot:root,onAudit:e=>record('native_'+e.kind,Object.fromEntries(Object.entries(e).filter(([k])=>!['kind','at'].includes(k)))),onFatal:fatal,
   onRequest:async m=>{const p=m.params??{},t=threads.get(p.threadId);
    if(m.method!=='item/tool/call'||!t?.active||!t.controller||p.turnId!==t.turnId||p.namespace||!schemas.some(s=>s.name===p.tool))throw Error(`Unknown native request/tool: ${m.method}/${p.tool??''}`);
    const requestKey=generation+':'+m.id;if(requestIds.has(requestKey)||typeof p.callId!=='string'||callIds.has(p.callId)||!p.arguments||typeof p.arguments!=='object'||Array.isArray(p.arguments))throw Error('Malformed/replayed native tool call');requestIds.add(requestKey);callIds.add(p.callId);
    await t.controller.assertReady();const result=await t.controller.dispatch(p.tool,p.arguments,{callId:p.callId});if(!result||typeof result.ok!=='boolean'||result.fatal===true)throw Error('Fatal host controller result');
    const response={...result,...(t.cards.length?{hostCards:t.cards.splice(0)}:{})},text=JSON.stringify(response);if(Buffer.byteLength(text)>65536)throw Error('Tool result exceeds complete-delivery 64KiB boundary');record('dispatch',{threadId:t.id,tool:p.tool,callId:p.callId,stage:t.controller.stage,ok:result.ok});return {success:result.ok,contentItems:[{type:'inputText',text}]};
   },onNotification:async m=>{
    if(generation!==nativeGeneration)return;if(await desktopControls.notify(m))return;
    if(/compact/i.test(m.method)||/compact/i.test(m.params?.item?.type??''))throw Error('Compaction is forbidden for current workflow evidence');const id=m.params?.threadId,t=threads.get(id);
    if(m.method==='turn/started'){if(!t?.active)throw Error('Native unsolicited turn');t.turnId=m.params.turn?.id;}
    if(m.method==='thread/project/updated'&&t){if(m.params.projectId!=null){const result=await desktopControls.handle(null,'project/read',{projectId:m.params.projectId});if(!result.project.roots.some(r=>inside(r.path,t.cwd)))throw Error('Native project update changed workspace membership');}if(t.metadata)t.metadata={...t.metadata,projectId:m.params.projectId??null};}
    if(m.method==='turn/completed'){if(!t?.controller||!t.active)throw Error('Unowned native completion');t.active=false;const state=finalState(t.controller);record('turn_finished',{threadId:id,...state});broadcast({method:'workflow/state',params:{threadId:id,...state}},id);m={...m,params:{...m.params,workflow:state,turn:{...m.params.turn}}};if(state.status==='blocked'){m.params.turn.status='failed';m.params.turn.error={message:`Workflow incomplete at ${state.stage}`,codexErrorInfo:null,additionalDetails:state.blockedReason};}}
    if(m.method==='item/tool/call')throw Error('Tool calls cannot be notifications');broadcast(m,id);
   }});
 }
 try{
  native=await openNative();
  http??=createServer((req,res)=>{res.writeHead(404);res.end();});wss=new WebSocketServer({noServer:true,maxPayload:8*1024*1024,perMessageDeflate:false});
  http.on('upgrade',(req,socket,head)=>{if(closing||req.url!==tokenPath||req.headers.origin||!['127.0.0.1','::ffff:127.0.0.1'].includes(socket.remoteAddress)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',ws=>{const c={ws,initialized:false,subscriptions:new Set(),inflight:new Set(),chain:Promise.resolve()};clients.add(c);
   ws.on('message',(bytes,binary)=>{if(binary){ws.terminate();return;}let m;try{m=JSON.parse(bytes.toString());}catch{ws.terminate();return;}
    if(m.id===undefined&&m.method!=='initialized'){ws.terminate();return;}
    if(m.id!==undefined&&(!['string','number'].includes(typeof m.id)||c.inflight.has(m.id))){ws.terminate();return;}
    if(m.id!==undefined)c.inflight.add(m.id);
    c.chain=c.chain.then(async()=>{try{const result=await clientRpc(c,m);if(m.id!==undefined)send(ws,{id:m.id,result:result??{}});}catch(e){record('client_denied',{method:m.method,reason:e.message});if(m.id!==undefined)send(ws,{id:m.id,error:e.rpcError??{code:-32001,message:e.message}});}finally{c.inflight.delete(m.id);}}).catch(fatal);
   });ws.on('error',()=>ws.terminate());ws.on('close',()=>{clients.delete(c);for(const id of c.subscriptions){const t=threads.get(id);if(t?.active&&![...clients].some(x=>x.subscriptions.has(id))){if(!t.controller.complete)t.controller.abort('Last desktop subscriber disconnected');void native.rpc('turn/interrupt',{threadId:id,turnId:t.turnId}).catch(fatal);}}});
  });
  if(!http.listening)await new Promise((resolve,reject)=>{http.once('error',reject);http.listen(options.port??0,'127.0.0.1',resolve);});record('gateway_ready');
  return {url:`ws://127.0.0.1:${http.address().port}${tokenPath}`,port:http.address().port,close,exportAudit:()=>structuredClone(audit),nativeHome:native.env.CODEX_HOME,hasInitializedFrontend:()=>[...clients].some(c=>c.initialized&&c.ws.readyState===WebSocket.OPEN)};
 }catch(e){await close(e.message);throw e;}
}
