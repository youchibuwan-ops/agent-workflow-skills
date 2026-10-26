import {compactToolResult} from '../core/tool-result-view.mjs';

// This is deliberately a pure planner, NOT an agent/request hook. DSH rc.2 only
// permits logged model-visible channels and marks exact frozen native requests.
// A host must establish delivery eligibility from trusted native lifecycle facts;
// model messages, summaries and receipt strings cannot confer that authority.

function stringEnd(text, start) {
  let index=start+1;
  while(index<text.length) {
    if(text[index]==='\\')index+=2;
    else if(text[index++]==='"')return index;
  }
  return text.length;
}

// JSON.parse validates first. This scanner locates top-level member value spans
// without reserializing data (including escape spelling, whitespace and Unicode).
function stateSpan(text) {
  let index=0,span;
  const whitespace=()=>{while(/\s/.test(text[index]??'')&&index<text.length)index++;};
  whitespace();
  if(text[index++]!=='{')return;
  while(index<text.length) {
    whitespace();
    if(text[index]==='}')return span;
    const keyStart=index;
    if(text[index]!== '"')return;
    index=stringEnd(text,index);
    const key=JSON.parse(text.slice(keyStart,index));
    whitespace();
    if(text[index++]!==':')return;
    whitespace();
    const start=index;
    let depth=0;
    while(index<text.length) {
      const char=text[index];
      if(char==='"'){index=stringEnd(text,index);continue;}
      if(depth===0&&(char===','||char==='}'))break;
      if(char==='{'||char==='[')depth++;
      if(char==='}'||char===']')depth--;
      index++;
    }
    let end=index;
    while(end>start&&/\s/.test(text[end-1]))end--;
    if(key==='state') {
      if(span)return; // Duplicate state is ambiguous; fail closed.
      span={start,end};
    }
    if(text[index]===','){index++;continue;}
    if(text[index]==='}')return span;
    return;
  }
}

function projectedText(text) {
  let result;
  try {result=JSON.parse(text);} catch {return text;}
  if(typeof result?.ok!=='boolean')return text;
  const compact=compactToolResult(result);
  if(compact===result)return text;
  const span=stateSpan(text);
  if(!span)return text;
  const replacement=JSON.stringify(compact.state);
  // Avoid making an already small historical result larger.
  if(Buffer.byteLength(replacement)>=Buffer.byteLength(text.slice(span.start,span.end)))return text;
  return text.slice(0,span.start)+replacement+text.slice(span.end);
}

/**
 * Plan compact views of OLD, already delivered tool messages. No eligible IDs
 * means no changes; protected IDs always win. All source/data fragments, rich
 * blocks, errors and pairing identities survive; inputs and history are untouched.
 * The returned array is not a native AgentLoop request and must not be substituted
 * for its frozen request. Official supported integration requires a logged surface
 * replacement (durable append), or a future upstream request projection seam.
 */
export function projectToolResultStates(messages,{eligibleCallIds=[],protectedCallIds=[]}={}) {
  const eligible=new Set(eligibleCallIds),protectedIds=new Set(protectedCallIds);
  if(eligible.size===0)return messages;
  let changed=false;
  const projected=messages.map(message=>{
    const callId=message.source?.callId;
    if(message.role!=='tool'||message.source?.kind!=='tool'||typeof callId!=='string'
      ||message.toolCallId!==callId||!eligible.has(callId)||protectedIds.has(callId)||!Array.isArray(message.content))return message;
    let contentChanged=false;
    const content=message.content.map(block=>{
      if(block.type!=='text'||typeof block.text!=='string')return block;
      const text=projectedText(block.text);
      if(text===block.text)return block;
      contentChanged=true;
      return {...block,text};
    });
    if(!contentChanged)return message;
    changed=true;
    return {...message,content};
  });
  return changed?projected:messages;
}

/**
 * Apply that plan through DSH's official append-only surface replacement seam.
 * Original records remain in the log; only the derived model surface changes.
 * Invoke at a trusted idle/pre-step boundary, never from a Session observer.
 * Eligibility must be host-owned proof of prior model delivery, and pending or
 * unconfirmed call IDs must be supplied in protectedCallIds. This function never
 * infers delivery from receipt text or from a model-authored summary.
 *
 * freezeMessage and estimateMessage are the installed native implementations,
 * injected by the host to avoid importing an unverified alternate DSH runtime.
 * As with the native pruner, a later append failure leaves earlier successful
 * append-only replacements durable and propagates to the host's fail-closed path.
 */
export function compactSessionToolResultStates(session,{
  eligibleCallIds=[],protectedCallIds=[],freezeMessage,estimateMessage,
}={}) {
  if(typeof freezeMessage!=='function'||typeof estimateMessage!=='function')
    throw new TypeError('Verified native freezeMessage and token meter estimateMessage are required');
  const eligible=new Set(eligibleCallIds),protectedIds=new Set(protectedCallIds);
  const replaced=[];
  let bytesRemoved=0;
  for(const seq of [...session.surface.nodes]) {
    const event=session.eventAt(seq);
    if(event?.type!=='tool/result')continue;
    const original=session.deriveEventMessage(event);
    const [projected]=projectToolResultStates([original],{eligibleCallIds:eligible,protectedCallIds:protectedIds});
    if(projected===original)continue;
    const shadowedTokenCount=estimateMessage(original);
    if(!Number.isFinite(shadowedTokenCount)||shadowedTokenCount<0)
      throw new TypeError('Native token meter returned an invalid shadow price');
    const message=freezeMessage(projected);
    const size=value=>value.content.reduce((sum,block)=>sum+(block.type==='text'?Buffer.byteLength(block.text):0),0);
    const bytesBefore=size(original),bytesAfter=size(message);
    session.append('compaction/prune',{
      shadowedRange:{start:seq,end:seq},shadowedSeqs:[seq],shadowedTokenCount,
    });
    const replacement=session.append('tool/result',{...event.data,message},{
      surfaceOp:{op:'replace',startSeq:seq,endSeq:seq},sourceEventSeqs:[seq],
    });
    replaced.push({originalSeq:seq,replacementSeq:replacement.seq,callId:original.source.callId,bytesBefore,bytesAfter});
    bytesRemoved+=bytesBefore-bytesAfter;
  }
  return {replaced,bytesRemoved};
}
