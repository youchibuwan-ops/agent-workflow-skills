// Trusted adapter only. Every project byte read/write traverses the original
// DSH scheduler/permission service; no direct filesystem content fallback.
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {protectedProjectSegment} from '../security/project-path.mjs';
import {createWorkspacePathPolicy} from '../security/verified-worktree.mjs';
import {listingPath} from './workspace-directory.mjs';
import {bindWorkspaceRoot} from '../security/workspace-root.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const inside=(root,p)=>{const r=relative(root,p);return r===''||(r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r));};
const quoted=x=>"'"+String(x).replaceAll("'","''")+"'";
const decoded=x=>`[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(x).toString('base64')}'))`;
function processValue(result){
 if(result?.isError)throw Error('Native operation denied or failed');
 const v=result?.value;
 if(!v||v.kind!=='foreground'||v.exitCode!==0||v.timedOut||v.aborted||v.signal)throw Error('Native foreground process failed or was cancelled');
 if(v.stdout?.truncated!==false||v.stderr?.truncated!==false)throw Error('Native process result truncated; refusing partial bytes');
 if(typeof v.stdout.text!=='string'||typeof v.stderr.text!=='string')throw Error('Native process result lacks exact output');
 return v;
}
export function createNativeWorkspaceIO({workspace,privateRoots=[],hardPrivateRoots=[],worktreeLease,nativeExecutor,maxBytes=8*1024*1024}={}){
 if(!nativeExecutor?.execute||!Array.isArray(nativeExecutor.catalog))throw Error('Host-only original native executor required');
 const binding=bindWorkspaceRoot(workspace),root=binding.root,physicalRoot=root,policy=createWorkspacePathPolicy({workspace:root,privateRoots,hardPrivateRoots,worktreeLease});
 const names=new Set(nativeExecutor.catalog.map(x=>x.name));
 const observations=new Map(),stableFields=['dev','ino','mode','nlink','size','mtimeNs'];
 const observationKey=p=>process.platform==='win32'?p.toLowerCase():p;
 const identity=p=>{const value=lstatSync(p,{bigint:true});if(!value.isFile()||value.isSymbolicLink()||value.nlink!==1n)throw Error('Native artifact identity changed');return value;};
 const sameIdentity=(a,b)=>stableFields.every(key=>a[key]===b[key]);
 if(!names.has('pwsh'))throw Error('Verified Windows pwsh/readback capability required');
 function pathFor(value){
  binding.assertCurrent();
  if(typeof value!=='string'||!value||isAbsolute(value)||/[\x00:]/.test(value))throw Error('Scoped project-relative path required');
  const parts=value.replaceAll('\\','/').split('/');
  if(parts.some(x=>!x||x==='.'||x==='..'||protectedProjectSegment(x)))throw Error('Protected project path denied');
  const p=resolve(root,...parts);if(!inside(root,p)||policy.deniesPrivate(p))throw Error('Private host path denied');
  let current=p;while(!existsSync(current))current=dirname(current);
  const actual=realpathSync.native(current);if(!inside(physicalRoot,actual)||policy.deniesPrivate(actual)||lstatSync(current).isSymbolicLink())throw Error('Redirected project path denied');
  if(existsSync(p)&&lstatSync(p).isFile()&&lstatSync(p).nlink>1)throw Error('Hard-linked project path denied');
  return p;
 }
 async function nativeProcess(command,description){binding.assertCurrent();const result=await nativeExecutor.execute('pwsh',{command,description,workdir:root,timeoutMs:20000});binding.assertCurrent();return processValue(result);}
 async function list(path='.',{offset=0,limit=40}={}){
  binding.assertCurrent();
  const relative=listingPath(path);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Bounded native directory page required');policy.assertCurrent();const p=relative==='.'?root:pathFor(relative);
  const observe=()=>{binding.assertCurrent();const current=relative==='.'?root:pathFor(relative),s=lstatSync(current,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||policy.deniesPrivate(current))throw Error('Scoped plain native directory required');return s;};
  let before=observe(),prior;
  for(let attempt=0;attempt<2;attempt++){
   const names=[];let total,after=before;
   do{
    // ASCII JSON survives ConstrainedLanguage/legacy-codepage stdout.
    // DSH's native pwsh capability legitimately falls back to Windows PS5.1.
    // Escape UTF-16 code units using core string operations, also permitted in
    // ConstrainedLanguage; ConvertTo-Json -EscapeHandling requires PS6+.
    const start=offset+names.length,count=Math.min(20,limit-names.length),command=`$ErrorActionPreference='Stop'; $items=@(Get-ChildItem -LiteralPath ${quoted(p)} -Force | Sort-Object -Property Name); $names=@($items | Select-Object -Skip ${start} -First ${count} | ForEach-Object { $_.Name }); $json=@{offset=${start};total=$items.Count;names=$names}|ConvertTo-Json -Depth 4 -Compress; -join ($json.ToCharArray() | ForEach-Object { if([int][char]$_ -gt 127){ '\\u{0:x4}' -f [int][char]$_ }else{ [string]$_ } })`;
    const v=await nativeProcess(command,'List bounded authorized project directory metadata');let page;try{page=JSON.parse(v.stdout.text);}catch{throw Error('Native directory reader returned malformed JSON');}
    if(!page||page.offset!==start||!Number.isSafeInteger(page.total)||page.total<0||page.total>1000000||!Array.isArray(page.names)||page.names.length!==Math.min(count,Math.max(0,page.total-start))||page.names.some(n=>typeof n!=='string'||!n||n==='.'||n==='..'||/[\\/\x00]/.test(n)))throw Error('Native directory page is incomplete or malformed');
    total??=page.total;if(page.total!==total)throw Error('Native directory changed between pages');names.push(...page.names);after=observe();const changed=['dev','ino','mode','mtimeNs'].filter(k=>before[k]!==after[k]);if(changed.length)throw Error('Native directory identity changed during listing ['+changed.join(',')+']');
   }while(names.length<Math.min(limit,Math.max(0,total-offset)));
   if(new Set(names).size!==names.length)throw Error('Native directory page repeats entries');const page={offset,total,names};
   if(prior&&JSON.stringify(page)!==JSON.stringify(prior))throw Error('Native directory names changed during ctime confirmation');
   if(before.ctimeNs===after.ctimeNs)return page;
   if(attempt)throw Error('Native directory did not stabilize through ctime confirmation');
   // Original Windows permission bookkeeping can change only ctime. Receive
   // the complete SAME page again through that service before accepting it.
   prior=page;before=after;
  }
 }
 async function readExact(path,observe=true){
  const p=pathFor(path),chunks=[];let offset=0,identity;
  do{
   // Only a fixed reader and a base64 path enter the original process service.
   const command=`$ErrorActionPreference='Stop'; $p=${quoted(p)}; if($ExecutionContext.SessionState.LanguageMode -eq 'ConstrainedLanguage'){ $f=Get-Item -LiteralPath $p -Force; if($f.Length -gt ${maxBytes}){throw 'Input byte limit exceeded'}; $h=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash; $c=@(if($PSVersionTable.PSVersion.Major -ge 6){ Get-Content -LiteralPath $p -AsByteStream | Select-Object -Skip ${offset} -First 2048 | ForEach-Object { [int]$_ } }else{ Get-Content -LiteralPath $p -Encoding Byte | Select-Object -Skip ${offset} -First 2048 | ForEach-Object { [int]$_ } }); @{offset=${offset};total=$f.Length;sha256=$h;chunk=$c;limit=2048}|ConvertTo-Json -Compress }else{ $b=[IO.File]::ReadAllBytes($p); if($b.Length -gt ${maxBytes}){throw 'Input byte limit exceeded'}; $s=[Security.Cryptography.SHA256]::Create(); try{$h=([BitConverter]::ToString($s.ComputeHash($b))).Replace('-','').ToLowerInvariant()}finally{$s.Dispose()}; $n=[Math]::Min(8192,$b.Length-${offset}); if($n -lt 0){throw 'Input changed'}; $c=[byte[]]::new($n); if($n -gt 0){[Array]::Copy($b,${offset},$c,0,$n)}; [Console]::Out.Write((@{offset=${offset};total=$b.Length;sha256=$h;base64=[Convert]::ToBase64String($c)}|ConvertTo-Json -Compress)) }`;
   const v=await nativeProcess(command,'Read exact authorized project bytes');let entry;
   try{entry=JSON.parse(v.stdout.text);}catch{throw Error('Native byte reader returned malformed JSON');}
   if(entry.offset!==offset||!Number.isSafeInteger(entry.total)||entry.total<0||entry.total>maxBytes||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(entry.sha256))throw Error('Malformed native byte manifest');
   entry.sha256=entry.sha256.toLowerCase();
   identity??={total:entry.total,sha256:entry.sha256};
   if(entry.total!==identity.total||entry.sha256!==identity.sha256)throw Error('Project input changed during native read');
   let chunk,limit;
   if(entry.limit===2048&&Array.isArray(entry.chunk)&&entry.chunk.every(x=>Number.isInteger(x)&&x>=0&&x<=255)){chunk=Buffer.from(entry.chunk);limit=2048;}
   else if(typeof entry.base64==='string'){chunk=Buffer.from(entry.base64,'base64');limit=8192;if(chunk.toString('base64')!==entry.base64)throw Error('Native byte encoding invalid');}
   else throw Error('Malformed native byte encoding');
   if(chunk.length!==Math.min(limit,entry.total-offset))throw Error('Native byte chunk is incomplete');
   chunks.push(chunk);offset+=chunk.length;
  }while(offset<identity.total);
  const bytes=Buffer.concat(chunks);if(sha(bytes)!==identity.sha256)throw Error('Native exact read digest mismatch');
  if(observe&&existsSync(p)){const entry=lstatSync(p,{bigint:true});if(entry.isFile()&&!entry.isSymbolicLink()&&entry.nlink===1n)observations.set(observationKey(p),{sha256:sha(bytes),identity:entry});}
  return bytes;
 }
 const read=path=>readExact(path);
 async function write(path,bytes){
  if(!names.has('write'))throw Error('Original native writer capability is unavailable; no process write fallback');
  const p=pathFor(path);if(!Buffer.isBuffer(bytes)||bytes.length>2*1024*1024)throw Error('Bounded text artifact bytes required');
  let content;try{content=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error('Native text writer cannot commit binary artifacts');}
  if(existsSync(p)){
   if(!names.has('read'))throw Error('Original native reader capability is unavailable; existing artifact cannot be observed');
   // Retain the earlier trusted observation before either fresh native read can
   // update it. A new Agent's read registration must not bless an external edit.
   const key=observationKey(p),prior=observations.get(key),before=identity(p),initial=await readExact(path,false);
   const expected=prior??{sha256:sha(initial),identity:before};
   if(!sameIdentity(expected.identity,before)||sha(initial)!==expected.sha256||!sameIdentity(before,identity(pathFor(path))))throw Error('Native artifact changed since its authorized read');
   if(!prior)observations.set(key,expected);
   const registered=await nativeExecutor.execute('read',{file_path:p,limit:1});
   if(registered?.isError!==false)throw Error('Native artifact reader denied or failed');
   const confirmed=await readExact(path,false);
   if(!confirmed.equals(initial)||sha(confirmed)!==expected.sha256||!sameIdentity(before,identity(pathFor(path))))throw Error('Native artifact changed during native read registration');
  }
  const result=await nativeExecutor.execute('write',{file_path:p,content});if(result?.isError)throw Error('Native artifact writer denied or failed');
  const actual=await read(path);if(!actual.equals(bytes))throw Error('Native write readback mismatch');return actual;
 }
 async function invoke(request){
  // Private provider requests are never exposed as a model schema.
  if(request.command!=='wsl.exe'||!Array.isArray(request.args)||request.args[0]!=='--exec'||!['/usr/bin/wslpath','/usr/bin/python3'].includes(request.args[1])||typeof request.input!=='string')throw Error('Unreviewed native sandbox process request');
  const command=`$ErrorActionPreference='Stop'; $OutputEncoding=[Text.UTF8Encoding]::new($false); $d=${decoded(request.input)}; $a=@(${request.args.map(quoted).join(',')}); $d | & 'wsl.exe' @a; if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}`;
  const v=await nativeProcess(command,'Run the reviewed isolated workflow method');return {status:v.exitCode,stdout:v.stdout.text,stderr:v.stderr.text};
 }
 return Object.freeze({read,write,list,invoke,workspace:root});
}
