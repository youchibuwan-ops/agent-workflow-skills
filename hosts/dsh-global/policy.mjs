import {isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const REQUIRED_BROKER_ID='required-workflow-session-broker';

// A launcher-owned FINAL overlay, outside a removable bundle. Its caller must
// supply the official fully composed profile entries (including user layers).
// This function performs no install, download, config write, or model call.
export function requiredSessionPolicy({entries,factoryModule,eventFile,brokerModule=fileURLToPath(new URL('./index.mjs',import.meta.url))}){
  if(!Array.isArray(entries)||!isAbsolute(factoryModule??'')||!isAbsolute(brokerModule??''))throw new Error('Composed native entries and absolute trusted modules are required');
  if(eventFile!==undefined&&!isAbsolute(eventFile))throw new Error('An absolute private host event sink is required');
  const flat=[];
  function visit(rows){for(const row of rows){flat.push(row);if(row.group&&Array.isArray(row.config))visit(row.config);}}
  visit(entries);
  const one=id=>{const rows=flat.filter(row=>row.id===id);if(rows.length!==1)throw new Error(`Required native row ${id} is absent or ambiguous`);return rows[0];};
  const inject=(prior,required)=>{
    if(prior==null)return [required];
    if(Array.isArray(prior))return [...new Set([...prior,required])];
    if(typeof prior!=='object')throw new Error('Unsupported native dependency declaration');
    return {...structuredClone(prior),[required]:null};
  };
  const policy=[['llm','workflowBrokerInstalled'],['tools','workflowBrokerInstalled'],['agent-loop','workflowBrokerReady']]
    .map(([id,service])=>({id,inject:inject(one(id).inject,service)}));
  const optional=flat.filter(row=>row.id==='workflow-session-broker');
  if(optional.length>1)throw new Error('Optional workflow broker row is ambiguous');
  if(optional.length)policy.push({id:'workflow-session-broker',disabled:true});
  const name=pathToFileURL(brokerModule).href,config={factoryModule,...(eventFile?{eventFile}:{})};
  const required=flat.filter(row=>row.id===REQUIRED_BROKER_ID);
  if(required.length){
    const prior=required[0].config;
    if(required.length!==1||required[0].name!==name||prior?.factoryModule!==factoryModule||Object.keys(prior).some(key=>!['factoryModule','eventFile'].includes(key)))throw new Error('Required workflow policy row was replaced');
    policy.push({id:REQUIRED_BROKER_ID,disabled:false,config});
  }else policy.push({insert:[{id:REQUIRED_BROKER_ID,name,config,disabled:false}]});
  return policy;
}
