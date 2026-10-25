import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';import {join,dirname,resolve} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
import {collectGlobalEntries,globalManifest,writeGlobalZip,readGlobalZip,standaloneBootstrapEntries} from './build-global-package.mjs';
import {verifyReleaseManifest} from '../hosts/security/installation-verifier.mjs';
import {spawnSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){const root=mkdtempSync(join(tmpdir(),'global-package-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});return root;}
test('curated collector excludes private data and follows actual local runtime imports',t=>{
 const root=fixture(t),files={'hosts/core/main.mjs':"import '../codex/strict-config.mjs';export const n=1;",'hosts/codex/strict-config.mjs':'export const strict=true;','hosts/core/node_modules/private.js':'SECRET','hosts/core/.evidence/report.json':'SECRET','hosts/core/.runtime-tests/trace.json':'SECRET','hosts/core/auth.json':'SECRET','hosts/core/keys/private.key':'SECRET','hosts/core/reports/private.json':'SECRET','LICENSE':'MIT fixture'};for(const [name,body]of Object.entries(files)){mkdirSync(dirname(join(root,name)),{recursive:true});writeFileSync(join(root,name),body);}
 const result=collectGlobalEntries(root,{candidatePaths:Object.keys(files),required:[]}),names=result.map(x=>x.path);assert(names.includes('hosts/core/main.mjs'));assert(names.includes('hosts/codex/strict-config.mjs'));assert(names.includes('LICENSE'));assert(!result.some(e=>e.bytes.toString().includes('SECRET')));assert.equal(names.filter(n=>n.includes('strict-config')).length,1);
 writeFileSync(join(root,'hosts/core/main.mjs'),"import './missing.mjs';");assert.throws(()=>collectGlobalEntries(root,{candidatePaths:Object.keys(files),required:[]}),/missing|dependency/i);
});
test('new manifest verifies exact archive bytes and rejects an extra or altered payload before runtime',t=>{
 const root=fixture(t),entries=[{path:'hosts/core/runtime.mjs',bytes:Buffer.from('export const current=1;')}],m=globalManifest(entries);for(const e of entries){mkdirSync(dirname(join(root,e.path)),{recursive:true});writeFileSync(join(root,e.path),e.bytes);}writeFileSync(join(root,'manifest.json'),m.bytes);const policy={payloadRoot:root,manifestPath:join(root,'manifest.json'),manifestSha256:m.sha256};assert.equal(verifyReleaseManifest(policy).ok,true);
 writeFileSync(join(root,'extra.mjs'),'unlisted');assert.throws(()=>verifyReleaseManifest(policy),/unlisted/i);rmSync(join(root,'extra.mjs'));writeFileSync(join(root,entries[0].path),'export const current=2;');assert.throws(()=>verifyReleaseManifest(policy),/integrity/i);
});
test('new ZIP roundtrip checks every member CRC and refuses mutated compressed bytes',t=>{
 const root=fixture(t),entries=[{path:'中文说明.txt',bytes:Buffer.from('当前global源码；不是旧preview模型结果。')},{path:'hosts/main.mjs',bytes:Buffer.from('export const n=7;')}],path=join(root,'preview2.zip');writeGlobalZip(path,entries);const bytes=readFileSync(path),parsed=readGlobalZip(bytes);assert.deepEqual(parsed,entries);assert.throws(()=>writeGlobalZip(path,entries),/exist/i);
 const bad=Buffer.from(bytes),nameSize=bad.readUInt16LE(26);bad[30+nameSize+Math.floor(bad.readUInt32LE(18)/2)]^=0x40;assert.throws(()=>readGlobalZip(bad),/CRC|zip|ZIP|invalid|inflate/i);assert(existsSync(path));assert.equal(sha(bytes).length,64);
 const cd=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])),badCentral=Buffer.from(bytes);badCentral[cd+16]^=1;assert.throws(()=>readGlobalZip(badCentral),/CRC|central|ZIP/i);
});
test('standalone outer bootstrap pins PS and inner manifest without a self-referential payload',()=>{
 const ps=Buffer.from('Write-Output "fixture"'),pin='1'.repeat(64),entries=standaloneBootstrapEntries({manifestSha256:pin,bootstrapBytes:ps}),cmd=entries.find(e=>e.path==='安装DSH.cmd').bytes.toString();assert(cmd.includes(pin));assert(cmd.includes(sha(ps)));assert(cmd.includes('%~dp0payload'));assert(cmd.includes('set "NODE_OPTIONS="'));assert(!cmd.includes('^&'));assert(entries.find(e=>e.path==='global-bootstrap.ps1').bytes.equals(ps));
});
test('Windows command entry executes only the pinned PS and clears preload variables',{skip:process.platform!=='win32'},t=>{
 const root=fixture(t);mkdirSync(join(root,'payload'));const ps=Buffer.from("param($SourceRoot,$ManifestSha256,$ReleaseId)\nif($env:NODE_OPTIONS -or $env:NODE_PATH){throw 'preload environment leaked'}\n[IO.File]::WriteAllText([IO.Path]::Combine($SourceRoot,'ran.txt'),'APPROVED_PS');[Console]::WriteLine('ACTUAL_CMD_PS_OK');exit 0\n"),entries=standaloneBootstrapEntries({manifestSha256:'1'.repeat(64),bootstrapBytes:ps});for(const e of entries)writeFileSync(join(root,e.path),e.bytes);
 const run=()=>spawnSync('cmd.exe',['/d','/c',join(root,'安装DSH.cmd')],{input:'',encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,NODE_OPTIONS:'--require=C:/untrusted.cjs',NODE_PATH:'C:/untrusted'}}),positive=run();assert.equal(positive.status,0,positive.stderr);assert(positive.stdout.includes('ACTUAL_CMD_PS_OK'));assert.equal(readFileSync(join(root,'payload/ran.txt'),'utf8'),'APPROVED_PS');
 writeFileSync(join(root,'global-bootstrap.ps1'),Buffer.concat([ps,Buffer.from('#tampered')]));const negative=run();assert.notEqual(negative.status,0);assert((negative.stderr+negative.stdout).includes('Bootstrap SHA256 mismatch'));
});
test('Windows PS release preflight rejects modified payload at short and long script paths before any Node/runtime action',{skip:process.platform!=='win32'},t=>{
 const root=fixture(t),source=join(root,'payload');mkdirSync(source);const body=Buffer.from('original'),manifest=Buffer.from(JSON.stringify({format:1,files:[{path:'current.txt',bytes:body.length,sha256:sha(body)}]}));writeFileSync(join(source,'manifest.json'),manifest);writeFileSync(join(source,'current.txt'),'modified');
 const system=join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),bootstrap=readFileSync(resolve(import.meta.dirname,'../packaging/global-bootstrap.ps1')),unreadNodeArchive=join(root,'must-not-be-read.zip');
 for(const directory of ['short','long-script-location-'.repeat(4)]){
  const script=join(root,directory,'bootstrap.ps1');mkdirSync(dirname(script),{recursive:true});writeFileSync(script,bootstrap);
  const run=pin=>spawnSync(system,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-SourceRoot',source,'-ManifestSha256',pin,'-NodeArchive',unreadNodeArchive,'-CheckOnly'],{encoding:'utf8',windowsHide:true,timeout:20000}),rejected=run(sha(manifest));assert.notEqual(rejected.status,0);assert((rejected.stderr+rejected.stdout).replace(/[\r\n]/g,'').includes('Release resource differs'));assert(!existsSync(unreadNodeArchive));
  const wrongPin=run('0'.repeat(64)),otherReason=(wrongPin.stderr+wrongPin.stdout).replace(/[\r\n]/g,'');assert.notEqual(wrongPin.status,0);assert(otherReason.includes('Release manifest SHA256 mismatch'));assert(!otherReason.includes('Release resource differs'));assert(!existsSync(unreadNodeArchive));
  t.diagnostic('Real Windows PS tamper and distinct wrong-pin refusal verified at script path length '+script.length);
 }
});
