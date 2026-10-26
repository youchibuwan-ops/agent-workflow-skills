import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createProbeRpcClient,sendProbeTurn,hasBasicEnglishParagraph,runPreparedRealModelProbe} from './real-model.mjs';
import * as probe from './real-model.mjs';
import {apply} from './model-monitor.mjs';
import {createWorkflowHost} from '../../core/workflow-host.mjs';
import {createConversationFactory} from '../../conversation/controller-factory.mjs';

test('probe stdio preserves Chinese and emoji split at every byte',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-probe-utf8-')),child=new EventEmitter();child.stdout=new EventEmitter();child.stdin={write(){}};child.kill=()=>{};
  const request=createProbeRpcClient(child,join(root,'wire.jsonl')),result=request('fixture',{}),text='中文分包😀完整回执';
  for(const byte of Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,result:{text}})+'\n'))child.stdout.emit('data',Buffer.from([byte]));
  assert.deepEqual(await result,{text});assert(!readFileSync(join(root,'wire.jsonl'),'utf8').includes('\ufffd'));
});

function monitorFixture({maxTokens=4096,dryRun=true,budget={},chunks=[{type:'finish',reason:{kind:'stop'}}]}={}){
  const root=mkdtempSync(join(tmpdir(),'dsh-probe-budget-')),hooks=new Map(),marked=new WeakSet(),cancelled=[];
  const options=Object.freeze({provider:'deepseek-official',model:'deepseek-flash',...(maxTokens===undefined?{}:{maxTokens}),tools:Array.from({length:15},(_,i)=>({name:'workflow_'+i})),messages:[{role:'user',content:[{type:'text',text:'实际输入'}]}],authorization:'AUTH_SENTINEL',env:{DEEPSEEK_API_KEY:'KEY_SENTINEL'}});marked.add(options);
  const agent={id:'unit-boundary-only',cancel:cause=>cancelled.push(cause)},ctx={agents:{currentInitiator:()=>agent},root:{get:()=>({entries:()=>[{options:{id:'llm'},moduleNamespace:{isAgentLoopRequest:value=>marked.has(value)}}]})},on:(event,fn)=>hooks.set(event,fn),get:()=>({exportAudit:()=>({})})};
  const logFile=join(root,'monitor.jsonl');apply(ctx,{logFile,maxRequests:64,maxTokens:4096,expectedToolNames:options.tools.map(tool=>tool.name),dryRun,...budget});
  let nextCalls=0;const run=async()=>{for await(const _ of hooks.get('llm/stream')(options,()=>{nextCalls++;return(async function*(){yield* chunks;})();})){};};
  return{options,run,cancelled,get nextCalls(){return nextCalls},records:()=>readFileSync(logFile,'utf8').trim().split('\n').map(JSON.parse)};
}
test('dry monitor observes an exact native-marked budget then cancels before next/provider',async()=>{
  const f=monitorFixture();await assert.rejects(f.run(),/dry.run/i);assert.equal(f.nextCalls,0);assert.equal(f.cancelled.length,1);const observed=f.records().find(record=>record.event==='request_observed');assert.equal(observed.valid,true);assert.equal(observed.maxTokens,4096);assert.equal(observed.nativeIdentity,true);assert.equal(observed.toolNames.length,15);
});

test('budget rejection names the exceeded JSON byte counter before calling the provider',async()=>{
  const f=monitorFixture({dryRun:false,budget:{maxCumulativeInputBytes:1}});
  await assert.rejects(f.run(),/cumulative-input-json-bytes/);assert.equal(f.nextCalls,0);
  const refusal=f.records().find(x=>x.event==='budget_refused');assert(refusal);assert.deepEqual(refusal.reasons,['cumulative-input-json-bytes']);
  assert.equal(refusal.budget.maxCumulativeInputBytes,1);assert(refusal.budget.cumulativeInputJsonBytes>1);assert.equal(refusal.budget.unit,'UTF-8 JSON bytes; not provider tokens');
});

test('provider usage keeps cache hits, cache misses and output separate from JSON bytes',async()=>{
  const f=monitorFixture({dryRun:false,chunks:[{type:'usage',usage:{inputTokens:3,cacheReadTokens:17,cacheWriteTokens:0,outputTokens:5,totalTokens:25}},{type:'finish',reason:{kind:'stop'}}]});await f.run();
  const usage=f.records().find(x=>x.event==='provider_usage');assert(usage);assert.deepEqual(usage.cumulative,{inputTokens:3,cacheReadTokens:17,cacheWriteTokens:0,outputTokens:5,totalTokens:25});assert.equal(usage.inputContextTokens,20);
});

test('single-request JSON byte refusal is distinct from a cumulative limit',async()=>{
  const f=monitorFixture({dryRun:false,budget:{maxRequestInputBytes:1}});await assert.rejects(f.run(),/request-input-json-bytes/);assert.equal(f.nextCalls,0);
  assert.deepEqual(f.records().find(x=>x.event==='budget_refused').reasons,['request-input-json-bytes']);
});

test('probe summary reports native usage and precise budget refusal without calling JSON bytes tokens',()=>{
  assert.equal(typeof probe.summarizeProbeRecords,'function','the report must expose actual provider usage and budget diagnostics');
  const actual=probe.summarizeProbeRecords([{event:'request_observed',request:1,budget:{cumulativeInputJsonBytes:91}},{event:'model_request',request:1},{event:'model_chunk',request:1,chunk:{type:'usage',usage:{inputTokens:3,cacheReadTokens:17,cacheWriteTokens:0,outputTokens:5,totalTokens:25}}},{event:'request_observed',request:2,budget:{cumulativeInputJsonBytes:190}},{event:'budget_refused',request:2,reasons:['cumulative-input-json-bytes'],budget:{cumulativeInputJsonBytes:190,maxCumulativeInputBytes:100}}]);
  assert.equal(actual.actualModelRequests,1);assert.equal(actual.observedRequests,2);assert.equal(actual.usage.inputContextTokens,20);assert.equal(actual.usage.totalTokens,25);assert.equal(actual.maximumInputContextTokens,20);assert.equal(actual.lastObservedBudget.cumulativeInputJsonBytes,190);assert.deepEqual(actual.refusals[0].reasons,['cumulative-input-json-bytes']);
});

function scriptedTransport({aborted=false,maxTokens=false}={}){
  const root=mkdtempSync(join(tmpdir(),'dsh-probe-turn-')),child=new EventEmitter();child.stdout=new EventEmitter();child.kill=()=>{};let seq=0,release;
  const emit=frame=>child.stdout.emit('data',Buffer.from(JSON.stringify({jsonrpc:'2.0',...frame})+'\n'));
  const event=(type,data)=>emit({method:'session.event',params:{sessionId:'slow-session',event:{type,seq:++seq,time:Date.now(),data}}});
  const completed=new Promise(resolve=>{release=()=>{event('turn/start',{turn:2});event('user/message',{role:'user',source:{kind:'user'},id:'actual-message',content:[{type:'text',text:'第二轮'}]});if(!aborted)event('plugin:workflow/status',{sessionId:'slow-session',turn:2,stage:'feedback',status:'pending',complete:false});event('turn/end',{turn:2,reason:aborted?{kind:'aborted',reason:{kind:'hook',reason:'fixture cumulative-input-json-bytes'}}:{kind:maxTokens?'max-tokens':'completed'}});resolve();};});
  child.stdin={write(bytes){const f=JSON.parse(bytes);if(f.method==='session/prompt'){event('plugin:workflow/status',{sessionId:'slow-session',turn:1,stage:'selection',complete:false});event('turn/end',{turn:1,reason:{kind:'completed'}});emit({id:f.id,result:{messageId:'actual-message'}});}else if(f.method==='session/wait')emit({id:f.id,result:{}});}};
  return{request:createProbeRpcClient(child,join(root,'wire.jsonl')),release,completed};
}

test('a slow new prompt never consumes the previous turn terminal or stale status',async()=>{
  const f=scriptedTransport();let finished=false;const pending=sendProbeTurn(f.request,'slow-session','第二轮',{timeoutMs:2000}).then(value=>{finished=true;return value;});
  await new Promise(resolve=>setTimeout(resolve,210));assert.equal(finished,false,'old idle and 150ms must not finish a new message');f.release();const result=await pending;assert.equal(result.messageId,'actual-message');assert.equal(result.turn,2);assert.equal(result.status.stage,'feedback');
});

test('a matching aborted native turn exposes its real hook reason instead of a stale draft verdict',async()=>{
  const f=scriptedTransport({aborted:true});const pending=sendProbeTurn(f.request,'slow-session','第二轮',{timeoutMs:2000});setTimeout(f.release,10);
  await assert.rejects(pending,error=>/fixture cumulative-input-json-bytes/.test(error.message)&&error.nativeTurn?.turn===2&&error.nativeTurn?.reason?.kind==='aborted');
});
test('native max-tokens retains the actual pending stage for same-session recovery',async()=>{
  const f=scriptedTransport({maxTokens:true}),pending=sendProbeTurn(f.request,'slow-session','第二轮',{timeoutMs:2000});setTimeout(f.release,10);const current=await pending;assert.equal(current.reason.kind,'max-tokens');assert.equal(current.status.stage,'feedback');assert.equal(current.truncated,true);assert.equal(current.status.complete,false);
});
test('the exact authorized 100000 token native request passes dry-run before provider dispatch',async()=>{
  const f=monitorFixture({maxTokens:100000,budget:{maxTokens:100000}});await assert.rejects(f.run(),/dry.run/i);assert.equal(f.nextCalls,0);assert.equal(f.records().find(x=>x.event==='request_observed').maxTokens,100000);assert.equal(f.records().find(x=>x.event==='request_observed').valid,true);
});
test('missing request maxTokens is recorded and refuses the provider',async()=>{
  const f=monitorFixture({maxTokens:null});await assert.rejects(f.run());assert.equal(f.nextCalls,0);assert.equal(f.records().find(record=>record.event==='request_observed').valid,false);
});
test('paid monitor preserves the same request and omits authorization/environment fields',async()=>{
  const f=monitorFixture({dryRun:false}),before=JSON.stringify(f.options);await f.run();assert.equal(f.nextCalls,1);assert.equal(JSON.stringify(f.options),before);const logged=JSON.stringify(f.records());assert(!logged.includes('AUTH_SENTINEL'));assert(!logged.includes('KEY_SENTINEL'));
});
test('basic bilingual fixture check rejects Chinese-only text with encoding acronyms',()=>{
  assert.equal(hasBasicEnglishParagraph('中文通知：2026年11月8日14:30，松林会议室，test@example.invalid；UTF-8 CRLF RFC。'),false);
  assert.equal(hasBasicEnglishParagraph('中文通知。\n\nWe invite participants to a technical exchange meeting at the stated location. Please register before the deadline.'),true);
});

const chineseNotice='小型技术交流会\n2026年11月8日14:30，松林会议室。\n请在11月5日前发邮件至 test@example.invalid 报名。';
const encodingNote='编码与换行：UTF-8，无 BOM，CRLF。';
const englishNotice='Small Technical Exchange\n8 Nov 2026, 14:30 — Pine Conference Room.\nRegister by 5 Nov: test@example.invalid.';
const actualR06Fields='# 小型技术交流会 / Small Technical Meetup\n\n时间 / Time：2026年11月8日 14:30 / 8 November 2026, 14:30\n地点 / Venue：松林会议室 / Pine Conference Room\n报名截止 / RSVP by：2026年11月5日 / 5 November 2026\n报名邮箱 / Registration：test@example.invalid\n';
test('actual R06 bilingual labeled fields and shared email are valid without an English sentence',()=>{
  assert.equal(Buffer.byteLength(actualR06Fields),281);const input=Buffer.from('unchanged');for(const text of [actualR06Fields,actualR06Fields.replace('# 小型技术交流会 / Small Technical Meetup','主题 / Theme：小型技术交流会 / Small Technical Meetup'),chineseNotice+'\n\nSmall Technical Meetup\nTime: 8 November 2026, 14:30\nVenue: Pine Conference Room\nRSVP by: 5 November 2026\nRegistration: test@example.invalid\n']){const value=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output:Buffer.from(text.replaceAll('\n','\r\n')),selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'Output is UTF-8 no BOM, CRLF.'});assert.deepEqual(value.missing,[],text);}
  const bad=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output:Buffer.from(actualR06Fields),selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'Actual LF differs from promised CRLF; UTF-8 no BOM.'});assert.deepEqual(bad.missing,['selected-newline-CRLF']);
  const escaped=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output:Buffer.from(actualR06Fields.replaceAll('\n','\\r\\n')),selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'UTF-8 no BOM, CRLF.'});assert(escaped.missing.includes('literal-escaped-newlines'));assert.equal(escaped.bytes.crlf,0);assert.equal(escaped.bytes.literalCRLF,6);
  for(const text of [actualR06Fields.replace('test@example.invalid',''),actualR06Fields.replace('Pine Conference Room',''),actualR06Fields.replace('5 November 2026','')])assert.equal(probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output:Buffer.from(text.replaceAll('\n','\r\n')),selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'UTF-8 no BOM, CRLF.'}).ok,false);
});
function checkDraft(text){assert.equal(typeof probe.inspectAnnouncementText,'function');return probe.inspectAnnouncementText(text);}
test('a concise complete English notice has no unrequested twelve-word paragraph minimum',()=>{
  assert.equal(hasBasicEnglishParagraph(englishNotice),true);
  assert.equal(hasBasicEnglishParagraph('Register by 5 Nov: test@example.invalid.'),true);
});
test('bilingual oracle accepts independent parallel brief, concise imperative and labeled fact table without an English heading',()=>{
  const examples=[
    chineseNotice+'\n\n'+englishNotice+'\n\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('Pine Conference Room','Songlin Meeting Room')+'\n\n'+encodingNote,
    chineseNotice+'\n\nJoin the technical exchange on 8 Nov 2026 at 14:30 in Pine Conference Room; register by 5 Nov: test@example.invalid.\n\n'+encodingNote,
    chineseNotice+'\n\nSmall Technical Exchange\nWhen: 8 Nov 2026, 14:30\nWhere: Pine Conference Room\nRegistration: by 5 Nov, test@example.invalid.\n\n'+encodingNote,
    '| 项目 | 中文 | Notice |\n|---|---|---|\n| 活动 | 小型技术交流会 | Small Technical Exchange |\n| 时间 | 2026年11月8日14:30 | 8 Nov 2026, 14:30 |\n| 地点 | 松林会议室 | Pine Conference Room |\n| 报名 | 请在11月5日前发邮件至 test@example.invalid 报名 | Register by 5 Nov: test@example.invalid. |\n\n'+encodingNote,
  ];for(const text of examples)assert.deepEqual(checkDraft(text).missing,[],text);
});
test('bilingual oracle rejects keywords, English scattered through Chinese and any missing English factual field',()=>{
  const invalid=[
    chineseNotice+'\n\nTechnical exchange, 8 Nov 2026, 14:30, Pine Conference Room, 5 Nov, test@example.invalid.\n\n'+encodingNote,
    '小型技术交流会 technical exchange，将于2026年11月8日 8 Nov 2026 的14:30在松林会议室 Pine Conference Room举办，请11月5日 5 Nov前用 test@example.invalid报名。\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('8 Nov 2026','this month')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('Pine Conference Room','the usual location')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('5 Nov','soon')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('Small Technical Exchange','Community gathering')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('14:30','in the afternoon')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice.replace('test@example.invalid','the organizer')+'\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice+'\ufffd\n'+encodingNote,
    chineseNotice+'\n\n'+englishNotice+'\nÃ©\n'+encodingNote,
  ];for(const text of invalid)assert.equal(checkDraft(text).ok,false,text);
  for(const [before,after]of [['小型技术交流会','普通聚会'],['11月8日','下周'],['14:30','下午'],['松林会议室','原定地点'],['11月5日','提前'],['test@example.invalid','联系负责人']])assert.equal(checkDraft(chineseNotice.replace(before,after)+'\n\n'+englishNotice+'\n'+encodingNote).ok,false,'English facts must not mask missing Chinese '+before);
});

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const r28BoldNotice='# 小型技术交流会 / Small Technical Exchange Meeting\r\n\r\n**主题 / Theme**：小型技术交流会 / Small technical exchange meeting\r\n\r\n**时间 / Date & Time**：2026年11月8日 14:30 / November 8, 2026, 14:30\r\n\r\n**地点 / Venue**：松林会议室 / Pine Conference Room\r\n\r\n**报名截止 / Registration Deadline**：11月5日前 / Before November 5\r\n\r\n**联系邮箱 / Contact Email**：test@example.invalid\r\n';
test('actual R28 421-byte bold bilingual labeled brief is valid with shared contact and Date & Time',()=>{
  const output=Buffer.from(r28BoldNotice),input=Buffer.from('original');assert.equal(output.length,421);assert.equal(digest(output),'9aebc90f978ae18b86107bf23877ba0ef9df03e699fa79a5400a16a0e856f608');
  const check=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'Current output uses UTF-8 without BOM and CRLF.'});assert.deepEqual(check.missing,[]);assert.equal(check.ok,true);assert.equal(check.bytes.crlf,11);assert.equal(check.bytes.lf,0);
  for(const text of [r28BoldNotice.replaceAll('**',''),r28BoldNotice.replaceAll('**','__'),r28BoldNotice.replaceAll('Date & Time','Date and Time')])assert.equal(probe.inspectAnnouncementText(text,{visibleAssistantText:'UTF-8 without BOM, CRLF.'}).ok,true,text);
});
test('bold labels do not excuse missing bilingual facts, Chinese-only content or scattered English keywords',()=>{
  for(const text of [r28BoldNotice.replace('test@example.invalid',''),r28BoldNotice.replace('November 8, 2026','the coming date'),r28BoldNotice.replace('Pine Conference Room','the usual place'),r28BoldNotice.replace('Before November 5','soon'),r28BoldNotice.replace('2026年11月8日','活动当天'),r28BoldNotice.replace('松林会议室','原定地点'),'# 小型技术交流会\r\n**时间**：2026年11月8日14:30\r\n**地点**：松林会议室\r\n**报名截止**：11月5日前\r\n**联系邮箱**：test@example.invalid\r\n',chineseNotice+'\n\nTechnical exchange, November 8, 2026, 14:30, Pine Conference Room, November 5, test@example.invalid.\n'])assert.equal(probe.inspectAnnouncementText(text,{visibleAssistantText:'UTF-8 no BOM and CRLF.'}).ok,false,text);
});
test('notice year stays 2026 across bilingual ISO and shared-year layouts without borrowing unrelated dates',()=>{
  const original=chineseNotice+'\n\n'+englishNotice+'\n'+encodingNote,monthOnly=original.replace('2026年','').replace('8 Nov 2026','8 Nov');
  const check=text=>probe.inspectAnnouncementText(text);
  for(const text of [original,original.replace('8 Nov 2026','2026-11-08'),original.replace('8 Nov 2026','November 8, 2026'),original.replace('8 Nov 2026','8 November'),original.replace('2026年',''),monthOnly.replace('小型技术交流会','2026年 小型技术交流会'),monthOnly.replace('Small Technical Exchange','2026 Small Technical Exchange'),monthOnly.replace('小型技术交流会','年份 / Year: 2026\n小型技术交流会')])assert.equal(check(text).ok,true,text);
  for(const text of [original.replaceAll('2026','2027'),original.replace('2026年','2027年'),original.replace('8 Nov 2026','8 Nov 2027'),original.replace('8 Nov 2026','2027-11-08'),original.replace('8 Nov 2026','November 8, 2027'),original.replace('11月5日','2027年11月5日'),original.replace('5 Nov:','5 Nov 2027:'),monthOnly,monthOnly+'\nReference updated on 2026-10-26.',monthOnly+'\n档案更新于2026年10月26日。'])assert.equal(check(text).ok,false,text);
});
test('native write evidence pairs exact successful call IDs and keeps refused or unmatched calls diagnostic only',()=>{
  assert.equal(typeof probe.collectWriteEvidence,'function');
  const frame=(type,seq,data,sessionId='s')=>({method:'session.event',params:{sessionId,event:{type,seq,data}}}),call=(id,seq,args,turn=2)=>frame('tool/call',seq,{turn,name:'workflow_write',callId:id,arguments:JSON.stringify(args)}),result=(id,seq,value,{turn=2,isError=false}={})=>frame('tool/result',seq,{turn,message:{role:'tool',source:{kind:'tool',callId:id},toolCallId:id,content:[{type:'text',text:JSON.stringify(value)}],isError}});
  const good={path:'announcement.md',content:'arbitrary\nlines\n',newline:'CRLF'},bad={path:'announcement.md',content:'not written',newline:'unknown'},output=Buffer.from('arbitrary\r\nlines\r\n');
  const frames=[call('old',1,{...good,content:'stale'}),result('old',2,{ok:true}),call('ok',5,good),call('bad',6,bad),result('bad',7,{ok:false,error:'Unknown mode'}),result('ok',8,{ok:true}),call('unmatched',9,{...good,content:'never confirmed'}),result('foreign',10,{ok:true}),call('future',12,{...good,content:'future'})];
  const observed=probe.collectWriteEvidence(frames,{sessionId:'s',turn:2,afterSeq:3,endSeq:11,path:'announcement.md',output});assert.equal(observed.writeEvidence.callId,'ok');assert.equal(observed.writeEvidence.resultSeq,8);assert.equal(observed.writeEvidence.matchesRawActual,false);assert.equal(observed.writeEvidence.matchesDeclaredOutput,true);assert.deepEqual(observed.writeCalls.map(x=>[x.callId,x.outcome]),[['ok','successful'],['bad','refused'],['unmatched','unconfirmed']]);
  const onlyFailed=probe.collectWriteEvidence([call('bad',5,bad),result('bad',7,{ok:false}),call('native-error',8,good),result('native-error',9,{ok:true},{isError:true})],{sessionId:'s',turn:2,afterSeq:3,endSeq:10,path:'announcement.md',output});assert.equal(onlyFailed.writeEvidence,null);assert.deepEqual(onlyFailed.writeCalls.map(x=>x.outcome),['refused','native-error']);
  const noCalls=probe.collectWriteEvidence([result('no-call',8,{ok:true})],{sessionId:'s',turn:2,afterSeq:3,endSeq:10,path:'announcement.md',output});assert.equal(noCalls.writeEvidence,null);assert.deepEqual(noCalls.writeCalls,[]);
  const otherTurn=probe.collectWriteEvidence([call('cross-turn',5,good),result('cross-turn',8,{ok:true},{turn:3})],{sessionId:'s',turn:3,afterSeq:3,endSeq:10,path:'announcement.md',output});assert.equal(otherTurn.writeEvidence,null);
});
test('explicit parenthesized or year-labeled dates cannot conflict with the shared 2026 activity year',()=>{
  const original=chineseNotice+'\n\n'+englishNotice+'\n'+encodingNote;
  for(const date of ['8 Nov (2027)','8 Nov, year 2027','November 8 (2027)','November 8, year: 2027'])assert.equal(probe.inspectAnnouncementText(original.replace('8 Nov 2026',date)).ok,false,date);
  for(const date of ['8 Nov (2026)','8 Nov, year 2026','November 8 (2026)','November 8, year: 2026'])assert.equal(probe.inspectAnnouncementText(original.replace('8 Nov 2026',date)).ok,true,date);
  for(const deadline of ['5 Nov (2027)','5 Nov, year 2027'])assert.equal(probe.inspectAnnouncementText(original.replace('5 Nov:',deadline+':')).ok,false,deadline);
});
test('write evidence independently distinguishes raw bytes from explicitly declared newline output',()=>{
  assert.equal(typeof probe.inspectWriteEvidence,'function');
  const content='\ufeffalpha\r\nbeta\rgamma\ndelta\\r\\n終😀',crlf=Buffer.from('\ufeffalpha\r\nbeta\r\ngamma\r\ndelta\\r\\n終😀');
  const changed=probe.inspectWriteEvidence({content,newline:'CRLF'},crlf);
  assert.equal(changed.newline,'CRLF');assert.equal(changed.matchesRawActual,false);assert.equal(changed.matchesDeclaredOutput,true);assert.equal(changed.arguments.bom,true);assert.equal(changed.declaredOutput.bom,true);assert.equal(changed.declaredOutput.literalCRLF,1);assert.equal(changed.declaredOutput.crlf,3);assert.equal(changed.declaredOutput.lf,0);assert.equal(changed.declaredOutput.bareCR,0);
  const lf=probe.inspectWriteEvidence({content,newline:'LF'},Buffer.from('\ufeffalpha\nbeta\ngamma\ndelta\\r\\n終😀'));assert.equal(lf.matchesRawActual,false);assert.equal(lf.matchesDeclaredOutput,true);assert.equal(lf.declaredOutput.lf,3);
  for(const args of [{content},{content,newline:'preserve'}]){const exact=probe.inspectWriteEvidence(args,Buffer.from(content));assert.equal(exact.matchesRawActual,true);assert.equal(exact.matchesDeclaredOutput,true);assert.equal(exact.newline,'preserve');const mismatch=probe.inspectWriteEvidence(args,crlf);assert.equal(mismatch.matchesRawActual,false);assert.equal(mismatch.matchesDeclaredOutput,false);}
  const already=probe.inspectWriteEvidence({content:'alpha\r\nbeta',newline:'CRLF'},Buffer.from('alpha\r\nbeta'));assert.equal(already.matchesRawActual,true);assert.equal(already.matchesDeclaredOutput,true);
  const literal=probe.inspectWriteEvidence({content:'alpha\\r\\nbeta',newline:'CRLF'},Buffer.from('alpha\\r\\nbeta'));assert.equal(literal.declaredOutput.crlf,0);assert.equal(literal.declaredOutput.literalCRLF,1);assert.equal(literal.matchesDeclaredOutput,true);
  for(const newline of ['arbitrary',null,0,undefined])assert.throws(()=>probe.inspectWriteEvidence({content,newline},crlf),/newline/);
});
test('correction attributes explicit normalization truthfully and retains default-byte mismatch evidence',async()=>{
  for(const explicit of [true,false]){
    const feedback=[],input=Buffer.from('original'),raw=chineseNotice+'\n\n'+englishNotice+'\n',output=Buffer.from(raw.replaceAll('\n','\r\n'));
    await assert.rejects(probe.runDraftFeedback({current:{sessionId:'normalized',turn:1,status:{stage:'feedback',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>[],send:async()=>{throw Error('fixture captured correction');},inspect:()=>({...probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'}}),writeEvidence:probe.inspectWriteEvidence({content:raw,...(explicit?{newline:'CRLF'}:{})},output)})}),/fixture captured/);
    const command=feedback[0].command;
    if(explicit){assert.match(command,/explicitly requested newline normalization/);assert.match(command,/matches the independently computed declared output/);assert(!command.includes('only a verified byte difference can support attribution'));}
    else assert.match(command,/does not match the independently computed declared output/);
    assert.match(command,/newline:'CRLF'/);assert.match(command,/JSON/);assert(!feedback.some(x=>x.kind==='accept'));
  }
});
test('draft evidence accepts explanation in current visible assistant text and validates actual selected CRLF bytes',()=>{
  assert.equal(typeof probe.inspectDraftEvidence,'function');const input=Buffer.from('\ufefforiginal\r\n'),output=Buffer.from((chineseNotice+'\n\n'+englishNotice+'\n').replaceAll('\n','\r\n'));
  const actual=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'New announcement.md uses UTF-8 without BOM and CRLF line endings.'});assert.equal(actual.ok,true);assert.equal(actual.bytes.crlf,7);assert.equal(actual.bytes.lf,0);
  assert.equal(probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'Output uses utf-8 without BOM and crlf line endings.'}).ok,true);
});
test('draft evidence refuses reasoning-only notes, false CRLF claims and modified original bytes',()=>{
  assert.equal(typeof probe.inspectDraftEvidence,'function');const input=Buffer.from('\ufefforiginal\r\n'),output=Buffer.from(chineseNotice+'\n\n'+englishNotice+'\n'),base={input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'}};
  const mismatch=probe.inspectDraftEvidence({...base,visibleAssistantText:'The output is UTF-8 no BOM and CRLF.'});assert(mismatch.missing.includes('selected-newline-CRLF'));assert.equal(mismatch.ok,false);
  const reasoning=probe.inspectDraftEvidence({...base,selectedOption:{description:'UTF-8 no BOM, LF.'},reasoningText:'UTF-8 no BOM, LF line endings.'});assert(reasoning.missing.includes('encoding-newline-note'));
  const falseClaim=probe.inspectDraftEvidence({...base,selectedOption:{description:'UTF-8 no BOM, LF.'},visibleAssistantText:'The output is UTF-8 no BOM and CRLF.'});assert(falseClaim.missing.includes('actual-newline-explanation-missing'));
  const changed=probe.inspectDraftEvidence({...base,input:Buffer.from('changed')});assert.equal(changed.fatal,true);assert(changed.missing.includes('original-input-changed'));
});
test('visible explanation collector accepts the current revision before-write text and excludes old revision, reasoning, attempts and future turns',()=>{
  assert.equal(typeof probe.visibleDraftText,'function');const frame=(turn,seq,content,type='assistant/message')=>({method:'session.event',params:{sessionId:'s',event:{type,seq,data:{turn,message:{role:'assistant',source:{kind:'model'},content}}}}});
  const frames=[frame(1,5,[{type:'text',text:'old revision UTF-8 CRLF'}]),frame(1,9,[{type:'text',text:'current revision earlier actual text'}]),frame(2,10,[{type:'text',text:'before write UTF-8 CRLF'}]),frame(2,12,[{type:'reasoning',text:'secret UTF-8 CRLF'},{type:'text',text:'actual visible explanation'}]),frame(2,13,[{type:'text',text:'stream UTF-8 CRLF'}],'assistant/attempt'),frame(3,15,[{type:'text',text:'future turn must not supply text'}]),frame(2,20,[{type:'text',text:'beyond actual draft terminal'}])];
  assert.equal(probe.visibleDraftText(frames,{sessionId:'s',turn:2,afterSeq:8,endSeq:18}),'current revision earlier actual text\nbefore write UTF-8 CRLF\nactual visible explanation');
});
test('selected newline promises are enforced in reverse order, split clauses and ambiguous alternatives',()=>{
  const input=Buffer.from('original'),output=Buffer.from(chineseNotice+'\n\n'+englishNotice+'\n'),base={input,expectedInputSha256:digest(input),output,visibleAssistantText:'Current output uses UTF-8 without BOM and LF.'};
  for(const description of ['CRLF line endings per the cited source; UTF-8 no BOM.','CRLF line endings; UTF-8 no BOM.','Use CRLF. The encoding is UTF-8 no BOM.','UTF-8 no BOM; CRLF and LF.','CRLF or LF line endings; UTF-8.'])assert.equal(probe.inspectDraftEvidence({...base,selectedOption:{description}}).ok,false,description);
  const correct=probe.inspectDraftEvidence({...base,selectedOption:{description:'Original input CRLF unchanged; new output LF; UTF-8 no BOM.'}});assert.equal(correct.ok,true);assert.equal(correct.requiredFormat.newline,'LF');
});

test('R21 actual CRLF promise is not replaced by readback counter expressions',()=>{
  const input=Buffer.from('original'),output=Buffer.from((chineseNotice+'\n\n'+englishNotice+'\n').replaceAll('\n','\r\n'));
  const selectedOption={description:'严格输出承诺：UTF-8、无 BOM、真实 CRLF（字节 0D 0A）；提交后必须统计 crlf=lf、bareCR=0、literalCRLF=0。原输入 BOM+CRLF 字节不动。'};
  const result=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption,visibleAssistantText:'Current output uses UTF-8 without BOM and real CRLF.'});assert.deepEqual(result.missing,[]);assert.equal(result.requiredFormat.newline,'CRLF');
  const bad=probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output:Buffer.from(chineseNotice+'\n\n'+englishNotice+'\n'),selectedOption,visibleAssistantText:'Current UTF-8 output has LF.'});assert(bad.missing.includes('selected-newline-CRLF'));
});

test('feedback before any external choice asks for clear plans without inventing a CRLF commitment',async()=>{
  const feedback=[];await assert.rejects(probe.runDraftFeedback({current:{sessionId:'unselected',turn:1,status:{stage:'selection',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>[{kind:'options',options:['a','b','c'].map(id=>({id,description:'UTF-8 no BOM; CRLF or LF.',artifacts:['announcement.md']}))}],send:async()=>{throw Error('fixture stops after capturing actual feedback');},inspect:()=>{throw Error('No valid plan has been selected');}}),/fixture stops/);assert.equal(feedback.length,1);assert.equal(feedback[0].requiredFormat,undefined);assert.match(feedback[0].command,/尚未.*选择/);assert(!feedback[0].command.includes('正确读回标准是 crlf>0'));
});
test('128-request monitor admits a normal complete-chain budget and rejects request 129',async()=>{
  const f=monitorFixture({dryRun:false,budget:{maxRequests:128,maxCumulativeInputBytes:96*1024*1024}});for(let i=0;i<128;i++)await f.run();assert.equal(f.nextCalls,128);await assert.rejects(f.run(),/request-count/);assert.equal(f.nextCalls,128);
});
test('same live controller repairs bad CRLF through real scope reset, fresh source reads, new selection and current accept',async()=>{
  assert.equal(typeof probe.runDraftFeedback,'function');const root=mkdtempSync(join(tmpdir(),'dsh-probe-correction-')),workspace=join(root,'workspace'),mirror=join(root,'method');mkdirSync(workspace);mkdirSync(mirror);
  const input=Buffer.from('\ufeff'+chineseNotice.replaceAll('\n','\r\n')+'\r\n');writeFileSync(join(workspace,'input.txt'),input);writeFileSync(join(mirror,'SKILL.md'),'# Announcement method\nRead the original input and retain its bytes; write both languages and verify facts.');writeFileSync(join(mirror,'LICENSE'),'MIT test fixture permission.');for(const id of ['a','b'])writeFileSync(join(root,id+'.md'),'# Primary fixture '+id+'\nInspect exact current bytes.');
  const cards=[],feedback=[],attempts=[],messages=[];let turn=0,reads=0,revision=0;
  const host=await createWorkflowHost({workspace,stateRoot:join(root,'state'),userMessage:'Revise input.txt as a bilingual announcement.md; preserve the input and wait for my actual choice and feedback.',contract:{requirements:['artifact-readable','original-user-task'],protectedInputs:['input.txt'],writeAllowlist:[],conversationMode:true,selection:{mode:'pending'},feedback:{mode:'required'},catalog:[{id:'method',path:mirror}],references:['a','b'].map(id=>({id,path:join(root,id+'.md')})),validators:[{id:'artifact-current',type:'current-text',covers:['artifact-readable']}],learning:{required:false}},onCard:card=>cards.push({...card,seq:cards.length+1})});
  const call=async(name,args={})=>host.dispatch(name,args,{callId:'script-'+Math.random()});
  const discover=async()=>{revision++;await call('workflow_read_workspace',{path:'input.txt'});await call('workflow_search_skills',{query:'method'});const opened=await call('workflow_open_skill',{candidate:'method'}),receipts=[];for(const file of opened.data.files){const r=await call('workflow_read_source',{source:opened.data.source,path:file.path});receipts.push(r.data.source_receipt);reads++;}assert.equal((await call('workflow_confirm_sources',{receipts})).ok,true);assert.equal((await call('workflow_review_skill',{candidate:'method',decision:'adopt',covers:['artifact-readable','original-user-task'],reason:'Actual inspected method covers both original task and artifact requirement.'})).ok,true);assert.equal((await call('workflow_install_skill',{candidate:'method'})).ok,true);for(const id of ['a','b']){const r=await call('workflow_open_reference',{reference:id}),proofs=[];for(const file of r.data.files){const body=await call('workflow_read_source',{source:r.data.source,path:file.path});proofs.push(body.data.source_receipt);reads++;}assert.equal((await call('workflow_confirm_sources',{receipts:proofs})).ok,true);assert.equal((await call('workflow_observe_reference',{source:r.data.source,observation:'Actual source supports current factual inspection.'})).ok,true);}const status=await call('workflow_status');await call('workflow_checkpoint',{done:['Inspected current method and references.'],evidence:status.state.evidence,next_action:'Wait for actual choice.',options:['a','b','c'].map(id=>({id:'brief-'+id,description:revision===1?'Parallel bilingual notice. UTF-8 no BOM, CRLF.':'Same bilingual artifact; preserve all actual external corrections.',sources:['reference:a','reference:b'],artifacts:['announcement.md']}))});assert.equal(host.stage,'selection');};
  const state=(reason='completed')=>({sessionId:'same-live-session',turn:++turn,reason:{kind:reason},status:{stage:host.stage,complete:host.complete}});
  const send=async text=>{messages.push(text);if(text==='/workflow status'){const before=host.exportAudit().revision;await host.acceptUserMessage(text);assert.equal(host.exportAudit().revision,before,'Progress continuation changed the actual scope');await discover();}
    else if(text.startsWith('/workflow choose ')){await host.acceptUserMessage(text);assert.equal(host.stage,'draft');const body=chineseNotice+'\n\n'+englishNotice+'\n';const writeArgs={path:'announcement.md',content:body,...(revision===1?{}:{newline:'CRLF'})},written=await call('workflow_write',writeArgs);assert.equal(written.ok,true);if(revision>1){const bytes=readFileSync(join(workspace,'announcement.md')),independent=probe.inspectWriteEvidence(writeArgs,bytes);assert.equal(independent.matchesRawActual,false);assert.equal(independent.matchesDeclaredOutput,true);assert.equal(written.data.normalization.raw_input_sha256,independent.arguments.sha256);assert.equal(written.data.normalization.output_sha256,independent.declaredOutput.sha256);assert.equal(independent.actualOutput.crlf,7);assert.equal(independent.actualOutput.lf,0);}assert.equal((await call('workflow_validate',{validator:'artifact-current',artifact:'announcement.md'})).ok,true);assert.equal(host.stage,'feedback');}
    else if(text==='/workflow accept'){await host.acceptUserMessage(text);assert.equal((await call('workflow_learn',{decision:'no_increment',reason:'Current inspected test method requires no verified generic update; not an automatic runtime Skill update.',evidence:['method','announcement.md']})).ok,true);}
    else{await host.acceptUserMessage(text);assert.equal(host.stage,'discovery');assert.equal((await call('workflow_write',{path:'announcement.md',content:'early after reset'})).ok,false);await discover();}return state(revision===1&&host.stage==='feedback'?'max-tokens':'completed');};
  const result=await probe.runDraftFeedback({current:state('max-tokens'),outputPath:'announcement.md',send,getCards:()=>cards,feedback,inspect:(_current,selectedOption,requiredFormat)=>probe.inspectDraftEvidence({input:readFileSync(join(workspace,'input.txt')),expectedInputSha256:digest(input),output:readFileSync(join(workspace,'announcement.md')),selectedOption,requiredFormat,visibleAssistantText:revision===1?'Actual output is UTF-8 no BOM with LF, differing from the selected CRLF.':'Actual output is UTF-8 no BOM and CRLF.'}),saveAttempt:check=>attempts.push(check)});
  assert.equal(result.current.status.complete,true);assert.equal(revision,2);assert.equal(reads,8);assert.equal(attempts.length,2);assert.equal(attempts[0].ok,false);assert.equal(attempts[1].ok,true);assert.equal(messages.filter(x=>x.startsWith('/workflow choose ')).length,2);assert.equal(messages.filter(x=>x==='/workflow accept').length,1);assert.equal(feedback.filter(x=>x.kind==='correction').length,1);assert.equal(feedback.filter(x=>x.kind==='continuation').length,1);assert(readFileSync(join(workspace,'input.txt')).equals(input));assert.deepEqual(result.stages,['scope','discovery','selection','draft','feedback','delivery','learning']);assert.equal(result.finalRevision,2);
});
test('modified protected input never reaches correction or acceptance in the live feedback driver',async()=>{
  const calls=[],feedback=[],input=Buffer.from('original'),output=Buffer.from((chineseNotice+'\n\n'+englishNotice+'\n').replaceAll('\n','\r\n'));let current={sessionId:'one',turn:1,status:{stage:'selection',complete:false}};
  await assert.rejects(probe.runDraftFeedback({current,outputPath:'announcement.md',feedback,getCards:()=>[{kind:'options',options:['a','b','c'].map(id=>({id,description:'UTF-8 no BOM, CRLF.',artifacts:['announcement.md']}))}],send:async text=>{calls.push(text);return{sessionId:'one',turn:2,status:{stage:'feedback',complete:false}};},inspect:()=>probe.inspectDraftEvidence({input:Buffer.from('tampered'),expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'New output UTF-8 no BOM, CRLF.'})}),/original-input-changed/);
  assert.equal(calls.length,1);assert(calls[0].startsWith('/workflow choose '));assert(!feedback.some(x=>x.kind==='accept'||x.kind==='correction'));
});

test('production controller receives option regressions as real feedback and can finish beyond two corrected drafts',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-plan-regression-')),workspace=join(root,'workspace'),installed=join(root,'skills'),method=join(installed,'announcement-method');mkdirSync(workspace);mkdirSync(method,{recursive:true});const input=Buffer.from('\ufeff'+chineseNotice+'\r\n');writeFileSync(join(workspace,'input.txt'),input);writeFileSync(join(method,'SKILL.md'),'---\nname: announcement-method\ndescription: inspect the original bilingual announcement and preserve factual fields\nlicense: MIT\n---\nRead actual input and sources. Preserve all facts and selected output bytes.');writeFileSync(join(method,'LICENSE'),'MIT test fixture permission.');
  const cards=[],feedback=[],messages=[],attempts=[],accepted=[];let turn=0,scopes=0,drafts=0,reads=0;
  const factory=createConversationFactory({stateRoot:join(root,'private'),installedRoots:[installed],external:false,sourceProviderOptions:{get:async url=>({status:200,headers:{'content-type':'text/plain'},bytes:Buffer.from('Explicit primary test reference '+url+'\nPreserve actual encoding and newline bytes.\n')})},onCard:card=>cards.push({...card,seq:cards.length+1})});
  const controller=await factory({workspace,sessionId:'production-plan-feedback',userMessage:'Revise input.txt into a bilingual announcement.md, preserve the input and all factual fields, and wait for real choice and feedback.'}),call=async(name,args={})=>{const r=await controller.dispatch(name,args,{callId:'actual-'+Math.random()});assert.equal(r.ok,true,JSON.stringify(r));return r;};
  const discover=async()=>{scopes++;await call('workflow_read_workspace',{path:'input.txt'});const found=await call('workflow_search_skills',{query:'announcement method'}),candidate=found.data.candidates[0].id,opened=await call('workflow_open_skill',{candidate}),receipts=[];for(const file of opened.data.files){const r=await call('workflow_read_source',{source:opened.data.source,path:file.path});receipts.push(r.data.source_receipt);reads++;}await call('workflow_confirm_sources',{receipts});await call('workflow_review_skill',{candidate,decision:'adopt',covers:['artifact-readable','original-user-task'],reason:'Actual read method supports the scoped bilingual artifact and preserved input.'});await call('workflow_install_skill',{candidate});const sources=[];for(const id of ['a','b']){const opened=await call('workflow_open_reference',{reference:'https://example.com/'+id});sources.push(opened.data.source);const receipts=[];for(const file of opened.data.files){const r=await call('workflow_read_source',{source:opened.data.source,path:file.path});receipts.push(r.data.source_receipt);reads++;}await call('workflow_confirm_sources',{receipts});await call('workflow_observe_reference',{source:opened.data.source,observation:'Current exact bytes support the encoding and newline method.'});}const status=await call('workflow_status');const plan=await controller.dispatch('workflow_checkpoint',{done:['Read current input, licensed method and both references.'],evidence:status.state.evidence,next_action:'Wait for actual external selection.',options:['a','b','c'].map(id=>({id,description:scopes===2?'Bilingual notice, UTF-8 no BOM, LF.':'Bilingual notice, UTF-8 no BOM, CRLF.',sources,artifacts:['announcement.md']}))});assert.equal(plan.state.options.length,3);assert.equal(controller.stage,'selection');};
  const state=()=>({sessionId:'production-plan-feedback',turn:++turn,reason:{kind:'completed'},status:{stage:controller.stage,complete:controller.complete}});
  const send=async text=>{messages.push(text);await controller.acceptUserMessage(text);if(text.startsWith('/workflow choose ')){drafts++;assert.equal(controller.stage,'draft');let body=chineseNotice+'\n\n'+englishNotice+'\n';if(drafts===2)body+='\n';if(drafts>=3)body=body.replaceAll('\n','\r\n');const writeArgs={path:'announcement.md',content:body},writeResult=await call('workflow_write',writeArgs);await call('workflow_validate',{validator:'artifact-current',artifact:'announcement.md'});assert.equal(controller.stage,'feedback');if(drafts===4){const badArgs={...writeArgs,content:'not executed',newline:'unknown'},refused=await controller.dispatch('workflow_write',badArgs);assert.equal(refused.ok,false);assert.equal(refused.fatal,undefined);assert.equal(controller.stage,'feedback');const event=(type,seq,data)=>({method:'session.event',params:{sessionId:'production-plan-feedback',event:{type,seq,data:{turn:turn+1,...data}}}}),terminal=(callId,value)=>({role:'tool',source:{kind:'tool',callId},toolCallId:callId,content:[{type:'text',text:JSON.stringify(value)}],isError:false}),observed=probe.collectWriteEvidence([event('tool/call',1,{callId:'written',name:'workflow_write',arguments:JSON.stringify(writeArgs)}),event('tool/result',2,{message:terminal('written',writeResult)}),event('tool/call',3,{callId:'refused',name:'workflow_write',arguments:JSON.stringify(badArgs)}),event('tool/result',4,{message:terminal('refused',refused)})],{sessionId:'production-plan-feedback',turn:turn+1,path:'announcement.md',output:readFileSync(join(workspace,'announcement.md'))});assert.equal(observed.writeEvidence.callId,'written');assert.equal(observed.writeEvidence.matchesDeclaredOutput,true);assert.equal(observed.writeCalls.at(-1).outcome,'refused');}}else if(text==='/workflow accept'){accepted.push(readFileSync(join(workspace,'announcement.md')));await call('workflow_learn',{decision:'no_increment',reason:'This current local test uses the existing factual and byte-preservation method; no verified general Skill increment or automatic runtime Skill update.',evidence:['Current artifact and actual external acceptance.']});}else{assert.equal(controller.stage,'discovery');const early=await controller.dispatch('workflow_write',{path:'announcement.md',content:'not allowed before fresh discovery'});assert.equal(early.ok,false);await discover();}return state();};
  await discover();const result=await probe.runDraftFeedback({current:state(),outputPath:'announcement.md',send,getCards:()=>cards,feedback,inspect:(_current,selectedOption,requiredFormat)=>probe.inspectDraftEvidence({input:readFileSync(join(workspace,'input.txt')),expectedInputSha256:digest(input),output:readFileSync(join(workspace,'announcement.md')),selectedOption,requiredFormat,visibleAssistantText:drafts===3?'Output is UTF-8 without BOM and LF.':'Output is UTF-8 without BOM and CRLF.'}),saveAttempt:check=>attempts.push(check)});
  assert.equal(result.current.status.complete,true);assert.equal(drafts,4);assert.equal(scopes,5);assert.equal(reads,20);assert.equal(attempts.length,4);assert.deepEqual(attempts.map(a=>a.ok),[false,false,false,true]);assert.equal(feedback.filter(x=>x.kind==='choice').length,4);assert.equal(feedback.filter(x=>x.kind==='correction').length,4);assert.equal(feedback.filter(x=>x.kind==='accept').length,1);assert(messages.some(text=>text.includes('LF')&&text.includes('CRLF')&&!text.startsWith('/workflow')));assert.equal(accepted.length,1);assert(accepted[0].includes(Buffer.from('\r\n')));assert(readFileSync(join(workspace,'input.txt')).equals(input));assert.deepEqual(result.stages,['scope','discovery','selection','draft','feedback','delivery','learning']);assert.equal(result.finalRevision,5);
});
test('truncation continuations honor an explicit test limit, remain progress-only and never fabricate acceptance',async()=>{
  const calls=[],feedback=[];await assert.rejects(probe.runDraftFeedback({maxContinuations:4,current:{sessionId:'s',turn:1,reason:{kind:'max-tokens'},status:{stage:'discovery',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>[],inspect:()=>{throw Error('Unready stage must not be graded')},send:async command=>{calls.push(command);return{sessionId:'s',turn:calls.length+1,reason:{kind:'max-tokens'},status:{stage:'discovery',complete:false}};}}),/continuation limit/);assert.deepEqual(calls,Array(4).fill('/workflow status'));assert(!feedback.some(x=>x.kind==='accept'));
});
test('more than four progressing max-tokens continuations can reach selection draft and actual driver acceptance',async()=>{
  const calls=[],feedback=[],stages=['scope','discovery','selection','draft','feedback','delivery','learning'],cards=[{kind:'options',options:['a','b','c'].map(id=>({id,description:'UTF-8 no BOM, CRLF.',artifacts:['announcement.md']}))},...stages.map((stage,index)=>({kind:'checkpoint',seq:index+1,report:{task:'bounded-scripted-progress',revision:1,stage},result:{ok:true}}))];let progress=0;
  const result=await probe.runDraftFeedback({current:{sessionId:'progress',turn:1,reason:{kind:'max-tokens'},status:{stage:'discovery',complete:false,observed:0}},outputPath:'announcement.md',feedback,getCards:()=>cards,send:async command=>{calls.push(command);let stage,complete=false,reason='max-tokens';if(command==='/workflow status'){progress++;stage=progress<6?'discovery':progress===6?'selection':'feedback';}else if(command.startsWith('/workflow choose '))stage='draft';else{assert.equal(command,'/workflow accept');stage='learning';complete=true;reason='completed';}return{sessionId:'progress',turn:calls.length+1,reason:{kind:reason},status:{stage,complete,observed:progress}};},inspect:current=>{assert.equal(current.status.stage,'feedback');return{ok:true,bytes:{sha256:'independent-scripted-current-draft'}};}});
  assert.equal(result.current.status.complete,true);assert.equal(result.continuations,7);assert.equal(calls.filter(x=>x==='/workflow status').length,7);assert.deepEqual(calls.slice(-2),['/workflow status','/workflow accept']);assert.equal(feedback.filter(x=>x.kind==='accept').length,1);
});
test('invalid continuation limits refuse before dispatch or artifact inspection',async()=>{
  for(const maxContinuations of [Infinity,-1,0,NaN,1.5])await assert.rejects(probe.runDraftFeedback({maxContinuations,current:{sessionId:'s'},send:()=>{throw Error('Unexpected send')},inspect:()=>{throw Error('Unexpected inspect')}}),/continuation.*positive safe integer/i);
});

test('repeated identical failed drafts stop with concrete evidence instead of accepting or retrying without bounds',async()=>{
  const input=Buffer.from('original'),output=Buffer.from(chineseNotice+'\n\n'+englishNotice+'\n'),calls=[],feedback=[],attempts=[];
  await assert.rejects(probe.runDraftFeedback({current:{sessionId:'same',turn:1,status:{stage:'feedback',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>[],send:async command=>{calls.push(command);return{sessionId:'same',turn:calls.length+1,status:{stage:'feedback',complete:false}};},inspect:()=>probe.inspectDraftEvidence({input,expectedInputSha256:digest(input),output,selectedOption:{description:'UTF-8 no BOM, CRLF.'},visibleAssistantText:'Actual output is UTF-8 no BOM, LF.'}),saveAttempt:check=>attempts.push(check)}),/Repeated identical independent draft failure without progress.*selected-newline-CRLF/);
  assert.equal(attempts.length,5);assert.equal(calls.length,4);assert(feedback.every(x=>x.kind==='correction'));assert(!calls.includes('/workflow accept'));
});

test('a genuine aborted selection does not grade a draft or manufacture external acceptance',async()=>{
  const calls=[];await assert.rejects(probe.runDraftFeedback({current:{sessionId:'s',turn:1,reason:{kind:'aborted'},status:{stage:'feedback',complete:false}},outputPath:'announcement.md',getCards:()=>[],send:async text=>calls.push(text),inspect:()=>{throw Error('Aborted turn was incorrectly graded');}}),/genuine failure.*aborted/);assert.deepEqual(calls,[]);
});
test('selection returning max-tokens at draft continues the same session before grading and accepting',async()=>{
  const calls=[],feedback=[],stages=['scope','discovery','selection','draft','feedback','delivery','learning'],cards=[{kind:'options',options:['a','b','c'].map(id=>({id,description:'UTF-8 no BOM, CRLF.',artifacts:['announcement.md']}))},...stages.map((stage,index)=>({kind:'checkpoint',seq:index+1,report:{task:'test',revision:1,stage},result:{ok:true}}))];
  const result=await probe.runDraftFeedback({current:{sessionId:'s',turn:1,reason:{kind:'completed'},status:{stage:'selection',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>cards,send:async command=>{calls.push(command);if(command.startsWith('/workflow choose '))return{sessionId:'s',turn:2,reason:{kind:'max-tokens'},status:{stage:'draft',complete:false}};if(command==='/workflow status')return{sessionId:'s',turn:3,reason:{kind:'completed'},status:{stage:'feedback',complete:false}};return{sessionId:'s',turn:4,reason:{kind:'completed'},status:{stage:'complete',complete:true}};},inspect:current=>{assert.equal(current.status.stage,'feedback');return{ok:true,bytes:{sha256:'independently-reviewed-fixture'}};}});
  assert.deepEqual(calls,['/workflow choose a','/workflow status','/workflow accept']);assert.equal(result.continuations,1);assert.equal(result.current.status.complete,true);
});
test('a cancelled dry candidate cannot be used as a paid plan or resumed silently',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-probe-fresh-state-')),path=join(root,'probe-plan.json');writeFileSync(path,JSON.stringify({format:2,mode:'dry-run',ownerConfigFile:join(root,'not-created.json')}));
  await assert.rejects(runPreparedRealModelProbe(path),/separately prepared fresh paid plan/);
});
