// Preparing is free of model/network calls. --run is an explicit paid-run action.
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,isAbsolute,relative,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const refs=['https://www.rfc-editor.org/rfc/rfc3629.txt','https://www.rfc-editor.org/rfc/rfc5198.txt'];
function snapshot(root){const files=[];function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','.runtime-tests'].includes(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())visit(path);else if(entry.isFile()&&/\.(?:mjs|json|yml|md)$/.test(path)){const bytes=readFileSync(path);files.push({path:relative(root,path).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}visit(root);return files.sort((a,b)=>a.path.localeCompare(b.path));}
async function owner(configFile){
  if(!isAbsolute(configFile??''))throw Error('Trusted explicit base owner configuration required');const config=JSON.parse(readFileSync(configFile,'utf8'));
  const verifier=config.integrityVerifierModule;if(!isAbsolute(verifier??'')||sha(readFileSync(verifier))!==config.integrityVerifierSha256)throw Error('Owner verifier pin mismatch');
  const policy=config.integrity,manifestBytes=readFileSync(policy.manifestPath);if(sha(manifestBytes)!==policy.manifestSha256)throw Error('Owner source manifest pin mismatch');const manifest=JSON.parse(manifestBytes);if(manifest.format!==1||!Array.isArray(manifest.files))throw Error('Owner source manifest invalid');
  for(const item of manifest.files){if(typeof item.path!=='string'||isAbsolute(item.path)||/[\\:\0]/.test(item.path)||item.path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Invalid source manifest member');const bytes=readFileSync(resolve(policy.payloadRoot,item.path));if(bytes.length!==item.bytes||sha(bytes)!==item.sha256)throw Error('Source changed before verifier bootstrap');}
  const {pinVerifierBootstrap}=await import(pathToFileURL(join(policy.payloadRoot,'hosts/dsh-global/launcher.mjs')).href);pinVerifierBootstrap(config);
  const {verifyInstallation}=await import(pathToFileURL(verifier).href);await verifyInstallation({config,profile:'real-model-probe'});return {config,verifyInstallation};
}
export async function prepareRealModelProbe({baseOwnerConfigPath,outputParent=join(tmpdir(),'agent-workflow-real-model'),maxRequests=128,maxTokens=100000,maxCumulativeInputBytes=96*1024*1024,maxRequestInputBytes=2*1024*1024,promptTimeoutMs=20*60*1000,verifiedDryRunReport}={}){
  const {config}=await owner(baseOwnerConfigPath);mkdirSync(outputParent,{recursive:true});const root=mkdtempSync(join(outputParent,'dsh-ordinary-')),workspace=join(root,'workspace'),privateRoot=join(root,'private'),home=join(privateRoot,'home'),installed=join(privateRoot,'skills'),skill=join(installed,'technical-announcement-editing');
  mkdirSync(workspace);mkdirSync(skill,{recursive:true});
  const input=Buffer.from('\ufeff小型技术交流会将于2026年11月8日14:30在松林会议室举办。请在11月5日前联系 test@example.invalid 报名。我们希望通知简短清晰，同时保留全部时间、地点和联系方式。\r\n');
  writeFileSync(join(workspace,'announcement-input.txt'),input);
  writeFileSync(join(skill,'SKILL.md'),'---\nname: technical-announcement-editing\ndescription: Revise factual bilingual announcements while preserving original input bytes and complete factual fields.\nlicense: MIT\n---\n# Technical announcement editing test method\n\nThis is an explicit local test Skill, not an independently reviewed external publication.\n\nRead the actual input first. Identify event, date, time, venue, registration deadline and contact. Do not invent missing facts. Offer 3–5 supported editorial plans with the exact output path. Compare two primary technical references for the UTF-8/newline note; read and confirm their full source bytes before citing. Wait for the external choice. Write a new bilingual announcement; retain every factual field and leave original input bytes untouched. Explain encoding/newline decisions briefly without claiming that a structural validator proves semantic correctness. Validate the actual output, present the draft, wait for external feedback, and state any genuine reusable learning or bounded no-increment decision.\n\nJSON write method: content is a JSON string. Escape each CRLF once on the JSON wire so that after JSON parsing content contains actual U+000D and U+000A, not literal U+005C-r/U+005C-n characters. Read back actual output bytes and compare CRLF/LF/literal escape counts. Compare the original tool arguments before attributing any change to the host.\n');
  writeFileSync(join(skill,'LICENSE'),'MIT License\n\nCopyright (c) 2026 AgentWorkflow test fixture contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n');
  const payload=config.integrity.payloadRoot,{resolveDshRuntime}=await import(pathToFileURL(join(payload,'hosts/dsh-global/runtime.mjs')).href),runtime=resolveDshRuntime(config.runtimeRoot),profile='ordinary-model-probe';
  const expectedToolNames=(await import(pathToFileURL(join(payload,'hosts/core/tool-schemas.mjs')).href)).WORKFLOW_TOOL_SCHEMAS.map(tool=>tool.name),sourceSnapshot=snapshot(payload);
  const dryBytes=verifiedDryRunReport?readFileSync(verifiedDryRunReport):null,dry=dryBytes?JSON.parse(dryBytes):null,mode=dry?'paid':'dry-run';
  if(dry&&!validDryWitness(dry,{sourceSnapshot,maxRequests,maxTokens,maxCumulativeInputBytes,maxRequestInputBytes,expectedToolNames}))throw Error('A matching actual native dry-run-pass is required before preparing a fresh paid plan');
  await new Promise((fulfill,reject)=>{const child=spawn(config.nodeExecutable,[runtime.bin,'--profile',profile,'--from-default-profile','headless','--dump-config'],{cwd:workspace,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'},windowsHide:true});let stderr='';child.stdout.resume();child.stderr.on('data',bytes=>stderr+=bytes);child.once('error',reject);child.once('close',code=>code===0?fulfill():reject(Error('Official isolated profile preparation failed: '+stderr)));});
  const manifestPath=join(home,'profiles',profile,'package.json'),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.dsh.profile.bundles.push('@deepseek-ai/dsh-sdk-app');writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  const monitorFile=join(privateRoot,'model-events.jsonl'),overlay=join(privateRoot,'owner-probe-overlay.json');
  writeFileSync(overlay,JSON.stringify([{id:'headless-startup',disabled:true},{id:'headless-runner',disabled:true},{id:'agent-default-model',config:{provider:'deepseek-official',model:'deepseek-flash'}},{insert:[{id:'real-model-monitor',name:pathToFileURL(join(payload,'hosts/dsh-global/probes/model-monitor.mjs')).href,config:{logFile:monitorFile,maxRequests,maxTokens,expectedToolNames,dryRun:mode==='dry-run',maxCumulativeInputBytes,maxRequestInputBytes}}]}],null,2));
  const controllerFile=join(privateRoot,'controller.json');writeFileSync(controllerFile,JSON.stringify({stateRoot:join(privateRoot,'controllers'),installedRoots:[installed],external:true,privateRoots:[config.home,config.runtimeRoot,dirname(configFileSafe(baseOwnerConfigPath)),privateRoot,...(config.privateRoots??[])]}));
  const derived={...config,home,stateRoot:join(privateRoot,'launches'),controllerConfigFile:controllerFile,overlays:[overlay]};
  const task='请实际读取 announcement-input.txt，将这份通知润色为简洁清晰的中英双语新稿 announcement.md，保留主题、活动日期/时间、地点、报名截止日和联系邮箱。不得改原文件及其BOM/CRLF字节。先本地发现并完整审阅 technical-announcement-editing Skill及许可证、实际安装读回；实际取得并完整阅读确认这两份标准参考：'+refs.join('、')+'。对照提供3–5个有来源支撑的编辑方案，每项artifacts只能为["announcement.md"]；发出真实方案卡后停下等待外部 /workflow choose。选中后写实际草稿、用artifact-current做结构核验（不能当语义通过），停下等待外部 /workflow accept。实际反馈后完成交付与学习；no_increment必须说明本次没有可验证的通用Skill更新，不能声称已自动更新Skill。各阶段按工具返回state行动，自动阶段卡不用重复填七份checkpoint。若上一回复被max-tokens截断，外部driver会用 /workflow status 请求在原scope内继续；请读取真实当前stage并继续尚未完成的取证/写入/验证或学习，不重开任务，不把截断当完成。必须先尝试一次提前workflow_write，让宿主真实拒绝，再正常纠正继续。';
  const plan={format:2,mode,root,workspace,privateRoot,profile,ownerConfigFile:join(privateRoot,'owner.dsh.json'),monitorFile,input:{path:'announcement-input.txt',bytes:input.length,sha256:sha(input)},output:'announcement.md',task,references:refs,maxRequests,maxTokens,maxCumulativeInputBytes,maxRequestInputBytes,promptTimeoutMs,expectedToolNames,...(dry?{dryRunEvidence:{path:resolve(verifiedDryRunReport),sha256:sha(dryBytes)}}:{}),approval:{kind:'test-external-driver',humanApproval:false,designApproval:false},sourceSnapshot};
  writeFileSync(plan.ownerConfigFile,JSON.stringify(derived,null,2));writeFileSync(join(privateRoot,'task.txt'),task);writeFileSync(join(root,'probe-plan.json'),JSON.stringify(plan,null,2));return plan;
}
function configFileSafe(path){if(!isAbsolute(path))throw Error('Absolute config path required');return path;}
function rpc(child,log){
  let id=0,buffer='',closed=false;const decoder=new StringDecoder('utf8'),pending=new Map(),waiters=new Set(),frames=[];
  const fail=error=>{closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();for(const waiter of [...waiters]){clearTimeout(waiter.timer);waiter.reject(error);}waiters.clear();};
  const drain=()=>{let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const frame=JSON.parse(line);writeFileSync(log,JSON.stringify({direction:'from-native',frame})+'\n',{flag:'a'});frames.push(frame);for(const waiter of [...waiters])if(frames.length-1>=waiter.afterIndex&&waiter.predicate(frame)){waiters.delete(waiter);clearTimeout(waiter.timer);waiter.resolve({frame,index:frames.length-1});}const item=pending.get(frame.id);if(item){pending.delete(frame.id);clearTimeout(item.timer);frame.error?item.reject(Error(JSON.stringify(frame.error))):item.resolve(frame.result);}}};
  child.stdout.on('data',bytes=>{try{buffer+=decoder.write(bytes);drain();}catch(error){fail(error);child.kill();}});child.stdout.on('end',()=>{try{buffer+=decoder.end();drain();if(buffer.trim())throw Error('Native RPC ended with partial JSON');}catch(error){fail(error);}});child.once('close',()=>fail(Error('Native RPC transport closed')));
  const request=(method,params)=>new Promise((resolve,reject)=>{if(closed){reject(Error('Native RPC transport is closed'));return;}const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Native RPC timeout: '+method));},20*60*1000);pending.set(requestId,{resolve,reject,timer});const frame={jsonrpc:'2.0',id:requestId,method,params};writeFileSync(log,JSON.stringify({direction:'to-native',frame})+'\n',{flag:'a'});child.stdin.write(JSON.stringify(frame)+'\n');});
  request.frames=frames;request.waitForFrame=(predicate,{afterIndex=0,timeoutMs=20*60*1000}={})=>new Promise((resolve,reject)=>{for(let index=afterIndex;index<frames.length;index++)if(predicate(frames[index])){resolve({frame:frames[index],index});return;}if(closed){reject(Error('Native RPC transport is closed'));return;}const waiter={predicate,afterIndex,resolve,reject};waiter.timer=setTimeout(()=>{waiters.delete(waiter);reject(Error('Native prompt terminal deadline exceeded'));},Math.max(1,timeoutMs));waiters.add(waiter);});return request;
}
export {rpc as createProbeRpcClient};
export async function sendProbeTurn(request,sessionId,text,{timeoutMs=20*60*1000,allowAborted=false}={}){
  const afterIndex=request.frames.length,deadline=Date.now()+timeoutMs,receipt=await request('session/prompt',{sessionId,contentBlocks:[{type:'text',text}]});
  if(typeof receipt?.messageId!=='string')throw Error('Native prompt did not return its durable messageId');
  const isEvent=(frame,type)=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type===type;
  const admitted=await request.waitForFrame(frame=>isEvent(frame,'user/message')&&frame.params.event.data?.id===receipt.messageId&&frame.params.event.data?.source?.kind==='user',{afterIndex,timeoutMs:deadline-Date.now()});
  const start=request.frames.slice(afterIndex,admitted.index).filter(frame=>isEvent(frame,'turn/start')).at(-1)?.params.event;
  if(!Number.isSafeInteger(start?.data?.turn))throw Error('Actual native user message has no corresponding turn/start');
  const turn=start.data.turn,ended=await request.waitForFrame(frame=>isEvent(frame,'turn/end')&&frame.params.event.data?.turn===turn,{afterIndex:admitted.index+1,timeoutMs:deadline-Date.now()});
  const reason=ended.frame.params.event.data.reason;await request('session/wait',{sessionId});const status=request.frames.slice(afterIndex).filter(frame=>isEvent(frame,'plugin:workflow/status')&&frame.params.event.data?.turn===turn).at(-1)?.params.event.data;
  const result={messageId:receipt.messageId,sessionId,turn,startSeq:start.seq,userSeq:admitted.frame.params.event.seq,endSeq:ended.frame.params.event.seq,reason,truncated:reason?.kind==='max-tokens',...(status?{status}:{})};
  if(!['completed','max-tokens'].includes(reason?.kind)&&!allowAborted){const error=Error('Native prompt turn '+turn+' did not complete: '+JSON.stringify(reason));error.nativeTurn=result;throw error;}
  if(['completed','max-tokens'].includes(reason?.kind)&&!status){const error=Error('Completed native turn '+turn+' did not publish its matching host status');error.nativeTurn=result;throw error;}
  return result;
}
const han=/[\u3400-\u9fff]/,brokenText=/\ufffd|[ÃÂ][\u0080-\u00bf]|锟斤拷/,englishEvent=/\b(?:small\s+)?(?:technical|tech)\s+(?:exchange|meetup|discussion|gathering|forum|session)\b/i;
function bilingualParts(text){
  const chinese=[],english=[],tableRows=[];let language=null;
  for(const line of text.split(/\r?\n/)){
    if(/^\s*\|.*\|\s*$/.test(line)){const cells=line.trim().slice(1,-1).split('|').map(cell=>cell.trim());if(!cells.every(cell=>/^:?-+:?$/.test(cell)))tableRows.push(cells);continue;}
    const field=line.match(/^\s*(?:[-*]\s*)?([^:：\n]*[\u3400-\u9fff][^:：\n]*?)\s*\/\s*([A-Za-z][A-Za-z\s/&-]*)\s*[:：]\s*(.+)$/);
    if(field){const values=field[3].split(/\s+\/\s*|\s*\/\s+/),englishValue=values.length>1?values.slice(1).join(' / '):!han.test(values[0])?values[0]:null;chinese.push(field[1]+': '+values[0]);if(englishValue&&!han.test(englishValue))english.push(field[2]+': '+englishValue);continue;}
    for(const part of line.split(/\s+\/\s+/)){
      const clean=part.trim();if(!clean)continue;
      if(han.test(clean)){chinese.push(clean);language='chinese';continue;}
      const words=clean.replace(/\b[\w.+-]+@[\w.-]+\b/g,'').replace(/\b(?:UTF-?8|CRLF|BOM|RFC)\b/gi,'');
      if(/[A-Za-z]{2,}/.test(words))language='english';
      if(language==='english')english.push(clean);else if(language==='chinese')chinese.push(clean);
    }
  }
  const chineseColumn=tableRows.flatMap(row=>row.map((cell,index)=>/技术交流/.test(cell)?index:-1)).find(index=>index>=0),englishColumn=tableRows.flatMap(row=>row.map((cell,index)=>!han.test(cell)&&englishEvent.test(cell)?index:-1)).find(index=>index>=0);
  for(const row of tableRows){if(chineseColumn!==undefined&&row[chineseColumn])chinese.push(row[chineseColumn]);if(englishColumn!==undefined&&row[englishColumn]&&!han.test(row[englishColumn]))english.push(row[englishColumn]);}
  return{chinese:chinese.join('\n'),english:english.join('\n'),englishTable:englishColumn!==undefined&&tableRows.some(row=>/\b(?:time|date|venue|location|registration|deadline|contact|email)\b/i.test(row[0]??''))};
}
export function hasBasicEnglishParagraph(text){
  const {english,englishTable}=bilingualParts(text);if(!english||brokenText.test(text))return false;
  const plain=english.replace(/[*_#>]/g,'').replaceAll('：',':'),brief=englishEvent.test(plain)&&/^\s*(?:when|date(?:\s+and\s+time)?|time)\s*:/im.test(plain)&&/^\s*(?:where|venue|location)\s*:/im.test(plain)&&/^\s*(?:registration(?:\s+deadline)?|register|deadline|contact|RSVP\s+by)\s*:/im.test(plain);
  return englishTable||brief||/\b(?:please\s+)?(?:join|attend|register|sign\s+up|contact|email|send|reply|participate)\b[^\n.!?]*\b(?:by|on|at|in|before|for|to|us|the|our|a|an)\b/i.test(english)||/\b(?:we\s+(?:invite|welcome)|(?:will\s+be|is|are)\s+(?:held|scheduled|welcome|invited)|(?:takes|will\s+take)\s+place)\b/i.test(english);
}
export function inspectAnnouncementText(text,{visibleAssistantText=''}={}){
  const {chinese,english}=bilingualParts(text),missing=[];
  const fields={chinese:{event:/技术交流(?:会|活动|会议)/,date:/11\s*月\s*0?8\s*日|2026[-/]11[-/]0?8\b/,time:/14:30|下午\s*2[:：]30/,venue:/松林会议室/,deadline:/11\s*月\s*0?5\s*日|11[-/]0?5\b/,contact:/test@example\.invalid/i},english:{event:englishEvent,date:/\b(?:8(?:th)?\s+Nov(?:ember)?\.?|Nov(?:ember)?\.?\s+8(?:th)?|2026[-/]11[-/]0?8)\b/i,time:/\b14:30\b|\b2:30\s*p\.?m\.?\b/i,venue:/\b(?:Pine(?:\s+Forest)?|Songlin)\s+(?:Conference|Meeting)\s+Room\b/i,deadline:/\b(?:5(?:th)?\s+Nov(?:ember)?\.?|Nov(?:ember)?\.?\s+5(?:th)?|(?:2026[-/])?11[-/]0?5)\b/i,contact:/test@example\.invalid/i}};
  if(brokenText.test(text))missing.push('invalid-unicode');
  for(const [language,patterns]of Object.entries(fields))for(const [field,pattern]of Object.entries(patterns))if(!pattern.test(language==='chinese'?chinese:english))missing.push(language+'-'+field);
  if(!hasBasicEnglishParagraph(text))missing.push('independent-english-statement');
  const notes=text+'\n'+visibleAssistantText;if(!/UTF[-\s]?8/i.test(notes)||!/\b(?:CRLF|LF)\b/i.test(notes))missing.push('encoding-newline-note');
  return{ok:missing.length===0,missing};
}
function byteFacts(bytes){const text=bytes.toString('utf8');return{length:bytes.length,sha256:sha(bytes),bom:bytes.subarray(0,3).equals(Buffer.from([239,187,191])),crlf:(text.match(/\r\n/g)??[]).length,lf:(text.match(/(?<!\r)\n/g)??[]).length,bareCR:(text.match(/\r(?!\n)/g)??[]).length,literalCRLF:(text.match(/\\r\\n/g)??[]).length};}
function promisedFormat(option){
  const text=option?.description??'',claims=[];
  for(let clause of text.split(/[。;；，,\n]|\.(?=\s|$)/)){
    const original=/\b(?:original|input|source\s+(?:file|text|bytes|document)|existing\s+(?:file|text|bytes))\b|原(?:始)?(?:输入|文件|文档|稿)/i.test(clause),output=/\b(?:new|output|draft)\b|announcement\.md|新(?:文件|稿)|输出|产物/i.test(clause);
    if(original&&!output)continue;
    clause=clause.replace(/(?:rather\s+than|instead\s+of|not|而不是|而非|不是|非)\s*\b(?:CRLF|LF)\b/gi,'');
    claims.push(...(clause.match(/\b(?:CRLF|LF)\b/gi)??[]).map(value=>value.toUpperCase()));
  }
  const unique=[...new Set(claims)];return{newline:unique.length>1?'ambiguous':unique[0]??null,noBom:/\bno\s+BOM\b|\bwithout\s+(?:a\s+)?BOM\b|无\s*BOM|不带\s*BOM/i.test(text)};
}
export function visibleDraftText(frames,{sessionId,turn,afterSeq=0,endSeq=Infinity}){return frames.filter(frame=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type==='assistant/message'&&frame.params.event.seq>afterSeq&&frame.params.event.seq<=endSeq&&frame.params.event.data?.turn<=turn&&frame.params.event.data.message?.source?.kind==='model').flatMap(frame=>frame.params.event.data.message.content.filter(block=>block.type==='text').map(block=>block.text)).join('\n');}
export function inspectDraftEvidence({input,expectedInputSha256,output,selectedOption,requiredFormat,visibleAssistantText=''}){
  const bytes=byteFacts(output),inputBytes=byteFacts(input),format=requiredFormat??promisedFormat(selectedOption),missing=[];
  if(inputBytes.sha256!==expectedInputSha256)missing.push('original-input-changed');let text='';try{text=new TextDecoder('utf8',{fatal:true}).decode(output);}catch{missing.push('invalid-utf8');}
  if(text)missing.push(...inspectAnnouncementText(text,{visibleAssistantText}).missing);
  if(bytes.length<80||bytes.length>20000)missing.push('artifact-size');
  if(format.newline==='CRLF'&&(!bytes.crlf||bytes.lf||bytes.bareCR))missing.push('selected-newline-CRLF');
  if(format.newline==='LF'&&(!bytes.lf||bytes.crlf||bytes.bareCR))missing.push('selected-newline-LF');
  if(format.newline==='ambiguous')missing.push('selected-newline-ambiguous');
  if(bytes.literalCRLF&&!bytes.crlf)missing.push('literal-escaped-newlines');
  if(format.noBom&&bytes.bom)missing.push('selected-no-BOM');
  const notes=text+'\n'+visibleAssistantText,actualNewline=bytes.crlf&&!bytes.lf&&!bytes.bareCR?'CRLF':bytes.lf&&!bytes.crlf&&!bytes.bareCR?'LF':null;
  if(actualNewline&&!new RegExp('\\b'+actualNewline+'\\b','i').test(notes))missing.push('actual-newline-explanation-missing');
  return{ok:missing.length===0,fatal:missing.includes('original-input-changed'),missing:[...new Set(missing)],bytes,inputBytes,requiredFormat:format,actualNewline};
}
export async function runDraftFeedback({current,outputPath,send,getCards,inspect,saveAttempt=()=>{},verifyAccepted=()=>{},feedback=[],maxRevisions=2,maxContinuations=4}){
  const sessionId=current.sessionId;let revisions=0,continuations=0,selectedOption,requiredFormat,initialChoiceId;
  const sendSame=async text=>{const next=await send(text);if(next.sessionId!==sessionId)throw Error('External feedback left the original live session');return next;};
  const continueSame=async reason=>{if(continuations>=maxContinuations)throw Error('Same-session truncation continuation limit reached without readiness');feedback.push({kind:'continuation',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,reason,stage:current.status?.stage,command:'/workflow status'});continuations++;current=await sendSame('/workflow status');};
  const settle=async afterAccept=>{if(current.reason?.kind!=='max-tokens')return;while(afterAccept?(current.reason?.kind==='max-tokens'||current.status?.complete!==true):!['selection','feedback'].includes(current.status?.stage)){if(current.status?.failed||current.status?.status==='blocked'||['aborted','error'].includes(current.reason?.kind))throw Error('Native workflow cannot recover a genuine failure');await continueSame('max-tokens left current task unfinished');}};
  while(true){
    await settle(false);
    if(current.status?.failed||current.status?.status==='blocked')throw Error('Native workflow is blocked: '+JSON.stringify(current.status));
    if(current.status?.stage==='selection'){
      const scope=getCards().filter(card=>card.kind==='checkpoint'&&card.report?.stage==='scope'&&card.result?.ok===true&&(card.seq??0)<=(current.endSeq??Infinity)).at(-1);
      const options=getCards().filter(card=>card.kind==='options'&&(card.seq??Infinity)>(scope?.seq??0)&&(card.seq??0)<=(current.endSeq??Infinity)).at(-1)?.options;
      if(!Array.isArray(options)||options.length<3||options.length>5||options.some(option=>JSON.stringify(option.artifacts)!==JSON.stringify([outputPath]))){if(current.reason?.kind==='max-tokens'){await continueSame('max-tokens interrupted actual option publication');continue;}throw Error('The real model did not present a current acceptable actual plan card');}
      const compatible=options.filter(option=>promisedFormat(option).newline!=='ambiguous'&&(!requiredFormat?.newline||!promisedFormat(option).newline||promisedFormat(option).newline===requiredFormat.newline));
      selectedOption=compatible.find(option=>option.id===initialChoiceId)??compatible[0];if(!selectedOption)throw Error('Current options do not preserve the actual previously selected newline commitment');
      initialChoiceId??=selectedOption.id;requiredFormat??=promisedFormat(selectedOption);
      const choice={kind:'choice',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,command:'/workflow choose '+selectedOption.id,observedOptions:options,requiredFormat};feedback.push(choice);current=await sendSame(choice.command);await settle(false);
    }
    if(current.status?.stage!=='feedback')throw Error('The selected real model stopped at '+current.status?.stage+' instead of presenting a reviewable feedback-stage draft');
    const check=await inspect(current,selectedOption,requiredFormat);await saveAttempt({...check,attempt:revisions,turn:current.turn,sessionId});
    if(check.fatal)throw Error('Independent fatal artifact check: '+check.missing.join(', '));
    if(check.ok){
      const accepted={kind:'accept',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,command:'/workflow accept',artifactSha256:check.bytes.sha256,reason:'Independent current bilingual facts, selected format, visible explanation and protected-input checks passed; not human editorial approval'};feedback.push(accepted);current=await sendSame(accepted.command);await settle(true);await verifyAccepted(check);
      const cards=getCards().filter(card=>card.kind==='checkpoint'&&card.result?.ok===true),last=cards.at(-1)?.report,finalCards=cards.filter(card=>card.report?.task===last?.task&&card.report?.revision===last?.revision),stages=finalCards.map(card=>card.report.stage);
      if(current.status?.complete!==true||JSON.stringify(stages)!==JSON.stringify(['scope','discovery','selection','draft','feedback','delivery','learning']))throw Error('Real model chain stopped without the final revision ordered seven-stage host cards');
      return{current,artifact:check.bytes,stages,finalRevision:last.revision,stageTimeline:cards.map(card=>({seq:card.seq,task:card.report.task,revision:card.report.revision,stage:card.report.stage})),revisions,continuations};
    }
    if(revisions>=maxRevisions)throw Error('Independent draft check still fails after '+maxRevisions+' complete revisions: '+check.missing.join(', '));
    const raw=check.writeEvidence?` The original native workflow_write arguments were ${JSON.stringify(check.writeEvidence)}; ${check.writeEvidence.matchesActualOutput?'the actual output exactly matches the submitted content, so no host newline conversion is shown.':'only a verified byte difference can support attribution.'}`:'';
    const newlineHelp=check.missing.some(value=>/newline|literal/.test(value))?' JSON工具参数中的content需要真实换行：JSON wire里每个CRLF仅用一层转义（U+005C r、U+005C n），经JSON解析后必须成为U+000D/U+000A；不要双重转义成字面量反斜杠r/n。真正CRLF是字节0D 0A，字面量则是5C 72 5C 6E。提交后实际读回并统计crlf/lf/literalCRLF，原参数与落盘相同不得归咎宿主。':'';
    const command=`独立外部技术反馈（测试driver，非真人审美认可）：当前 ${outputPath} 未通过，缺项 ${check.missing.join(', ')}。实际当前输出字节 ${JSON.stringify(check.bytes)}。已选方案的输出承诺 ${JSON.stringify(requiredFormat)}。${raw}${newlineHelp} 请实际修正这些差异，不得仅口头说明或改称验收通过；保持中英文全部事实、原输入字节与相同输出路径。此真实反馈会由生产宿主重开 scope、清除旧来源/安装/核验事实：请按真实 state 重新发现、完整核读确认并安装、观察参考，再提出3–5个保持上述输出承诺且 artifacts 仍仅为 ["${outputPath}"] 的方案，等待实际 /workflow choose；选中后提交修好的当前草稿、重新独立结构验证并等待实际 /workflow accept。`;
    feedback.push({kind:'correction',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,command,missing:check.missing,artifactSha256:check.bytes.sha256});revisions++;current=await sendSame(command);
  }
}
export function summarizeProbeRecords(records){
  const usages=new Map();for(const record of records){if(record.event==='model_chunk'&&record.chunk?.type==='usage')usages.set(record.request,record.chunk.usage);if(record.event==='provider_usage')usages.set(record.request,record.usage);}
  const usage={inputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:0,totalTokens:0,inputContextTokens:0};let maximumInputContextTokens=0;
  for(const actual of usages.values()){for(const key of Object.keys(usage))if(key!=='inputContextTokens'&&Number.isFinite(actual[key]))usage[key]+=actual[key];const context=(actual.inputTokens??0)+(actual.cacheReadTokens??0)+(actual.cacheWriteTokens??0);usage.inputContextTokens+=context;maximumInputContextTokens=Math.max(maximumInputContextTokens,context);}
  return{observedRequests:records.filter(x=>x.event==='request_observed').length,actualModelRequests:records.filter(x=>x.event==='model_request').length,lastObservedBudget:records.filter(x=>x.event==='request_observed').at(-1)?.budget??null,refusals:records.filter(x=>x.event==='budget_refused'),usage,maximumInputContextTokens,usageBasis:'Official provider adapter usage including cache hits; JSON bytes are a separate process guard, not billable tokens'};
}
function validDryWitness(dry,binding){return dry.status==='dry-run-pass'&&dry.providerCalls===0&&dry.nextCalls===0&&dry.sourceUnchanged===true&&dry.observed?.valid===true&&dry.observed.nativeIdentity===true&&dry.observed.provider==='deepseek-official'&&dry.observed.model==='deepseek-flash'&&dry.observed.maxTokens===binding.maxTokens&&dry.maxTokensBound===binding.maxTokens&&dry.maxRequests===binding.maxRequests&&dry.maxCumulativeInputBytes===binding.maxCumulativeInputBytes&&dry.maxRequestInputBytes===binding.maxRequestInputBytes&&dry.observed.budget?.maxCumulativeInputBytes===binding.maxCumulativeInputBytes&&dry.observed.budget?.maxRequestInputBytes===binding.maxRequestInputBytes&&JSON.stringify(dry.sourceBefore)===JSON.stringify(binding.sourceSnapshot)&&JSON.stringify([...dry.observed.toolNames].sort())===JSON.stringify([...binding.expectedToolNames].sort());}
export async function runPreparedRealModelProbe(planFile,{dryRun=false}={}){
  const plan=JSON.parse(readFileSync(planFile,'utf8'));
  if(plan.format!==2||plan.mode!==(dryRun?'dry-run':'paid'))throw Error('Use a dry-run candidate only for dry-run; paid execution requires a separately prepared fresh paid plan');
  const {config,verifyInstallation}=await owner(plan.ownerConfigFile);
  if(!dryRun){const bytes=readFileSync(plan.dryRunEvidence?.path);if(sha(bytes)!==plan.dryRunEvidence.sha256||!validDryWitness(JSON.parse(bytes),plan)||JSON.parse(bytes).root===plan.root)throw Error('Valid independent dry-run evidence and a fresh paid state are required');}
  if(!Object.hasOwn(process.env,'DEEPSEEK_API_KEY'))throw Error('The real provider environment key is not present');
  const payload=config.integrity.payloadRoot,before=snapshot(payload);if(JSON.stringify(before)!==JSON.stringify(plan.sourceSnapshot))throw Error('Prepared source snapshot changed; prepare a new plan without a model call');
  const {spawnGuardedDsh}=await import(pathToFileURL(join(payload,'hosts/dsh-global/launcher.mjs')).href),events=[];let run;const feedback=[];
  const report={kind:dryRun?'free-native-first-request':'real-model-production-generic-conversation',root:plan.root,status:'blocked',maxTokensBound:plan.maxTokens,maxRequests:plan.maxRequests,maxCumulativeInputBytes:plan.maxCumulativeInputBytes,maxRequestInputBytes:plan.maxRequestInputBytes,promptTimeoutMs:plan.promptTimeoutMs,nativeTurns:[],humanApproval:false,designApproval:false,sourceBefore:before,uncovered:['No human editorial approval','No automatically updated runtime Skill','Structural artifact validation does not prove general semantic correctness']};
  writeFileSync(join(plan.privateRoot,dryRun?'dry-run-started.json':'paid-run-started.json'),JSON.stringify({startedAt:new Date().toISOString()}),{flag:'wx'});
  try{
    run=await spawnGuardedDsh({config,profile:plan.profile,appArgs:[],workspace:plan.workspace,verifyInstallation,stdio:['pipe','pipe','pipe'],onEvent:event=>{events.push(event);writeFileSync(join(plan.privateRoot,'host-events.jsonl'),JSON.stringify(event)+'\n',{flag:'a'});}});
    run.child.stderr.on('data',bytes=>writeFileSync(join(plan.privateRoot,'native-stderr.txt'),bytes,{flag:'a'}));const request=rpc(run.child,join(plan.privateRoot,'native-wire.jsonl'));
    await request('initialize',{cwd:plan.workspace,provider:'deepseek-official',model:'deepseek-flash',maxTokens:plan.maxTokens});
    const sessionId='ordinary-real-model';const send=async text=>{try{const result=await sendProbeTurn(request,sessionId,text,{timeoutMs:plan.promptTimeoutMs,allowAborted:dryRun});report.nativeTurns.push(result);return result;}catch(error){if(error.nativeTurn)report.nativeTurns.push(error.nativeTurn);throw error;}};const nativeCards=()=>request.frames.filter(frame=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type==='plugin:workflow/card').map(frame=>({...frame.params.event.data,seq:frame.params.event.seq}));
    const initialTurn=await send(plan.task);
    if(dryRun){const records=readFileSync(plan.monitorFile,'utf8').trim().split('\n').map(JSON.parse),observed=records.filter(entry=>entry.event==='request_observed'),stop=records.find(entry=>entry.event==='dry_run_stop');if(observed.length!==1||observed[0].valid!==true||observed[0].maxTokens!==plan.maxTokens||!stop||records.some(entry=>['model_request','model_chunk'].includes(entry.event)))throw Error('Actual first native request did not pass the zero-provider dry-run check');report.status='dry-run-pass';report.observed=observed[0];report.providerCalls=stop.providerCalls;report.nextCalls=stop.nextCalls;await request('shutdown',{});report.nativeOutcome=await run.finished;return report;}
    report.artifactChecks=[];let latestOutput;
    const result=await runDraftFeedback({current:initialTurn,outputPath:plan.output,send,getCards:nativeCards,feedback,
      inspect:(current,selectedOption,requiredFormat)=>{
        const input=readFileSync(join(plan.workspace,plan.input.path));latestOutput=readFileSync(join(plan.workspace,plan.output));
        const writeFrame=request.frames.filter(frame=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type==='tool/call'&&frame.params.event.data?.turn===current.turn&&frame.params.event.data.name==='workflow_write').filter(frame=>{try{const args=typeof frame.params.event.data.arguments==='string'?JSON.parse(frame.params.event.data.arguments):frame.params.event.data.arguments;return args.path===plan.output;}catch{return false;}}).at(-1);
        const scope=nativeCards().filter(card=>card.kind==='checkpoint'&&card.report?.stage==='scope'&&card.result?.ok===true&&card.seq<=current.endSeq).at(-1);if(!scope)throw Error('Current native revision has no trusted scope checkpoint');
        const visibleAssistantText=visibleDraftText(request.frames,{sessionId,turn:current.turn,afterSeq:scope.seq,endSeq:current.endSeq});
        const check=inspectDraftEvidence({input,expectedInputSha256:plan.input.sha256,output:latestOutput,selectedOption,requiredFormat,visibleAssistantText});
        if(writeFrame){const event=writeFrame.params.event,args=typeof event.data.arguments==='string'?JSON.parse(event.data.arguments):event.data.arguments;check.writeEvidence={eventSeq:event.seq,turn:event.data.turn,arguments:byteFacts(Buffer.from(args.content,'utf8')),matchesActualOutput:sha(Buffer.from(args.content,'utf8'))===check.bytes.sha256};}
        return{...check,visibleAssistantText,notesWindow:{scopeSeq:scope.seq,draftEndSeq:current.endSeq},selectedOptionId:selectedOption.id};
      },
      saveAttempt:check=>{const rawOutputPath=join(plan.privateRoot,'draft-attempt-'+check.attempt+'.bin');writeFileSync(rawOutputPath,latestOutput,{flag:'wx'});report.artifactCheck=check;report.artifactChecks.push({...check,rawOutputPath});},
      verifyAccepted:check=>{const input=readFileSync(join(plan.workspace,plan.input.path)),output=readFileSync(join(plan.workspace,plan.output));report.finalInput=byteFacts(input);if(sha(input)!==plan.input.sha256||sha(output)!==check.bytes.sha256)throw Error('Protected input or reviewed artifact bytes changed during actual acceptance');}
    });
    report.status='pass';report.final=result.current.status;report.stages=result.stages;report.finalRevision=result.finalRevision;report.stageTimeline=result.stageTimeline;report.revisions=result.revisions;report.continuations=result.continuations;report.artifact={path:plan.output,bytes:result.artifact.length,sha256:result.artifact.sha256,crlf:result.artifact.crlf,lf:result.artifact.lf,bom:result.artifact.bom};await request('shutdown',{});report.nativeOutcome=await run.finished;
  }catch(error){report.error=error.message;if(run?.child.exitCode===null)run.child.kill();}
  finally{if(existsSync(plan.monitorFile)){try{report.monitor=summarizeProbeRecords(readFileSync(plan.monitorFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));}catch(error){report.monitorReadError=error.message;report.status='blocked';}}report.feedback=feedback;report.sourceAfter=snapshot(payload);report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(!report.sourceUnchanged)report.status='blocked';writeFileSync(join(plan.root,dryRun?'dry-run-report.json':'real-model-report.json'),JSON.stringify(report,null,2));}
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(['--run','--dry-run'].includes(args[0])){const dryRun=args[0]==='--dry-run',result=await runPreparedRealModelProbe(resolve(args[1]),{dryRun});process.stdout.write(JSON.stringify({status:result.status,report:resolve(dirname(args[1]),dryRun?'dry-run-report.json':'real-model-report.json')})+'\n');process.exitCode=['pass','dry-run-pass'].includes(result.status)?0:2;}
  else{const ownerIndex=args.indexOf('--owner-config'),dryIndex=args.indexOf('--verified-dry-run');if(ownerIndex<0)throw Error('Prepare only: --owner-config <trusted base owner file>; dry-run and paid run are separate commands');const plan=await prepareRealModelProbe({baseOwnerConfigPath:resolve(args[ownerIndex+1]),...(dryIndex>=0?{verifiedDryRunReport:resolve(args[dryIndex+1])}:{})});process.stdout.write(JSON.stringify({status:'prepared-no-model-call',mode:plan.mode,plan:join(plan.root,'probe-plan.json')})+'\n');}
}
