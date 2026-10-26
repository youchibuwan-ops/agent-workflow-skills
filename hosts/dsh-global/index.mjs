import {isAbsolute,resolve} from 'node:path';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {installSessionBroker} from './broker.mjs';
export const name='workflow-session-broker';
export async function apply(ctx,config={}) {
  if(typeof config.factoryModule!=='string'||!isAbsolute(config.factoryModule))throw new Error('A trusted absolute controllerFactory module is required');
  if(config.eventFile!==undefined&&!isAbsolute(config.eventFile))throw new Error('The host event sink must be an absolute private file');
  // Use the exact namespaces imported by the native Loader. Importing a
  // second physical/relocated copy creates a different request WeakSet.
  const nativeExport=(id,key)=>{
    const entries=[...ctx.root.get('loader').entries()].filter(entry=>entry.options.id===id);
    const fn=entries.length===1?entries[0].moduleNamespace?.[key]:undefined;
    if(typeof fn!=='function')throw new Error(`Native ${id}.${key} identity is unavailable`);return fn;
  };
  const isAgentLoopRequest=request=>nativeExport('llm','isAgentLoopRequest')(request);
  const freezeMessage=message=>nativeExport('llm','freezeMessage')(message);
  const appendPluginRecord=(...args)=>nativeExport('session','appendPluginRecord')(...args);
  const module=await import(pathToFileURL(resolve(config.factoryModule)).href);
  const stamp=Object.freeze({owner:name});
  const record=(session,type,data)=>{appendPluginRecord(session,type,data);if(config.eventFile)appendFileSync(config.eventFile,JSON.stringify({type,sessionId:String(session.id),data})+'\n');};
  const broker=installSessionBroker(ctx.root,{controllerFactory:module.controllerFactory,toolSchemas:module.toolSchemas,isAgentLoopRequest,freezeMessage,appendStatusRecord:(session,status)=>record(session,'plugin:workflow/status',status),appendCardRecord:(session,card)=>record(session,'plugin:workflow/card',card),
    isInstalled:()=>ctx.root.get('workflowBrokerInstalled')===stamp});
  ctx.provide('workflowBrokerInstalled',stamp);
  ctx.root.inject(['tools','llm','agents','systemPrompt'],host=>{
    broker.attachServices();
    host.provide('workflowBrokerReady',broker);
  });
}
