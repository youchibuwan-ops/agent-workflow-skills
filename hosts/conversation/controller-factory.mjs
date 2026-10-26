// Production conversation binding. A human request is retained verbatim; the
// actor never supplies an oracle, a completed stage or its own task authority.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkflowHost,WORKFLOW_TOOL_SCHEMAS,isWorkflowProgressQuery,isConversationQuestion} from '../core/workflow-host.mjs';
import {createSourceProvider} from '../providers/source-provider.mjs';
import {createNativeWorkspaceIO} from '../providers/native-workspace-io.mjs';
import {createSandboxProvider} from '../providers/sandbox-provider.mjs';
import {createVerifiedWorktreeAuthority,createWorkspacePathPolicy} from '../security/verified-worktree.mjs';
import {consumeResumeAuthorization} from './resume-authorization.mjs';
import {bindWorkspaceRoot} from '../security/workspace-root.mjs';
import {createProjectWorkspaces} from '../security/project-workspaces.mjs';
import {projectPathKey} from '../security/project-path.mjs';
export const toolSchemas=WORKFLOW_TOOL_SCHEMAS;
const sha=x=>createHash('sha256').update(x).digest('hex');
function readonlyDiagnostic(text){
 if(typeof text!=='string')return false;
 // Quoted/attributed wording is data, never the external user's directive.
 const intent=text.replace(/“[^”]*”|‘[^’]*’|"[^"\n]*"|'[^'\n]*'|`[^`]*`/gu,' ');
 if(!/^\s*(?:只读(?:检查|核对|验收|测试|诊断)|这是[^。！？\n]{0,100}只读(?:验收|检查|测试)|read[- ]only\b|only\s+read\b)/i.test(intent)||!/(?:不得修改|不要修改|不修改|no writes|do not (?:write|modify|edit)|without (?:writing|editing))/i.test(intent))return false;
 // Stay conservative on mixed scopes: a negative clause cannot consume a
 // following contrast/mutation directive and turn it into readonly authority.
 const remaining=intent.replace(/(?:不得|不要|禁止|不准|无需|不)(?:再)?(?:修改|写入|编辑|制作|生成|保存|创建)(?:(?!(?:但|不过|然而|然后|同时|并且|接着))[^，,。；;！？!?\n])*/gu,' ').replace(/(?:do not|don't|no|without)\s+(?:writ(?:e|es|ing)|edit(?:s|ing)?|modify(?:ing)?|creat(?:e|ing)|sav(?:e|ing)|generat(?:e|ing))(?:(?!\b(?:but|then|however|instead)\b)[^,.;!?\n])*/giu,' ').replace(/制作(?:流程|任务|阶段)/gu,'');
 return !/(?:修改|改写|写入|编辑|制作|生成|保存|创建|实现|替换)|\b(?:write|modify|edit|create|save|generate)\b/iu.test(remaining);
}
const inside=(root,p)=>{const r=relative(root,p);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
function privateDirectory(path){mkdirSync(path,{recursive:true});if(lstatSync(path).isSymbolicLink())throw Error('Private controller directory must not be redirected');return realpathSync.native(path);}

export function createConversationFactory(options={}){
 if(typeof options.stateRoot!=='string'||!Array.isArray(options.installedRoots))throw Error('Trusted conversation stateRoot and installedRoots required');
 const worktreeAuthority=options.worktreeAuthority??createVerifiedWorktreeAuthority({authorizations:options.worktreeAuthorizations??[]});
 const root=privateDirectory(options.stateRoot),sessions=privateDirectory(join(root,'sessions')),tasks=privateDirectory(join(root,'tasks'));
 const managed=privateDirectory(join(root,'managed-skills')),acquisition=privateDirectory(join(root,'acquisition'));
 const keyPath=join(root,'envelope.key');if(!existsSync(keyPath))try{writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(lstatSync(keyPath).isSymbolicLink())throw Error('Private envelope key redirected');const key=readFileSync(keyPath);if(key.length!==32)throw Error('Invalid private envelope key');
 const owned=new WeakSet(),origins=new WeakMap();
 const signature=body=>createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
 function load(path){if(!existsSync(path))return null;if(lstatSync(path).isSymbolicLink())throw Error('Session envelope redirected');const bytes=readFileSync(path),stored=JSON.parse(bytes),expected=signature(stored.body);if(typeof stored.signature!=='string'||stored.signature.length!==expected.length||!timingSafeEqual(Buffer.from(stored.signature),Buffer.from(expected)))throw Error('Session envelope integrity signature mismatch');return{body:stored.body,sha256:sha(bytes)};}
 function store(path,body){const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(temp,JSON.stringify({body,signature:signature(body)}),{mode:0o600});renameSync(temp,path);}
 return async function conversationFactory(input){
  const workspace=realpathSync(input.workspace),sessionId=String(input.sessionId??input.threadId??'');if(!sessionId)throw Error('Real native session/thread identity required');
  if(input.worktreeLease!=null&&!worktreeAuthority.acceptsLease(input.worktreeLease,workspace))throw Error('Foreign worktree lease authority denied');
  const worktreeLease=input.worktreeLease??worktreeAuthority.leaseForWorkspace(workspace);
  const hardPrivateRoots=[root,resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dirname(process.execPath),...(options.hardPrivateRoots??[])];
  const pathPolicy=createWorkspacePathPolicy({workspace,privateRoots:options.privateRoots??[],hardPrivateRoots,worktreeLease});pathPolicy.assertWorkspace({allowPrivateSubroots:true});
  const sessionKey=sha(Buffer.from(sessionId)),envelopePath=join(sessions,sessionKey+'.json');
  const previous=input.previousController;
  if(previous&&!owned.has(previous))throw Error('Previous controller belongs to another factory authority');
  if(previous){const origin=origins.get(previous);if(origin.workspace!==workspace||origin.sessionId!==sessionId)throw Error('Cross-session controller reuse denied');origin.pathPolicy.assertCurrent();}
  if(previous&&input.kind==='resume'&&!previous.complete&&previous.exportAudit().failed==null){
   const origin=origins.get(previous);
   if(Boolean(origin.nativeBinding.executor)!==Boolean(input.nativeExecutor))throw Error('Native permission delegate presence changed across Agent resume');
   // The session's task/evidence stays alive; only its native Agent capability
   // and card callback are rebound. Never retain the disposed Agent executor.
   origin.nativeBinding.executor=input.nativeExecutor;origin.nativeBinding.onCard=input.onCard;
   return previous;
  }
  const explicitNew=input.kind!=='resume'&&typeof input.userMessage==='string'&&/^\/workflow new\s+/.test(input.userMessage);
  if(previous&&input.kind!=='resume'&&isWorkflowProgressQuery(input.userMessage))return previous;
  if(previous&&!previous.complete&&previous.exportAudit().failed==null&&!explicitNew&&input.kind!=='resume')return previous;
  if(previous&&explicitNew)previous.abort('Actual external user explicitly opened a new task');
  const envelope=load(envelopePath),old=envelope?.body;if(old&&(old.sessionId!==sessionId||old.workspace!==workspace))throw Error('Durable session scope mismatch');
  // Opening completed native history supplies no new external task. Preserve
  // the signed completion verbatim and wait for the next actual user message.
  if(input.kind==='resume'&&old?.complete===true)return{awaitingUserTask:true};
  // Native resume is published before its first prompt. Only the external owner
  // command may authorize a paused task at this pre-message boundary; actor-like
  // properties or a supplied command string are not substitutes for the grant.
  const cleanRetire=input.kind==='resume'&&old?.failed==='Native Agent disposed while idle';
  const resumeGrant=input.kind==='resume'&&old?.failed&&!cleanRetire?consumeResumeAuthorization({stateRoot:root,workspace,sessionId,expectedTaskId:old.taskId,expectedEnvelopeSha256:envelope.sha256}):null;
  const externalMessage=input.kind==='resume'&&old?.failed&&!cleanRetire?resumeGrant?.command:input.userMessage;
  const resumed=input.kind==='resume'||(input.kind==='auto'&&!!old&&!old.complete&&!explicitNew);
  if(resumed&&!old)throw Error('No trusted task envelope to restore; refusing actor history as authorization');
  let message=resumed?old.userMessage:externalMessage;
  if(typeof message!=='string'||!message.trim())throw Error('Actual external human task required');
  if(old?.failed&&!cleanRetire&&!/^\/workflow (?:resume|new)(?:\s|$)/.test(externalMessage??''))throw Error('Paused/failed task requires explicit external /workflow resume or /workflow new');
  if(/^\/workflow resume(?:\s|$)/.test(message)){if(!old)throw Error('No task to resume');message=old.userMessage;}
  message=message.replace(/^\/workflow new\s+/,'');
  const taskId='conversation-'+randomBytes(12).toString('hex'),taskRoot=privateDirectory(join(tasks,taskId));
  // Restarts retain human scope and conservatively redo current facts. They do
  // not deserialize model claims, old nonces or stale installed-source proofs.
  const restoration=resumed?{strategy:'reverify-current-facts',previousTask:old.taskId,previousStage:old.stage}:null;
  const privateRoots=[root,resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dirname(process.execPath),...(options.privateRoots??[])].map(p=>existsSync(p)?realpathSync.native(p):resolve(p));
  const nativeBinding={executor:input.nativeExecutor,onCard:input.onCard};
  const nativeExecutor=input.nativeExecutor?Object.freeze({get catalog(){return nativeBinding.executor.catalog;},execute:(...args)=>nativeBinding.executor.execute(...args)}):null;
  const io=nativeExecutor?createNativeWorkspaceIO({workspace,privateRoots,hardPrivateRoots,worktreeLease,nativeExecutor}):options.workspaceIOFactory?.({...input,worktreeLease});
  // Existing owner worktree authorizations describe one project, not separate
  // chat silos. Attach only roots sharing that verified common Git directory.
  const ownerWorktrees=options.worktreeAuthorizations??[],equal=(a,b)=>projectPathKey(resolve(a))===projectPathKey(resolve(b))||(existsSync(a)&&existsSync(b)&&projectPathKey(realpathSync(a))===projectPathKey(realpathSync(b))),group=row=>projectPathKey(resolve(row.expectedCommonGitDir));
  const groups=new Set(ownerWorktrees.filter(row=>equal(row.workspace,workspace)||equal(dirname(row.expectedCommonGitDir),workspace)).map(group));
  const additionalWorkspaces=[],attached=new Set([projectPathKey(workspace)]);
  const attach=(target,lease)=>{
   target=realpathSync(target);if(attached.has(projectPathKey(target)))return;attached.add(projectPathKey(target));
   const id='related-'+sha(Buffer.from(projectPathKey(target))).slice(0,12);
   const workspaceIO=nativeExecutor?createNativeWorkspaceIO({workspace:target,privateRoots,hardPrivateRoots,worktreeLease:lease,nativeExecutor}):options.workspaceIOFactory?.({...input,workspace:target,worktreeLease:lease});
   additionalWorkspaces.push({id,workspace:target,worktreeLease:lease,workspaceIO});
  };
  for(const row of ownerWorktrees){if(!groups.has(group(row)))continue;const lease=worktreeAuthority.leaseForWorkspace(row.workspace);if(!lease)throw Error('Related project worktree requires current owner verification');attach(dirname(row.expectedCommonGitDir),null);attach(row.workspace,lease);}
  const projectAccess=createProjectWorkspaces({workspaceBinding:bindWorkspaceRoot(workspace),policy:pathPolicy,workspaceIO:io,additionalWorkspaces,privateRoots,hardPrivateRoots});
  const resolveProjectInput=path=>{
   const scope=projectAccess.select(path);scope.binding.assertCurrent();scope.policy.assertCurrent();const absolute=resolve(scope.root,scope.path),actual=realpathSync(absolute),stat=lstatSync(absolute);
   if(!inside(scope.root,actual)||scope.policy.deniesPrivate(actual)||stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1)throw Error('Related project input identity or private boundary rejected');
   return {absolutePath:actual,assertCurrent:()=>{scope.binding.assertCurrent();scope.policy.assertCurrent();if(realpathSync(absolute)!==actual)throw Error('Related project input redirected');}};
  };
  const sandbox=typeof io?.invoke==='function'?createSandboxProvider({stateRoot:join(root,'sandbox'),privateRoots,hardPrivateRoots,worktreeLease,invoke:io.invoke,resolveInput:resolveProjectInput,readInput:({path})=>{const scope=projectAccess.select(path);if(!scope.io)throw Error('Original native reader unavailable for project directory');return scope.io.read(scope.path);}}):undefined;
  const sources=createSourceProvider({cacheRoot:acquisition,installedRoots:[...options.installedRoots,managed],external:options.external!==false,...(options.sourceProviderOptions??{})});
  let host,activeMessage=message,readonlyReply=resumed?old?.readonlyReplyIntent===true:readonlyDiagnostic(message),readonlyBoundary=0;
  const retainedPlan=resumed?old?.continuationPlan:null;
  const persist=()=>store(envelopePath,{version:2,sessionId,workspace,taskId,userMessage:activeMessage,readonlyReplyIntent:readonlyReply,continuationPlan:host?.continuationPlan??null,reusableDiscovery:host?.exportReusableDiscovery()??null,stage:host?.stage??'discovery',complete:host?.complete??false,failed:host?.exportAudit().failed??null,updatedAt:new Date().toISOString()});
  host=await createWorkflowHost({workspace,stateRoot:taskRoot,taskId,userMessage:message,sourceProvider:sources,workspaceIO:io,sandboxProvider:sandbox,
   protectedPrivateSubroots:true,privateRoots,hardPrivateRoots,worktreeLease,additionalWorkspaces,installedRoot:managed,
   retainedOptions:retainedPlan?.options??[],
   contract:{requirements:['artifact-readable','original-user-task'],constraints:['Preserve actual external scope; never certify original task semantics with a structural check.'],stopAfter:'learning',protectedInputs:[],writeAllowlist:retainedPlan?.writeAllowlist??[],selection:retainedPlan?.selection??{mode:'pending'},feedback:{mode:'required'},learning:{required:false},conversationMode:true,
    validators:[{id:'artifact-current',type:'current-text',covers:['artifact-readable']}]},
   onCard:async card=>{persist();if(nativeBinding.onCard)await nativeBinding.onCard(card);if(options.onCard)await options.onCard({...card,sessionId,taskId});}
  });
  if(resumed&&(!old?.failed||cleanRetire||(['Native Agent disposed','External user paused the task'].includes(old.failed)&&resumeGrant?.authorized))&&old?.reusableDiscovery&&await host.restoreReusableDiscovery(old.reusableDiscovery))restoration.strategy='authenticated-discovery-current-bytes';
  const controller={
   get toolSchemas(){return toolSchemas;},get stage(){return host.stage;},get complete(){return host.complete;},get ready(){return host.ready;},
   get blockedReason(){return host.exportAudit().failed;},
   get readOnlyReplyAllowed(){const audit=host.exportAudit(),events=audit.events.slice(readonlyBoundary);return readonlyReply&&host.ready&&host.stage==='discovery'&&!audit.failed&&events.some(e=>e.event==='observed'&&e.kind==='skill_search')&&events.some(e=>e.event==='workspace_input_delivered')&&!events.some(e=>e.event==='observed'&&e.kind==='application');},
   get instructions(){return host.instructions+'\nConversation entry: one overall human task spans messages, questions, choice and detail feedback. '+(host.stage==='selection'?(host.selectionPublished?'The supported options are already published; explain or compare those existing options when asked, and wait for actual external choice without generating another menu. ':'Present 3–5 supported options with exact artifacts paths only while a main direction is genuinely unselected; use actual external choice. '):host.continuationPlan?'The main option is already selected; do not ask the same choice again. ':'Continue the current stage; do not present selection options before discovery is complete. ')+'Only selected paths may be written. Ordinary questions/status do not restart research. Current-draft detail feedback retains current source/method and selection evidence while requiring revised-byte validation and actual feedback. Structural validation never verifies the original task. Present the current draft and wait for actual /workflow accept.'+(restoration?(restoration.strategy==='authenticated-discovery-current-bytes'?'\nCold restore: the host rechecked the authenticated prior research against current source bytes; continue the chosen approach.':'\nCold-restored session: re-verify current source facts once; prior raw read confirmations are not restored. An authenticated earlier human plan choice, if present above, is retained rather than asked again.'):'');},
   compactionReady:()=>host.compactionReady(),
   assertReady:()=>host.assertReady(),
   async dispatch(name,args,metadata){try{return await host.dispatch(name,args,metadata);}finally{persist();}},
   async acceptUserMessage(text){try{if(!isWorkflowProgressQuery(text)&&!isConversationQuestion(text)){readonlyReply=readonlyDiagnostic(text);readonlyBoundary=host.exportAudit().events.length;}const value=await host.acceptUserMessage(text);if(!host.exportAudit().failed)activeMessage=host.taskInstruction;return value;}finally{persist();}},
   abort(reason){host.abort(reason);persist();},exportAudit:()=>({...host.exportAudit(),sessionId,restoration})
  };
  owned.add(controller);origins.set(controller,{workspace,sessionId,pathPolicy,nativeBinding});persist();
  if(resumed&&typeof externalMessage==='string'&&externalMessage.trim()&&!/^\/workflow resume(?:\s|$)/.test(externalMessage))await controller.acceptUserMessage(externalMessage);
  return controller;
 };
}

let configured;
export async function controllerFactory(input){
 if(!configured){const path=process.env.AGENT_WORKFLOW_HOST_CONFIG;if(!path||!isAbsolute(path)||lstatSync(path).isSymbolicLink())throw Error('Trusted AGENT_WORKFLOW_HOST_CONFIG must identify a regular absolute config file');configured=createConversationFactory(JSON.parse(readFileSync(path,'utf8')));}
 return configured(input);
}
