import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createNativeWorkspaceIO} from './native-workspace-io.mjs';

// Break caught: assuming the native `pwsh` capability always resolves to PS7,
// although official DSH also selects Windows PowerShell 5.1 from a normal PATH.
// These run the emitted production commands, not a reconstructed copy.
const windows=process.platform==='win32';
const ps5=join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const shells=windows?[['Windows PowerShell 5.1',ps5],['PowerShell 7',process.env.WORKFLOW_TEST_PWSH7??'pwsh']]:[];
for(const [label,shell]of shells)for(const constrained of [false,true]){
 test(`${label} ${constrained?'ConstrainedLanguage':'FullLanguage'} preserves native directory and byte reads`,{timeout:90000},async t=>{
  const root=mkdtempSync(join(tmpdir(),'native-shell-compat-'));
  t.after(()=>{const actual=realpathSync(root);assert.equal(dirname(actual),realpathSync(tmpdir()));rmSync(actual,{recursive:true,force:true});});
  mkdirSync(join(root,'空目录'));
  const names=[...Array.from({length:22},(_,i)=>String(i).padStart(2,'0')+'.txt'),"引号'、反引号`、美元$、💙.txt",'空目录'];
  for(const name of names.filter(n=>n!=='空目录'))writeFileSync(join(root,name),'plain');
  const bytes=Buffer.from('\ufeff中文原样\r\n'+'逐字节验证💙\r\n'.repeat(360));
  writeFileSync(join(root,names[22]),bytes);
  const seen=[],execute=async(name,args)=>{
   assert.equal(name,'pwsh');assert.equal(resolve(args.workdir),resolve(root));
   // Windows PS5 ships Get-FileHash as a signed script function, PS7 as a
   // cmdlet. Resolve that trusted capability before this test manually changes
   // language mode; this is not an OS sandbox or a production permission grant.
   const preamble=constrained?"Get-Command Get-FileHash -ErrorAction Stop | Out-Null; $ExecutionContext.SessionState.LanguageMode='ConstrainedLanguage'; ":'';
   const command=Buffer.from(preamble+args.command,'utf16le').toString('base64');
   const env={...process.env};delete env.PSModulePath;
   const r=spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',command],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
   assert.equal(r.error,undefined,'Shell must actually start: '+r.error?.message);
   if(r.status!==0)t.diagnostic(JSON.stringify({exitCode:r.status,stderr:r.stderr}));
   seen.push({command:args.command,exitCode:r.status,stdout:r.stdout,stderr:r.stderr});
   return{isError:false,value:{kind:'foreground',exitCode:r.status,timedOut:false,aborted:false,signal:r.signal,stdout:{text:r.stdout,truncated:false},stderr:{text:r.stderr,truncated:false}}};
  };
  const io=createNativeWorkspaceIO({workspace:root,nativeExecutor:{catalog:[{name:'pwsh'}],execute}});
  const all=await io.list('.');
  assert.equal(all.total,24);assert.deepEqual([...all.names].sort(),[...names].sort());
  assert(seen.every(s=>s.exitCode===0),JSON.stringify(seen.map(s=>({exit:s.exitCode,error:s.stderr}))));
  assert(seen.every(s=>/^[\x00-\x7f]*$/.test(s.stdout)),'Directory JSON must survive legacy native encodings, including surrogate pairs');
  assert.deepEqual(await io.list('空目录'),{offset:0,total:0,names:[]});
  assert.deepEqual((await io.list('.',{offset:20,limit:20})).names,all.names.slice(20));
  assert.deepEqual(await io.read(names[22]),bytes);
  assert(readFileSync(join(root,names[22])).equals(bytes));
  const count=seen.length;
  await assert.rejects(io.read('../escape.txt'));
  await assert.rejects(io.list('.git'));
  assert.equal(seen.length,count,'Compatibility must not bypass path checks');
 });
}
if(!windows)test('real Windows PowerShell compatibility requires Windows',{skip:true},()=>{});
