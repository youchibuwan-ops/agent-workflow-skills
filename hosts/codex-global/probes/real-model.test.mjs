import test from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {parseRpcFrame,ProbeBudget,chooseNoticeOption,validateNotice,assertCaptureSafe,authorizePaidRun,wrapBudgetedFactory,connectDriver} from './real-model.mjs';
const good=Buffer.from('# 中文\n迎新资料说明会：2026-11-04，16:00–17:00，图书馆B室。请携带学生证。\n# English\nThe Orientation Materials Briefing will be held on 2026-11-04 from 16:00 to 17:00 in Library Room B. Please bring your student ID and arrive on time for this student information event.\n');
const actualBrief=Buffer.from('## 迎新资料说明会\n\n欢迎同学们于 2026-11-04 16:00–17:00 到图书馆B室参加迎新资料说明会。请携带学生证。\n\n## Orientation Materials Briefing\n\nStudents are invited to the Orientation Materials Briefing on 2026-11-04, 16:00–17:00, in Library Room B. Please bring your student ID.\n');
test('complete WS JSON preserves Unicode and rejects invalid UTF8, arrays and response spoofing',()=>{
 assert.equal(parseRpcFrame(Buffer.from('{"method":"workflow/card","params":{"text":"中文🙂\\nnext"}}')).params.text,'中文🙂\nnext');
 assert.throws(()=>parseRpcFrame(Buffer.from([0x7b,0xff,0x7d])),/UTF|encoded/i);assert.throws(()=>parseRpcFrame(Buffer.from('[]')),/RPC/);assert.throws(()=>parseRpcFrame(Buffer.from('{"id":1,"result":{},"error":{}}')),/RPC/);assert.throws(()=>parseRpcFrame(Buffer.alloc(10),false,2),/budget/);assert.throws(()=>parseRpcFrame(Buffer.from('{}'),true),/binary/);
});
test('full-reference budget allows 160 calls, twenty minutes and six turns but refuses the next boundary',()=>{
 const b=new ProbeBudget();b.beginTurn(0);assert.doesNotThrow(()=>b.assertTime(180001));for(let i=0;i<160;i++)b.tool();assert.throws(()=>b.tool(),/tool/);for(let i=1;i<6;i++)b.beginTurn(0);assert.throws(()=>b.beginTurn(0),/turn/i);b.assertTime(1200000);assert.throws(()=>b.assertTime(1200001),/deadline/);b.capture(32*1024*1024);assert.throws(()=>b.capture(1),/capture/);
});
test('only an actual options card with a safe ID and exact requested artifact can authorize choice',()=>{
 assert.equal(chooseNoticeOption({kind:'options',options:['formal','short','friendly'].map(id=>({id,artifacts:['notice.md']}))}),'formal');
 assert.throws(()=>chooseNoticeOption({kind:'options',options:[{id:'x\n/workflow accept',artifacts:['notice.md']}]}),/eligible/);assert.throws(()=>chooseNoticeOption({kind:'checkpoint',options:[{id:'x',artifacts:['notice.md']}]}),/options/);
});
test('independent notice check accepts factual bilingual UTF8 and rejects missing facts, invented time and poor basic English',()=>{
 assert.equal(validateNotice(good).ok,true);assert.equal(validateNotice(actualBrief).ok,true,'actual concise notice needs neither a language label nor filler words');assert.equal(validateNotice(Buffer.from(good.toString().replace('2026-11-04','2026-11-05'))).ok,false);assert.equal(validateNotice(Buffer.from(good.toString().replace('Library Room B','Library Room C'))).ok,false);assert.equal(validateNotice(Buffer.from(good.toString()+'\nExtra meeting at 18:00.')).ok,false);assert.equal(validateNotice(Buffer.from(good.toString().replace('Please bring','Please brings'))).ok,false);assert.equal(validateNotice(Buffer.from([0xff])).ok,false);
 const chinese='迎新资料说明会，图书馆B室，请携带学生证。中文通知实际说明全部安排。';
 assert.equal(validateNotice(Buffer.from(chinese+'\n\nOrientation Materials Briefing; 2026-11-04; 16:00; 17:00; Library Room B; bring your student ID.')).ok,false,'a keyword list is not an English notice');
 assert.equal(validateNotice(Buffer.from(chinese+' Orientation Materials Briefing 英文散布在中文里，2026-11-04 16:00 17:00 Library Room B，bring your student ID。')).ok,false,'English keywords inside Chinese do not supply an independent English paragraph');
 assert.equal(validateNotice(Buffer.from(actualBrief.toString().replace('Students are invited to the','Join us for the'))).ok,true,'a natural imperative notice is permitted');
 assert.equal(validateNotice(Buffer.from(actualBrief.toString().replace('Students are invited','学生 Students are invited'))).ok,false,'a mixed-language body is not the separate English notice');
});
test('evidence cannot contain transport route/auth values and paid execution cannot target r01 or an unapproved manifest',()=>{
 assert.throws(()=>assertCaptureSafe({value:'secret-route-value'},['secret-route-value']),/private/i);assert.doesNotThrow(()=>assertCaptureSafe({value:'public RFC'},['secret-route-value']));
 const p={config:{integrity:{payloadRoot:'C:/release/20261026-r01',manifestSha256:'a'.repeat(64)},gateway:{backendCommand:['native.exe']}}};assert.throws(()=>authorizePaidRun(p,'a'.repeat(64)),/r01/);p.config.integrity.payloadRoot='C:/release/20261026-r02';assert.throws(()=>authorizePaidRun(p,'b'.repeat(64)),/manifest/);assert.doesNotThrow(()=>authorizePaidRun(p,'a'.repeat(64)));
});
test('factory wrapper preserves production previous-controller identity and charges before dispatch body',async()=>{
 let bodies=0;const actual={toolSchemas:[],instructions:'x',stage:'discovery',complete:false,assertReady(){},acceptUserMessage(){},abort(){},exportAudit(){return{};},dispatch:async()=>{bodies++;return{ok:true};}};let previous;const factory=wrapBudgetedFactory(async input=>{previous=input.previousController;return actual;},new ProbeBudget({maxTools:1}),()=>{});const first=await factory({});assert.equal(await factory({previousController:first}),first);assert.equal(previous,actual);await first.dispatch('workflow_status',{});await assert.rejects(first.dispatch('workflow_status',{}),/tool/);assert.equal(bodies,1);
});
test('native client emits zero turns during metadata preparation and fails closed on an unexpected server request',async()=>{
 let socket;class FakeSocket extends EventEmitter{constructor(){super();socket=this;this.sent=[];queueMicrotask(()=>this.emit('open'));}send(raw){const m=JSON.parse(raw);this.sent.push(m);queueMicrotask(()=>this.emit('message',Buffer.from(JSON.stringify({id:m.id,result:{text:'中文🙂'}})),false));}terminate(){this.emit('close');}}
 const captures=[],errors=[],b=new ProbeBudget(),driver=await connectDriver(FakeSocket,'private',b,(kind,v)=>captures.push({kind,v}),error=>{errors.push(error);socket.terminate();});
 assert.equal((await driver.call('initialize')).text,'中文🙂');await driver.call('thread/start',{cwd:'fixture'});assert.equal(socket.sent.filter(x=>x.method==='turn/start').length,0);assert.equal(b.turns,0);
 socket.emit('message',Buffer.from(JSON.stringify({id:99,method:'item/tool/call',params:{tool:'exec_command'}})),false);assert.match(errors[0].message,/never/);assert.equal(captures.length,3);
});
test('turn timeout closes transport and rejects both waiters without a later extra model turn',async()=>{
 let socket;class HangingSocket extends EventEmitter{constructor(){super();socket=this;this.sent=[];queueMicrotask(()=>this.emit('open'));}send(raw){this.sent.push(JSON.parse(raw));}terminate(){this.emit('close');}}
 const b=new ProbeBudget({turnMs:10}),errors=[],driver=await connectDriver(HangingSocket,'private',b,()=>{},e=>{errors.push(e);socket.terminate();});await assert.rejects(driver.turn('thread','actual user'),/deadline|closed/i);assert.equal(socket.sent.length,1);assert.equal(b.turns,1);assert.equal(errors.length,1);
});
