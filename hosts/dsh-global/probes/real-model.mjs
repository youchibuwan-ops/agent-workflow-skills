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
  writeFileSync(join(skill,'SKILL.md'),'---\nname: technical-announcement-editing\ndescription: Revise factual bilingual announcements while preserving original input bytes and complete factual fields.\nlicense: MIT\n---\n# Technical announcement editing test method\n\nThis is an explicit local test Skill, not an independently reviewed external publication.\n\nRead the actual input first. Identify event, date, time, venue, registration deadline and contact. Do not invent missing facts. Offer 3–5 supported editorial plans with the exact output path. Compare two primary technical references for the UTF-8/newline note; read and confirm their full source bytes before citing. Wait for the external choice. Write a new bilingual announcement; retain every factual field and leave original input bytes untouched. Explain encoding/newline decisions briefly without claiming that a structural validator proves semantic correctness. Validate the actual output, present the draft, wait for external feedback, and state any genuine reusable learning or bounded no-increment decision.\n\nJSON write method: workflow_write accepts ordinary real LF line breaks in its content JSON string and an optional newline argument. When the actually selected output plan promises CRLF, set newline to CRLF; for an LF promise, set newline to LF. This explicitly converts only actual ASCII line breaks; it never unescapes literal backslash-r/backslash-n or adds/removes a BOM. Omitting newline or setting preserve keeps decoded content bytes unchanged. If manually writing CRLF, escape it once on the JSON wire so parsing yields actual U+000D/U+000A rather than literal U+005C-r/U+005C-n. Read back actual bytes and compare raw content with the independently expected declared-normalized bytes and CRLF/LF/literal counts before attributing any unexplained change to the host. This method requires no Python process or extra permission.\n');
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
    // Normalize emphasis in the label-recognition copy only. Neither value
    // text nor the original artifact bytes are rewritten.
    const fieldLine=line.replace(/^([^:：\n]*)([:：])/,(_match,label,colon)=>label.replace(/\*\*|__/g,'')+colon);
    const field=fieldLine.match(/^\s*(?:[-*]\s*)?([^:：\n]*[\u3400-\u9fff][^:：\n]*?)\s*\/\s*([A-Za-z][A-Za-z\s/&-]*)\s*[:：]\s*(.+)$/);
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
  const plain=english.replace(/[*_#>]/g,'').replaceAll('：',':'),brief=englishEvent.test(plain)&&/^\s*(?:when|date(?:\s*(?:and|&)\s*time)?|time)\s*:/im.test(plain)&&/^\s*(?:where|venue|location)\s*:/im.test(plain)&&/^\s*(?:registration(?:\s+deadline)?|register|deadline|contact(?:\s+email)?|RSVP\s+by)\s*:/im.test(plain);
  return englishTable||brief||/\b(?:please\s+)?(?:join|attend|register|sign\s+up|contact|email|send|reply|participate)\b[^\n.!?]*\b(?:by|on|at|in|before|for|to|us|the|our|a|an)\b/i.test(english)||/\b(?:we\s+(?:invite|welcome)|(?:will\s+be|is|are)\s+(?:held|scheduled|welcome|invited)|(?:takes|will\s+take)\s+place)\b/i.test(english);
}
function noticeYearProblems(text){
  const yearsFor=day=>{
    const suffix='(?:[ ,]*(?:[（(][ \\t]*)?(?:year[ \\t]*[:：]?[ \\t]*)?(\\d{4})\\b[ \\t]*[）)]?)?';
    const years=[];for(const pattern of [new RegExp('(\\d{4})\\s*年\\s*11\\s*月\\s*0?'+day+'\\s*日','g'),new RegExp('\\b(\\d{4})[-/]11[-/]0?'+day+'\\b','g'),new RegExp('\\b(?:(\\d{4})\\s+)?'+day+'(?:th)?\\s+Nov(?:ember)?\\.?'+suffix,'gi'),new RegExp('\\b(?:(\\d{4})\\s+)?Nov(?:ember)?\\.?\\s+'+day+'(?:th)?'+suffix,'gi')])for(const match of text.matchAll(pattern))years.push(...match.slice(1).filter(Boolean).map(Number));return years;
  };
  const activity=yearsFor(8),deadline=yearsFor(5),shared=[];
  for(const line of text.split(/\r\n|\r|\n/)){
    const labeled=line.match(/(?:年份|年度|year)(?:\s*\/\s*(?:年份|年度|year))?\s*[:：]\s*(\d{4})\b/i);if(labeled)shared.push(Number(labeled[1]));
    if(/技术交流(?:会|活动|会议)/.test(line)||englishEvent.test(line)){
      // A year in an event heading can be shared by both language blocks.
      // An unrelated dated reference/footer cannot supply the activity year.
      const heading=line.replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g,'');
      shared.push(...(heading.match(/\b\d{4}\b/g)??[]).map(Number));
    }
  }
  const missing=[];if(![...activity,...shared].includes(2026))missing.push('activity-year-2026-missing');if([...activity,...deadline,...shared].some(year=>year!==2026))missing.push('activity-or-deadline-year-conflict');return missing;
}
export function inspectAnnouncementText(text,{visibleAssistantText=''}={}){
  const {chinese,english}=bilingualParts(text),missing=[];
  const fields={chinese:{event:/技术交流(?:会|活动|会议)/,date:/11\s*月\s*0?8\s*日|2026[-/]11[-/]0?8\b/,time:/14:30|下午\s*2[:：]30/,venue:/松林会议室/,deadline:/11\s*月\s*0?5\s*日|11[-/]0?5\b/,contact:/test@example\.invalid/i},english:{event:englishEvent,date:/\b(?:8(?:th)?\s+Nov(?:ember)?\.?|Nov(?:ember)?\.?\s+8(?:th)?|2026[-/]11[-/]0?8)\b/i,time:/\b14:30\b|\b2:30\s*p\.?m\.?\b/i,venue:/\b(?:Pine(?:\s+Forest)?|Songlin)\s+(?:Conference|Meeting)\s+Room\b/i,deadline:/\b(?:5(?:th)?\s+Nov(?:ember)?\.?|Nov(?:ember)?\.?\s+5(?:th)?|(?:2026[-/])?11[-/]0?5)\b/i,contact:/test@example\.invalid/i}};
  if(brokenText.test(text))missing.push('invalid-unicode');
  for(const [language,patterns]of Object.entries(fields))for(const [field,pattern]of Object.entries(patterns))if(!pattern.test(language==='chinese'?chinese:english))missing.push(language+'-'+field);
  missing.push(...noticeYearProblems(text));
  if(!hasBasicEnglishParagraph(text))missing.push('independent-english-statement');
  const notes=text+'\n'+visibleAssistantText;if(!/UTF[-\s]?8/i.test(notes)||!/\b(?:CRLF|LF)\b/i.test(notes))missing.push('encoding-newline-note');
  return{ok:missing.length===0,missing};
}
function byteFacts(bytes){const text=bytes.toString('utf8');return{length:bytes.length,sha256:sha(bytes),bom:bytes.subarray(0,3).equals(Buffer.from([239,187,191])),crlf:(text.match(/\r\n/g)??[]).length,lf:(text.match(/(?<!\r)\n/g)??[]).length,bareCR:(text.match(/\r(?!\n)/g)??[]).length,literalCRLF:(text.match(/\\r\\n/g)??[]).length};}
export function inspectWriteEvidence(args,output){
  if(typeof args?.content!=='string')throw Error('Native workflow_write content must be a string');
  const newline=Object.hasOwn(args,'newline')?args.newline:'preserve';if(!['preserve','LF','CRLF'].includes(newline))throw Error('Unknown native workflow_write newline declaration');
  // Independent oracle: successive split/join passes, never the production
  // materializer. Only actual ASCII newlines change; BOM and literal escapes stay.
  const expected=newline==='preserve'?args.content:args.content.split('\r\n').join('\n').split('\r').join('\n').split('\n').join(newline==='CRLF'?'\r\n':'\n');
  const rawBytes=Buffer.from(args.content,'utf8'),expectedBytes=Buffer.from(expected,'utf8'),actualBytes=Buffer.from(output);
  return{newline,normalizationRequested:Object.hasOwn(args,'newline'),arguments:byteFacts(rawBytes),declaredOutput:byteFacts(expectedBytes),actualOutput:byteFacts(actualBytes),matchesRawActual:rawBytes.equals(actualBytes),matchesDeclaredOutput:expectedBytes.equals(actualBytes)};
}
export function collectWriteEvidence(frames,{sessionId,turn,afterSeq=0,endSeq=Infinity,path,output}){
  const events=frames.filter(frame=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.seq>afterSeq&&frame.params.event.seq<=endSeq&&frame.params.event.data?.turn<=turn).map(frame=>frame.params.event),writeCalls=[],successful=[];
  for(const call of events.filter(event=>event.type==='tool/call'&&event.data.name==='workflow_write')){
    let args;try{args=typeof call.data.arguments==='string'?JSON.parse(call.data.arguments):call.data.arguments;}catch{continue;}if(args?.path!==path)continue;
    const callId=call.data.callId,record={callId:callId??null,eventSeq:call.seq,turn:call.data.turn,outcome:'unconfirmed'};
    const matches=typeof callId==='string'&&callId?events.filter(event=>event.type==='tool/result'&&event.seq>call.seq&&event.data.turn===call.data.turn&&event.data.message?.toolCallId===callId&&event.data.message.source?.kind==='tool'&&event.data.message.source.callId===callId):[];
    if(matches.length===1){
      const result=matches[0],message=result.data.message;record.resultSeq=result.seq;
      if(message.isError!==false)record.outcome='native-error';
      else{let body;try{if(message.content?.length!==1||message.content[0].type!=='text')throw Error('Not an exact result');body=JSON.parse(message.content[0].text);}catch{record.outcome='unreadable-result';}
        if(body?.ok===false){record.outcome='refused';record.error=body.error??null;}
        else if(body?.ok===true){record.outcome='successful';successful.push({...record,...inspectWriteEvidence(args,output),...(body.data?.normalization?{reportedNormalization:body.data.normalization}:{})});}
      }
    }
    writeCalls.push(record);
  }
  return{writeEvidence:successful.sort((a,b)=>a.resultSeq-b.resultSeq).at(-1)??null,writeCalls};
}
function promisedFormat(option){
  const text=option?.description??'',claims=[];
  for(let clause of text.split(/[。;；，,\n]|\.(?=\s|$)/)){
    const original=/\b(?:original|input|source\s+(?:file|text|bytes|document)|existing\s+(?:file|text|bytes))\b|原(?:始)?(?:输入|文件|文档|稿)/i.test(clause),output=/\b(?:new|output|draft)\b|announcement\.md|新(?:文件|稿)|输出|产物/i.test(clause);
    if(original&&!output)continue;
    // These are readback measurements, not output-format alternatives. R21's
    // actual plan promised CRLF but contained the erroneous counter crlf=lf.
    clause=clause.replace(/\b(?:crlf|lf|bareCR|literalCRLF)\s*(?:==?|[<>]=?|!=)\s*(?:\b(?:crlf|lf|bareCR|literalCRLF)\b|\d+)/gi,'');
    clause=clause.replace(/(?:rather\s+than|instead\s+of|not|而不是|而非|不是|非)\s*\b(?:CRLF|LF)\b/gi,'');
    claims.push(...(clause.match(/\b(?:CRLF|LF)\b/gi)??[]).map(value=>value.toUpperCase()));
  }
  const unique=[...new Set(claims)];return{newline:unique.length>1?'ambiguous':unique[0]??null,noBom:/\bno\s+BOM\b|\bwithout\s+(?:a\s+)?BOM\b|无\s*BOM|不带\s*BOM/i.test(text)};
}
function currentDraftBoundary(frames,{sessionId,afterSeq=0,endSeq=Infinity}){return frames.reduce((boundary,frame)=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type==='plugin:workflow/card'&&frame.params.event.data?.kind==='revision'&&frame.params.event.data.stage==='draft'&&frame.params.event.seq>boundary&&frame.params.event.seq<=endSeq?frame.params.event.seq:boundary,afterSeq);}
export function visibleDraftText(frames,{sessionId,turn,afterSeq=0,endSeq=Infinity}){afterSeq=currentDraftBoundary(frames,{sessionId,afterSeq,endSeq});return frames.filter(frame=>frame.method==='session.event'&&frame.params?.sessionId===sessionId&&frame.params.event?.type==='assistant/message'&&frame.params.event.seq>afterSeq&&frame.params.event.seq<=endSeq&&frame.params.event.data?.turn<=turn&&frame.params.event.data.message?.source?.kind==='model').flatMap(frame=>frame.params.event.data.message.content.filter(block=>block.type==='text').map(block=>block.text)).join('\n');}
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
function completedStageLineage(cards) {
  const stages=['scope','discovery','selection','draft','feedback','delivery','learning'];
  const checkpoints=cards.filter(card=>card.kind==='checkpoint'&&card.result?.ok===true),task=checkpoints.at(-1)?.report?.task;
  let revision,cursor=0,started=false;const accepted=[];
  const invalid=()=>{throw Error('Real model chain lacks an ordered seven-stage host checkpoint lineage');};
  for(const card of cards) {
    if(card.kind==='revision'&&started) {
      if(card.stage!=='draft'||card.revision!==revision+1||card.selection_retained!==true||card.discovery_retained!==true||accepted.length<3)invalid();
      revision=card.revision;cursor=3;accepted.length=3;continue;
    }
    if(card.kind!=='checkpoint'||card.result?.ok!==true||card.report?.task!==task)continue;
    const report=card.report;
    if(!Number.isSafeInteger(report.revision)||report.revision<1)invalid();
    if(!started||report.revision!==revision) {
      // A scope reopen can establish a fresh full chain; a partial suffix needs
      // the explicit native retention card handled above, never an inferred merge.
      if(report.stage!=='scope'||started&&report.revision<=revision)invalid();
      revision=report.revision;cursor=0;accepted.length=0;started=true;
    }
    if(report.stage!==stages[cursor])invalid();
    accepted.push(card);cursor++;
  }
  if(cursor!==stages.length)invalid();
  return {stages:accepted.map(card=>card.report.stage),finalRevision:revision,
    stageTimeline:checkpoints.map(card=>({seq:card.seq,task:card.report.task,revision:card.report.revision,stage:card.report.stage}))};
}
export async function runDraftFeedback({current,outputPath,send,getCards,inspect,saveAttempt=()=>{},verifyAccepted=()=>{},feedback=[],maxRepeatedFailures=4,maxContinuations=128}){
  if(!Number.isSafeInteger(maxRepeatedFailures)||maxRepeatedFailures<1)throw Error('A bounded repeated-failure guard is required');
  if(!Number.isSafeInteger(maxContinuations)||maxContinuations<1)throw Error('Continuation limit must be a positive safe integer');
  const sessionId=current.sessionId;let revisions=0,continuations=0,selectedOption,requiredFormat,initialChoiceId,lastFailure,repeatedFailures=0;
  const noteFailure=(kind,details)=>{const signature=JSON.stringify({kind,details});repeatedFailures=signature===lastFailure?repeatedFailures+1:1;lastFailure=signature;if(repeatedFailures>maxRepeatedFailures)throw Error('Repeated identical independent '+kind+' failure without progress: '+JSON.stringify(details));};
  const sendSame=async text=>{const next=await send(text);if(next.sessionId!==sessionId)throw Error('External feedback left the original live session');return next;};
  const continueSame=async reason=>{if(continuations>=maxContinuations)throw Error('Same-session truncation continuation limit reached without readiness');feedback.push({kind:'continuation',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,reason,stage:current.status?.stage,command:'/workflow status'});continuations++;current=await sendSame('/workflow status');};
  const settle=async afterAccept=>{if(current.reason?.kind!=='max-tokens')return;while(afterAccept?(current.reason?.kind==='max-tokens'||current.status?.complete!==true):!['selection','feedback'].includes(current.status?.stage)){if(current.status?.failed||current.status?.status==='blocked'||['aborted','error'].includes(current.reason?.kind))throw Error('Native workflow cannot recover a genuine failure');await continueSame('max-tokens left current task unfinished');}};
  while(true){
    await settle(false);
    if(['aborted','error'].includes(current.reason?.kind))throw Error('Native workflow cannot recover a genuine failure: '+JSON.stringify(current.reason));
    if(current.status?.failed||current.status?.status==='blocked')throw Error('Native workflow is blocked: '+JSON.stringify(current.status));
    if(current.status?.stage==='selection'){
      const scope=getCards().filter(card=>card.kind==='checkpoint'&&card.report?.stage==='scope'&&card.result?.ok===true&&(card.seq??0)<=(current.endSeq??Infinity)).at(-1);
      const options=getCards().filter(card=>card.kind==='options'&&(card.seq??Infinity)>(scope?.seq??0)&&(card.seq??0)<=(current.endSeq??Infinity)).at(-1)?.options;
      const validOptions=Array.isArray(options)&&options.length>=3&&options.length<=5&&options.every(option=>JSON.stringify(option.artifacts)===JSON.stringify([outputPath]));
      if(!validOptions&&current.reason?.kind==='max-tokens'){await continueSame('max-tokens interrupted actual option publication');continue;}
      const compatible=validOptions?options.filter(option=>promisedFormat(option).newline!=='ambiguous'&&(!requiredFormat?.newline||!promisedFormat(option).newline||promisedFormat(option).newline===requiredFormat.newline)):[];
      selectedOption=compatible.find(option=>option.id===initialChoiceId)??compatible[0];
      if(!selectedOption){
        const missing=[validOptions?'selected-format-option-regression':'current-plan-card-invalid'];noteFailure('options',{missing,options:options??null,requiredFormat:requiredFormat??null});
        const commitment=requiredFormat?`之前实际选中的输出承诺仍是 ${JSON.stringify(requiredFormat)}，不能加入矛盾格式或改输出路径。`:'此前尚未实际选择任何方案，不要编造已有格式承诺；请给出符合原任务且无矛盾的清楚说明。';
        const measurements=requiredFormat?.newline==='CRLF'?'已选 CRLF 的正确读回标准是 crlf>0、lf=0、bareCR=0、literalCRLF=0。':'';
        const command=`独立外部技术反馈（测试driver，非真人审美认可）：当前真实方案缺项 ${missing.join(', ')}。当前方案原文 ${JSON.stringify(options??null)}。${commitment}读回计量字段 crlf/lf 不是新的换行许可。${measurements}保持原业务目标、中英全部事实与原输入字节，输出仍仅 ["${outputPath}"]。此反馈会由生产宿主重开 scope：请按实际 state 重新核读确认来源并安装，重新发出3–5个保留原约定的真实方案，等待实际 /workflow choose；我没有选择或接受这些失约方案。`;
        feedback.push({kind:'correction',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,stage:'selection',command,missing,observedOptions:options??null,requiredFormat});revisions++;current=await sendSame(command);continue;
      }
      initialChoiceId??=selectedOption.id;requiredFormat??=promisedFormat(selectedOption);
      const choice={kind:'choice',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,command:'/workflow choose '+selectedOption.id,observedOptions:options,requiredFormat};feedback.push(choice);current=await sendSame(choice.command);await settle(false);
    }
    if(current.status?.stage!=='feedback')throw Error('The selected real model stopped at '+current.status?.stage+' instead of presenting a reviewable feedback-stage draft');
    const check=await inspect(current,selectedOption,requiredFormat);await saveAttempt({...check,attempt:revisions,turn:current.turn,sessionId});
    if(check.fatal)throw Error('Independent fatal artifact check: '+check.missing.join(', '));
    if(check.ok){
      const accepted={kind:'accept',origin:'test-external-driver',humanApproval:false,sessionId,turn:current.turn,command:'/workflow accept',artifactSha256:check.bytes.sha256,reason:'Independent current bilingual facts, selected format, visible explanation and protected-input checks passed; not human editorial approval'};feedback.push(accepted);current=await sendSame(accepted.command);await settle(true);await verifyAccepted(check);
      if(current.status?.complete!==true)throw Error('Real model chain stopped without an ordered complete host stage lineage');
      const lineage=completedStageLineage(getCards());
      return{current,artifact:check.bytes,...lineage,revisions,continuations};
    }
    noteFailure('draft',{missing:check.missing,artifactSha256:check.bytes.sha256,requiredFormat});
    const raw=check.writeEvidence?` The original native workflow_write evidence was ${JSON.stringify(check.writeEvidence)}; ${check.writeEvidence.matchesDeclaredOutput?(check.writeEvidence.newline!=='preserve'?'explicitly requested newline normalization matches the independently computed declared output; a difference from raw content is expected, not an unexplained host rewrite.':'the actual output exactly matches the submitted content under preserve, so no host newline conversion is shown.'):'the actual output does not match the independently computed declared output; inspect the native write result and subsequent writes before attributing a host change.'}`:'';
    const newlineHelp=check.missing.some(value=>/newline|literal/.test(value))?" JSON工具参数中的content需要真实换行：可提交含普通真实LF的content，并显式设置 newline:'CRLF'（所选承诺为LF时设置 newline:'LF'）；仅实际ASCII换行被转换，不会反转义字面量反斜杠r/n，也不会添加或删除BOM。省略newline或preserve要求content字节原样。手写CRLF时JSON wire每个CRLF仅用一层转义，经JSON解析后为U+000D/U+000A，不要双重转义。真正CRLF是0D 0A，字面量是5C 72 5C 6E。提交后实际读回统计crlf/lf/literalCRLF；显式转换符合声明或默认原样相等均不得归咎宿主。":'';
    const command=`独立外部技术反馈（测试driver，非真人审美认可）：当前 ${outputPath} 未通过，缺项 ${check.missing.join(', ')}。实际当前输出字节 ${JSON.stringify(check.bytes)}。已选方案的输出承诺 ${JSON.stringify(requiredFormat)}。${raw}${newlineHelp} 请实际修正这些差异，不得仅口头说明或改称验收通过；保持中英文全部事实、原输入字节与相同输出路径。这是同一已选方案的稿件细节反馈；保留已完成的来源核读、安装和实际选择，按宿主当前 draft 阶段直接修正当前草稿，重新验证当前产物后等待真实外部验收。`;
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
    const result=await runDraftFeedback({current:initialTurn,outputPath:plan.output,send,getCards:nativeCards,feedback,maxContinuations:plan.maxRequests,
      inspect:(current,selectedOption,requiredFormat)=>{
        const input=readFileSync(join(plan.workspace,plan.input.path));latestOutput=readFileSync(join(plan.workspace,plan.output));
        const scope=nativeCards().filter(card=>card.kind==='checkpoint'&&card.report?.stage==='scope'&&card.result?.ok===true&&card.seq<=current.endSeq).at(-1);if(!scope)throw Error('Current native revision has no trusted scope checkpoint');
        const afterSeq=currentDraftBoundary(request.frames,{sessionId,afterSeq:scope.seq,endSeq:current.endSeq});
        const visibleAssistantText=visibleDraftText(request.frames,{sessionId,turn:current.turn,afterSeq,endSeq:current.endSeq});
        const check=inspectDraftEvidence({input,expectedInputSha256:plan.input.sha256,output:latestOutput,selectedOption,requiredFormat,visibleAssistantText});
        Object.assign(check,collectWriteEvidence(request.frames,{sessionId,turn:current.turn,afterSeq,endSeq:current.endSeq,path:plan.output,output:latestOutput}));
        return{...check,visibleAssistantText,notesWindow:{scopeSeq:scope.seq,revisionSeq:afterSeq,draftEndSeq:current.endSeq},selectedOptionId:selectedOption.id};
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
