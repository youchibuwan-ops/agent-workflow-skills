const allowed=new Set(['initialize','initialized','thread/start','turn/start','turn/interrupt','thread/read','thread/list','thread/loaded/list','model/list','app/installed','mcpServerStatus/list','account/read','account/rateLimits/read','config/read']);
export const allowedClientMethod=method=>allowed.has(method);
const instruction='All work must use the workflow dynamic tools. Native execution environments and tools are disabled. Do not declare delivery complete before workflow_state reports complete. Ordinary tool refusals may be corrected; selection/feedback can await human input.';
export function sanitizeThread(p,cwd,schemas){
 return {cwd,ephemeral:false,environments:[],approvalPolicy:'never',sandbox:'read-only',dynamicTools:structuredClone(schemas),developerInstructions:instruction,...(p.model?{model:p.model}:{})};
}
export function sanitizeTurn(p,cwd,instructions){
 if(!Array.isArray(p.input)||!p.input.length||p.input.some(x=>x.type!=='text'||typeof x.text!=='string'||!x.text.trim()))throw new Error('Only nonempty genuine user text input supported');
 return {threadId:p.threadId,cwd,environments:[],approvalPolicy:'never',effort:'low',input:p.input.map(({text})=>({type:'text',text})),additionalContext:{workflow_host:{kind:'application',value:instructions||instruction}}};
}
export function finalState(c){return {stage:c?.stage??'uninitialized',complete:c?.complete===true,status:c?.complete===true?'complete':['selection','feedback'].includes(c?.stage)?'needs_input':c?.stage==='discovery'&&!c?.blockedReason&&c?.readOnlyReplyAllowed===true?'pending':'blocked',blockedReason:c?.blockedReason??null};}
