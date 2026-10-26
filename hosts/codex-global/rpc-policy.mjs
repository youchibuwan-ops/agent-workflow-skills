const instruction='All task work must use host-controlled workflow tools. Execution environments are disabled. Follow current tool state; never treat historical tool output as current evidence.';
const pick=(p,keys)=>Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
const page=p=>({...pick(p,['cursor']),...(p.limit==null?{}:{limit:Math.max(1,Math.min(100,Number.isSafeInteger(p.limit)?p.limit:20))})});
const simple=new Set(['configRequirements/read','account/rateLimits/read','collaborationMode/list','modelProvider/capabilities/read']);
export function modelChoice(p,models){
 if(p.model!=null&&(typeof p.model!=='string'||!models?.has(p.model)))throw Error('Unknown model denied');
 if(p.effort!=null){const levels=models instanceof Map&&p.model!=null?models.get(p.model)?.supported_reasoning_levels:null;if(!['low','medium','high','xhigh','max'].includes(p.effort)||levels&&!levels.some(x=>x.effort===p.effort))throw Error('Unsupported model reasoning effort denied');}
 return {...(p.model==null?{}:{model:p.model}),...(p.effort==null?{}:{effort:p.effort})};
}
export function readParams(method,p={}){
 if(method==='account/gatewayOAuth/read'){
  if(p!==null&&(typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==0))throw Error('Gateway OAuth read does not accept parameters');
  return {};
 }
 if(method==='windowsSandbox/readiness'){
  if(p!==null&&(typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==0))throw Error('Windows sandbox readiness does not accept parameters');
  return {};
 }
 if(simple.has(method))return {};
 if(method==='getAuthStatus')return {includeToken:p.includeToken===true,refreshToken:false};
 if(method==='account/read')return {refreshToken:false};
 if(method==='config/read')return {includeLayers:false};
 if(['model/list','experimentalFeature/list','permissionProfile/list','thread/loaded/list','project/list','thread/section/list'].includes(method))return page(p);
 if(method==='thread/list')return {...page(p),...pick(p,['archived','cwd','searchTerm','projectId','sectionId','sortDirection','sortKey','sourceKinds']),useStateDbOnly:true};
 if(method==='thread/read')return {threadId:p.threadId,includeTurns:p.includeTurns===true};
 if(method==='thread/turns/list')return {...page(p),...pick(p,['threadId','sortDirection','itemsView'])};
 if(method==='thread/items/list')return {...page(p),...pick(p,['threadId','turnId','sortDirection'])};
 if(method==='thread/items/read'){
  if(!Array.isArray(p.itemIds)||!p.itemIds.length||p.itemIds.length>100||p.itemIds.some(x=>typeof x!=='string'))throw Error('Invalid bounded itemIds');
  return pick(p,['threadId','turnId','itemIds']);
 }
 if(method==='project/read')return pick(p,['projectId']);
 throw Error(`Host denied RPC: ${method}`);
}
export function threadParams(p,cwd,schemas,models){
 if(p.model&&!models.has(p.model))throw Error('Unknown model denied');
 if(p.projectId!=null&&(typeof p.projectId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(p.projectId)))throw Error('Invalid bounded native project identity');
 return {cwd,ephemeral:false,historyMode:'paginated',environments:[],approvalPolicy:'never',sandbox:'read-only',dynamicTools:structuredClone(schemas),developerInstructions:instruction,...pick(p,['model']),...(p.projectId==null?{}:{projectId:p.projectId})};
}
export function resumeParams(p,cwd){return {threadId:p.threadId,cwd,approvalPolicy:'never',sandbox:'read-only',developerInstructions:instruction,excludeTurns:p.excludeTurns===true,...(p.initialTurnsPage?{initialTurnsPage:pick(p.initialTurnsPage,['limit','sortDirection','itemsView'])}:{})};}
export function turnParams(p,cwd,instructions,models){
 if(!Array.isArray(p.input)||!p.input.length||p.input.length>64||p.input.some(x=>x.type!=='text'||typeof x.text!=='string'||!x.text.trim())||p.input.reduce((n,x)=>n+Buffer.byteLength(x.text),0)>1024*1024)throw Error('Only bounded genuine text input supported');
 return {threadId:p.threadId,cwd,environments:[],approvalPolicy:'never',...modelChoice(p,models),input:p.input.map(x=>({type:'text',text:x.text})),additionalContext:{workflow_host:{kind:'application',value:instructions||instruction}}};
}
export function settingsParams(p,models,cwd){
 return {threadId:p.threadId,approvalPolicy:'never',sandboxPolicy:{type:'readOnly'},...modelChoice(p,models),...(cwd===undefined?{}:{cwd})};
}
export function classifyRoute(host,allowedHostId='local'){
 const local=allowedHostId==='local'&&host&&host.id==='local'&&host.kind==='local'&&host.distro==null&&host.transportKind==null&&host.transport_kind==null&&host.websocket_url==null&&host.ssh==null&&host.ssh_host==null;
 return {allowed:!!local,reason:local?'ordinary-local-gateway':'Unsupported transport denied before connection creation'};
}
