import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {defaultBase,verifyDistribution,prepareInstallation,installDependencies,installSkills,exportSupportReport} from './preview.mjs';
import {createDemoRun} from './demo.mjs';

export async function main(argv=process.argv.slice(2)){
 const {values}=parseArgs({args:argv,options:{action:{type:'string'},source:{type:'string'},node:{type:'string'},base:{type:'string'},'prepare-only':{type:'boolean'},component:{type:'string'}}});
 const action=values.action??'install',source=resolve(values.source??resolve(import.meta.dirname,'..')),base=resolve(values.base??defaultBase()),node=values.node??process.execPath;
 verifyDistribution(source,{allowDependencies:true});
 if(action==='install'){
  console.log('安装的是独立受控任务预览入口；不会替换当前Codex桌面或普通DSH配置。');
  const installation=prepareInstallation(source,{baseDir:base});
  if(values['prepare-only']){console.log(JSON.stringify(installation));return;}
  const ready=installDependencies(installation,{components:values.component?[values.component]:undefined,node});
  console.log('安装校验通过。运行 Codex测试.cmd 或 DSH测试.cmd；默认只做零模型预检。');console.log(JSON.stringify({status:'installed',versionRoot:ready.versionRoot,components:ready.components,enforcement:'per-run-startup-probes-required'}));return;
 }
 if(action==='skills'){console.log(JSON.stringify(installSkills(source),null,2));console.log('Skill已安装；普通对话仍为instruction_only，不等于宿主强制门禁。');return;}
 if(!existsSync(join(base,'latest.json')))throw new Error('请先运行安装.cmd。');
 const installed=JSON.parse(readFileSync(join(base,'latest.json'),'utf8'));verifyDistribution(installed.payload,{allowDependencies:true});
 if(!['codex','dsh','export'].includes(action))throw new Error('未知入口。');
 if(action==='export'){
  if(!existsSync(join(base,'last-run.json')))throw new Error('还没有可导出的测试记录。');
  const last=JSON.parse(readFileSync(join(base,'last-run.json'),'utf8'));const output=join(base,'报告-'+Date.now()+'.json');exportSupportReport(last.stateRoot,output);console.log('仅导出了状态和计数；没有导出请求、正文、原始RPC或凭据。\n'+output);return;
 }
 if(!installed.components.includes(action))throw new Error('此宿主组件尚未安装。');
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try {
  console.log('此入口只验证受控工具与阶段门禁，不代表所有任务的质量已通过。');
  const mode=await rl.question('1 内置门禁回归题（默认）；2 自备任务及可信contract：');
  let task;
  if(mode.trim()==='2'){
   const runRoot=join(base,'runs','custom-'+Date.now());mkdirSync(runRoot,{recursive:true});
   task={runRoot,workspace:resolve(await rl.question('实际任务目录：')),messageFile:resolve(await rl.question('workspace外的UTF-8原始请求文件：')),contractFile:resolve(await rl.question('workspace外的可信contract JSON文件：'))};
  }else task=createDemoRun(base);
  const invoke=(run,extra=[])=>{
   const stateRoot=join(task.runRoot,run?'run-state':'check-state');
   const common=['--workspace',task.workspace,'--user-message-file',task.messageFile,'--state-root',stateRoot];
   const args=action==='dsh'?[join(installed.payload,'hosts/dsh/launcher.mjs'),...common,'--home',join(installed.versionRoot,'dsh-home'),'--profile','proactive-workflow','--runtime-root',installed.runtimes.dsh,'--contract',task.contractFile,'--audit-file',join(stateRoot,'audit.json'),...(run?[]:['--check'])]:[join(installed.payload,'hosts/codex/task-client.mjs'),...common,'--contract-file',task.contractFile,...extra,...(run?['--run']:[])];
   mkdirSync(stateRoot,{recursive:true});writeFileSync(join(base,'last-run.json'),JSON.stringify({stateRoot,kind:action}));
   const result=spawnSync(node,args,{stdio:run?'inherit':['inherit','pipe','inherit'],encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});
   if(!run){
    process.stdout.write(result.stdout??'');
    if(!existsSync(join(stateRoot,'audit.json')))writeFileSync(join(stateRoot,'audit.json'),JSON.stringify({status:result.status===0?'checked':'blocked',complete:false,modelStarted:false}));
   }
   return result.status??1;
  };
  let extra=[];
  if(action==='codex'){
   const defaults={runtime:process.env.CODEX_APP_RUNTIME_CLI_PATH??'',catalog:join(process.env.CODEX_HOME??join(homedir(),'.codex'),'models_cache.json'),auth:join(process.env.CODEX_HOME??join(homedir(),'.codex'),'auth.json')};
   const runtime=(await rl.question('Codex 0.164.0-alpha.11.1 exe路径'+(defaults.runtime?'（回车使用当前运行时）':'')+'：')).trim()||defaults.runtime;
   const catalog=(await rl.question('models_cache.json路径（回车使用个人Codex目录）：')).trim()||defaults.catalog;
   const auth=(await rl.question('已有auth.json路径（回车使用个人Codex目录；不会显示内容）：')).trim()||defaults.auth;
   if(!runtime)throw new Error('未提供匹配的Codex运行时。');extra=['--runtime-path',resolve(runtime),'--catalog-path',resolve(catalog),'--auth-path',resolve(auth)];
  }
  const checked=invoke(false,extra);if(checked!==0)throw new Error('预检未通过；没有启动付费任务。');
  const confirmation=await rl.question('预检通过。输入 RUN 才调用真实模型（可能计费）；直接回车结束：');
  if(confirmation.trim()!=='RUN')return;
  if(action==='dsh'&&!process.env.DEEPSEEK_API_KEY)throw new Error('当前进程没有DEEPSEEK_API_KEY；不会启动模型。');
  rl.close();
  process.exitCode=invoke(true,extra);
 }finally{rl.close();}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
