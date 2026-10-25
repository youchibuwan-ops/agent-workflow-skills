// Trusted observer/budget only. It neither returns tools nor chooses/accepts.
import {appendFileSync,existsSync,statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
export const name='workflow-real-model-monitor';
export const inject=['workflowBrokerReady','llm','agents','loader'];
export function apply(ctx,config){
  if(!isAbsolute(config.logFile??'')||!Number.isSafeInteger(config.maxRequests)||config.maxRequests<1||config.maxRequests>128||!Number.isSafeInteger(config.maxTokens)||config.maxTokens<1||config.maxTokens>100000)throw Error('Bounded private model monitor configuration required');
  const maxCumulativeInputBytes=config.maxCumulativeInputBytes??96*1024*1024,maxRequestInputBytes=config.maxRequestInputBytes??2*1024*1024;
  if(!Number.isSafeInteger(maxCumulativeInputBytes)||maxCumulativeInputBytes<1||maxCumulativeInputBytes>96*1024*1024||!Number.isSafeInteger(maxRequestInputBytes)||maxRequestInputBytes<1||maxRequestInputBytes>2*1024*1024)throw Error('Bounded explicit JSON byte limits required');
  let requests=0,inputBytes=0;const cumulativeUsage={inputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:0,totalTokens:0};
  const record=entry=>{if(existsSync(config.logFile)&&statSync(config.logFile).size>512*1024*1024)throw Error('Private model evidence exceeds limit');appendFileSync(config.logFile,JSON.stringify({time:new Date().toISOString(),...entry})+'\n');};
  ctx.on('llm/stream',(options,next)=>(async function*(){
    const agent=ctx.agents.currentInitiator();if(!agent)throw Error('Real model probe requires an actual bound native Agent');
    requests++;const requestInputJsonBytes=Buffer.byteLength(JSON.stringify(options.messages));inputBytes+=requestInputJsonBytes;
    const toolNames=(options.tools??[]).map(tool=>tool.name),expected=[...(config.expectedToolNames??[])].sort();
    const llm=[...ctx.root.get('loader').entries()].filter(entry=>entry.options.id==='llm');const nativeIdentity=llm.length===1&&llm[0].moduleNamespace?.isAgentLoopRequest(options)===true;
    const valid=nativeIdentity&&options.provider==='deepseek-official'&&options.model==='deepseek-flash'&&Object.hasOwn(options,'maxTokens')&&Number.isSafeInteger(options.maxTokens)&&options.maxTokens>0&&options.maxTokens<=config.maxTokens&&toolNames.length===15&&expected.length===15&&JSON.stringify([...toolNames].sort())===JSON.stringify(expected);
    const budget={unit:'UTF-8 JSON bytes; not provider tokens',requestInputJsonBytes,cumulativeInputJsonBytes:inputBytes,maxRequestInputBytes,maxCumulativeInputBytes,requests,maxRequests:config.maxRequests,maxTokens:config.maxTokens};
    record({event:'request_observed',request:requests,sessionId:String(agent.id),nativeIdentity,provider:options.provider,model:options.model,maxTokensPresent:Object.hasOwn(options,'maxTokens'),maxTokens:options.maxTokens??null,toolNames,valid,budget});
    const reasons=[...(!valid?['native-request-identity-route-tokens-tools']:[]),...(requests>config.maxRequests?['request-count']:[]),...(requestInputJsonBytes>maxRequestInputBytes?['request-input-json-bytes']:[]),...(inputBytes>maxCumulativeInputBytes?['cumulative-input-json-bytes']:[])];
    if(reasons.length){const reason='Owner real-model budget refused: '+reasons.join(', ');record({event:'budget_refused',request:requests,sessionId:String(agent.id),reasons,budget});agent.cancel({kind:'hook',reason});throw Error(reason);}
    if(config.dryRun===true){record({event:'dry_run_stop',nextCalls:0,providerCalls:0});agent.cancel({kind:'hook',reason:'Free dry-run observed the first actual request; provider was not called'});throw Error('Free dry-run stop before next/provider');}
    record({event:'model_request',request:requests,sessionId:String(agent.id),provider:options.provider,model:options.model,maxTokens:options.maxTokens,toolNames,messages:options.messages});
    let usage;try{for await(const chunk of next()){if(chunk.type==='usage')usage=chunk.usage;record({event:'model_chunk',request:requests,sessionId:String(agent.id),chunk});yield chunk;}}
    finally{if(usage){const actual={};for(const key of Object.keys(cumulativeUsage)){actual[key]=Number.isFinite(usage[key])&&usage[key]>=0?usage[key]:0;cumulativeUsage[key]+=actual[key];}record({event:'provider_usage',request:requests,sessionId:String(agent.id),usage:actual,inputContextTokens:actual.inputTokens+actual.cacheReadTokens+actual.cacheWriteTokens,cumulative:{...cumulativeUsage},basis:'Official adapter-reported usage; no price or JSON-byte token estimate'});}}
  })());
  ctx.on('workflow/card',({agent,card})=>record({event:'host_card',sessionId:String(agent.id),card}));
  ctx.on('workflow/status',({agent,status})=>record({event:'host_status',sessionId:String(agent.id),status,audit:ctx.get('workflowBrokerReady').exportAudit(agent)}));
}
