// Production conversation binding. A human request is retained verbatim; the
// actor never supplies an oracle, a completed stage or its own task authority.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkflowHost,WORKFLOW_TOOL_SCHEMAS,isWorkflowProgressQuery} from '../core/workflow-host.mjs';
import {createSourceProvider} from '../providers/source-provider.mjs';
import {createNativeWorkspaceIO} from '../providers/native-workspace-io.mjs';
import {createSandboxProvider} from '../providers/sandbox-provider.mjs';
export const toolSchemas=WORKFLOW_TOOL_SCHEMAS;
const sha=x=>createHash('sha256').update(x).digest('hex');
const inside=(root,p)=>{const r=relative(root,p);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
function privateDirectory(path){mkdirSync(path,{recursive:true});if(lstatSync(path).isSymbolicLink())throw Error('Private controller directory must not be redirected');return realpathSync.native(path);}

export function createConversationFactory(options={}){
 if(typeof options.stateRoot!=='string'||!Array.isArray(options.installedRoots))throw Error('Trusted conversation stateRoot and installedRoots required');
 const root=privateDirectory(options.stateRoot),sessions=privateDirectory(join(root,'sessions')),tasks=privateDirectory(join(root,'tasks'));
 const managed=privateDirectory(join(root,'managed-skills')),acquisition=privateDirectory(join(root,'acquisition'));
 const keyPath=join(root,'envelope.key');if(!existsSync(keyPath))try{writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(lstatSync(keyPath).isSymbolicLink())throw Error('Private envelope key redirected');const key=readFileSync(keyPath);if(key.length!==32)throw Error('Invalid private envelope key');
 const owned=new WeakSet(),origins=new WeakMap();
 const signature=body=>createHmac('sha256',key).update(JSON.stringify(body)).digest('hex');
 function load(path){if(!existsSync(path))return null;if(lstatSync(path).isSymbolicLink())throw Error('Session envelope redirected');const stored=JSON.parse(readFileSync(path,'utf8')),expected=signature(stored.body);if(typeof stored.signature!=='string'||stored.signature.length!==expected.length||!timingSafeEqual(Buffer.from(stored.signature),Buffer.from(expected)))throw Error('Session envelope integrity signature mismatch');return stored.body;}
 function store(path,body){const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';writeFileSync(temp,JSON.stringify({body,signature:signature(body)}),{mode:0o600});renameSync(temp,path);}
 return async function conversationFactory(input){
  const workspace=realpathSync(input.workspace),sessionId=String(input.sessionId??input.threadId??'');if(!sessionId)throw Error('Real native session/thread identity required');
  const sessionKey=sha(Buffer.from(sessionId)),envelopePath=join(sessions,sessionKey+'.json');
  const previous=input.previousController;
  if(previous&&!owned.has(previous))throw Error('Previous controller belongs to another factory authority');
  if(previous){const origin=origins.get(previous);if(origin.workspace!==workspace||origin.sessionId!==sessionId)throw Error('Cross-session controller reuse denied');}
  const explicitNew=typeof input.userMessage==='string'&&/^\/workflow new\s+/.test(input.userMessage);
  if(previous&&input.kind!=='resume'&&isWorkflowProgressQuery(input.userMessage))return previous;
  if(previous&&!previous.complete&&previous.exportAudit().failed==null&&!explicitNew&&input.kind!=='resume')return previous;
  if(previous&&explicitNew)previous.abort('Actual external user explicitly opened a new task');
  const old=load(envelopePath);if(old&&(old.sessionId!==sessionId||old.workspace!==workspace))throw Error('Durable session scope mismatch');
  const resumed=input.kind==='resume'||(input.kind==='auto'&&!!old&&!old.complete&&!explicitNew);
  if(resumed&&!old)throw Error('No trusted task envelope to restore; refusing actor history as authorization');
  let message=resumed?old.userMessage:input.userMessage;
  if(typeof message!=='string'||!message.trim())throw Error('Actual external human task required');
  if(old?.failed&&!/^\/workflow (?:resume|new)(?:\s|$)/.test(input.userMessage??''))throw Error('Paused/failed task requires explicit external /workflow resume or /workflow new');
  if(/^\/workflow resume(?:\s|$)/.test(message)){if(!old)throw Error('No task to resume');message=old.userMessage;}
  message=message.replace(/^\/workflow new\s+/,'');
  const taskId='conversation-'+randomBytes(12).toString('hex'),taskRoot=privateDirectory(join(tasks,taskId));
  // Restarts retain human scope and conservatively redo current facts. They do
  // not deserialize model claims, old nonces or stale installed-source proofs.
  const restoration=resumed?{strategy:'reverify-current-facts',previousTask:old.taskId,previousStage:old.stage}:null;
  const privateRoots=[root,resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dirname(process.execPath),...(options.privateRoots??[])].map(p=>existsSync(p)?realpathSync.native(p):resolve(p));
  const io=input.nativeExecutor?createNativeWorkspaceIO({workspace,privateRoots,nativeExecutor:input.nativeExecutor}):options.workspaceIOFactory?.(input);
  const sandbox=typeof io?.invoke==='function'?createSandboxProvider({stateRoot:join(root,'sandbox'),privateRoots,invoke:io.invoke,readInput:({path})=>io.read(path)}):undefined;
  const sources=createSourceProvider({cacheRoot:acquisition,installedRoots:[...options.installedRoots,managed],external:options.external!==false,...(options.sourceProviderOptions??{})});
  let host,activeMessage=message;
  const persist=()=>store(envelopePath,{version:1,sessionId,workspace,taskId,userMessage:activeMessage,stage:host?.stage??'discovery',complete:host?.complete??false,failed:host?.exportAudit().failed??null,updatedAt:new Date().toISOString()});
  host=await createWorkflowHost({workspace,stateRoot:taskRoot,taskId,userMessage:message,sourceProvider:sources,workspaceIO:io,sandboxProvider:sandbox,
   protectedPrivateSubroots:true,privateRoots,installedRoot:managed,
   contract:{requirements:['artifact-readable','original-user-task'],constraints:['Preserve actual external scope; never certify original task semantics with a structural check.'],stopAfter:'learning',protectedInputs:[],writeAllowlist:[],selection:{mode:'pending'},feedback:{mode:'required'},learning:{required:false},conversationMode:true,
    validators:[{id:'artifact-current',type:'current-text',covers:['artifact-readable']}]},
   onCard:async card=>{persist();if(input.onCard)await input.onCard(card);if(options.onCard)await options.onCard({...card,sessionId,taskId});}
  });
  const controller={
   get toolSchemas(){return toolSchemas;},get stage(){return host.stage;},get complete(){return host.complete;},get ready(){return host.ready;},
   get instructions(){return host.instructions+'\nConversation entry: original human scope is frozen above. Present 3–5 supported options with explicit artifacts arrays listing exact edit/output paths, then wait for actual /workflow choose <id>. Only selected paths may be written. Structural validation never verifies the original task. Present the current draft and wait for actual /workflow accept. Ordinary chat may be answered, but an unfinished production task remains pending. Corrections reopen scope and invalidate earlier proofs.'+(restoration?'\nRestored session: redo discovery and verification; prior read confirmations have been invalidated.':'');},
   assertReady:()=>host.assertReady(),
   async dispatch(name,args,metadata){try{return await host.dispatch(name,args,metadata);}finally{persist();}},
   async acceptUserMessage(text){try{const before=host.exportAudit().revision,value=await host.acceptUserMessage(text);if(host.exportAudit().revision>before&&!host.exportAudit().failed)activeMessage+='\n\nActual external user correction/addition:\n'+text;return value;}finally{persist();}},
   abort(reason){host.abort(reason);persist();},exportAudit:()=>({...host.exportAudit(),sessionId,restoration})
  };
  owned.add(controller);origins.set(controller,{workspace,sessionId});persist();
  if(resumed&&typeof input.userMessage==='string'&&input.userMessage.trim()&&!/^\/workflow resume(?:\s|$)/.test(input.userMessage))await controller.acceptUserMessage(input.userMessage);
  return controller;
 };
}

let configured;
export async function controllerFactory(input){
 if(!configured){const path=process.env.AGENT_WORKFLOW_HOST_CONFIG;if(!path||!isAbsolute(path)||lstatSync(path).isSymbolicLink())throw Error('Trusted AGENT_WORKFLOW_HOST_CONFIG must identify a regular absolute config file');configured=createConversationFactory(JSON.parse(readFileSync(path,'utf8')));}
 return configured(input);
}
