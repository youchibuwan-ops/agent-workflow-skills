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
    else if(text.startsWith('/workflow choose ')){await host.acceptUserMessage(text);assert.equal(host.stage,'draft');const body=chineseNotice+'\n\n'+englishNotice+'\n';assert.equal((await call('workflow_write',{path:'announcement.md',content:revision===1?body:body.replaceAll('\n','\r\n')})).ok,true);assert.equal((await call('workflow_validate',{validator:'artifact-current',artifact:'announcement.md'})).ok,true);assert.equal(host.stage,'feedback');}
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
test('truncation continuations are bounded, remain progress-only and never fabricate acceptance',async()=>{
  const calls=[],feedback=[];await assert.rejects(probe.runDraftFeedback({current:{sessionId:'s',turn:1,reason:{kind:'max-tokens'},status:{stage:'discovery',complete:false}},outputPath:'announcement.md',feedback,getCards:()=>[],inspect:()=>{throw Error('Unready stage must not be graded')},send:async command=>{calls.push(command);return{sessionId:'s',turn:calls.length+1,reason:{kind:'max-tokens'},status:{stage:'discovery',complete:false}};}}),/continuation limit/);assert.deepEqual(calls,Array(4).fill('/workflow status'));assert(!feedback.some(x=>x.kind==='accept'));
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
