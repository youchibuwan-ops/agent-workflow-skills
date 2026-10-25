import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,unlinkSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildHostPreview,collectPreviewEntries,verifySourceEvidence,writeZip} from './build-host-preview.mjs';
import {verifyDistribution,prepareInstallation,installDependencies,installSkills,exportSupportReport} from '../packaging/preview.mjs';

const source=resolve(import.meta.dirname,'..');
function scratch(t){const root=mkdtempSync(join(tmpdir(),'host-preview-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith('host-preview-test-'));rmSync(root,{recursive:true,force:true});});return root;}
function unpack(zip,destination){execFileSync('python',['-X','utf8','-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])',zip,destination]);}
function distribution(t){const root=scratch(t),zip=join(root,'preview.zip'),extracted=join(root,'extracted');const built=buildHostPreview({sourceRoot:source,outputPath:zip});unpack(zip,extracted);return {root,zip,built,payload:join(extracted,built.folder)};}

test('ZIP writer produces standard UTF-8 archives without staging copies',t=>{
 const root=scratch(t),zip=join(root,'tiny.zip');writeZip(zip,[{path:'中文/说明.txt',bytes:Buffer.from('实际字节 😀')}]);
 unpack(zip,join(root,'out'));assert.equal(readFileSync(join(root,'out/中文/说明.txt'),'utf8'),'实际字节 😀');
 assert.throws(()=>writeZip(join(root,'bad.zip'),[{path:'../escape',bytes:Buffer.from('bad')}]),/path/i);
});

test('built preview has both complete Skill variants, native hosts, locks and no private runtime',t=>{
 const f=distribution(t),r=verifyDistribution(f.payload);assert(r.files>45);
 for(const path of ['skills/proactive-skill-discovery/SKILL.md','skills/proactive-skill-discovery-dsh/SKILL.md','hosts/core/workflow-host.mjs','hosts/codex/task-client.mjs','hosts/codex/package-lock.json','hosts/dsh/install.mjs','hosts/dsh/package-lock.json','docs/host-preview.md','evidence/host-preview-20261025/summary.json','安装.cmd','Codex测试.cmd','DSH测试.cmd','导出报告.cmd']) assert(r.paths.includes(path),path);
 assert(!r.paths.some(p=>/(^|\/)(?:node_modules|\.git|auth\.json|\.env)(\/|$)/i.test(p)));
 assert.equal(f.built.sha256.length,64);assert.equal(f.built.files,r.files);
 const entries=collectPreviewEntries(source);assert(verifySourceEvidence(entries)>=15);
 entries.find(e=>e.path==='hosts/core/workflow-host.mjs').bytes=Buffer.from('untested changed execution code');
 assert.throws(()=>verifySourceEvidence(entries),/evidence SHA mismatch/);
});

test('missing resources and same-size modified source fail before installing',t=>{
 const f=distribution(t);const target=join(f.payload,'skills/proactive-skill-discovery/references/stage-checks.md');
 const bytes=readFileSync(target);bytes[bytes.length-2]^=1;writeFileSync(target,bytes);
 assert.throws(()=>verifyDistribution(f.payload),/hash|SHA|integrity/i);
 unlinkSync(target);assert.throws(()=>prepareInstallation(f.payload,{baseDir:join(f.root,'installed')}),/missing/i);
 assert.equal(existsSync(join(f.root,'installed')),false);
});

test('unlisted files and path traversal manifests are rejected',t=>{
 const f=distribution(t);writeFileSync(join(f.payload,'auth.json'),'never distribute');assert.throws(()=>verifyDistribution(f.payload),/unlisted/i);unlinkSync(join(f.payload,'auth.json'));
 const path=join(f.payload,'manifest.json'),manifest=JSON.parse(readFileSync(path));manifest.files[0].path='../escape';writeFileSync(path,JSON.stringify(manifest));
 assert.throws(()=>verifyDistribution(f.payload),/path|traversal/i);
});

test('fresh isolated prepare copies verified bytes without claiming dependencies ready',t=>{
 const f=distribution(t),install=prepareInstallation(f.payload,{baseDir:join(f.root,'private-home')});
 const verified=verifyDistribution(install.payload);assert.equal(verified.treeSha256,f.built.treeSha256);
 assert.equal(install.status,'prepared');assert.equal(existsSync(join(install.versionRoot,'ready.json')),false);
 assert.equal(prepareInstallation(f.payload,{baseDir:join(f.root,'private-home')}).payload,install.payload);
 writeFileSync(join(install.payload,'hosts/core/workflow-host.mjs'),'tampered installed payload');
 assert.throws(()=>prepareInstallation(f.payload,{baseDir:join(f.root,'private-home')}),/hash|SHA|integrity/i);
});

test('Skill installation is discoverable, complete and backs up only the named existing Skill',t=>{
 const f=distribution(t),codex=join(f.root,'codex'),dsh=join(f.root,'dsh');
 mkdirSync(join(codex,'skills/proactive-skill-discovery'),{recursive:true});writeFileSync(join(codex,'skills/proactive-skill-discovery/SKILL.md'),'old personal edit');
 mkdirSync(join(codex,'skills/keep-me'),{recursive:true});writeFileSync(join(codex,'skills/keep-me/SKILL.md'),'preserve');
 const result=installSkills(f.payload,{codexHome:codex,dshHome:dsh});assert.equal(result.length,2);assert(result[0].backup);
 assert.equal(readFileSync(join(result[0].backup,'SKILL.md'),'utf8'),'old personal edit');
 assert.equal(readFileSync(join(codex,'skills/keep-me/SKILL.md'),'utf8'),'preserve');
 assert(existsSync(join(dsh,'skills/proactive-skill-discovery-dsh/references/dsh-host.md')));
 assert.equal(result[0].enforcement,'instruction_only');
});

test('support export excludes actual requests, source/tool bodies and credentials',t=>{
 const root=scratch(t),state=join(root,'private');mkdirSync(state);
 writeFileSync(join(state,'audit.json'),JSON.stringify({status:'blocked',stage:'discovery',complete:false,apiKey:'SECRET',output:'PRIVATE TASK',events:[{body:'SOURCE'}]}));
 writeFileSync(join(state,'auth.json'),'ACCOUNT_SECRET');
 const out=join(root,'support.json');exportSupportReport(state,out);const raw=readFileSync(out,'utf8');assert(!/SECRET|PRIVATE TASK|SOURCE/.test(raw));
 const actual=JSON.parse(raw);assert.equal(actual.summary.status,'blocked');assert.equal(actual.summary.stage,'discovery');
});

test('fresh real Codex dependency installation and native Windows ZIP/bootstrap export work without a model',{
 skip:process.env.WORKFLOW_PREVIEW_REAL_INSTALL!=='1'||process.platform!=='win32'
},t=>{
 const f=distribution(t),base=join(f.root,'isolated-application');
 const powershell=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const extract=join(f.root,'extract-native.ps1'),destination=join(f.root,'windows-extracted');
 writeFileSync(extract,"param([string]$Archive,[string]$Destination)\n[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem')\n[IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)\n");
 execFileSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',extract,'-Archive',f.zip,'-Destination',destination]);
 const nativePayload=join(destination,f.built.folder);assert.equal(verifyDistribution(nativePayload).treeSha256,f.built.treeSha256);
 const install=prepareInstallation(nativePayload,{baseDir:base});
 const runtimeOverrides=process.env.WORKFLOW_PREVIEW_CODEX_RUNTIME?{codex:process.env.WORKFLOW_PREVIEW_CODEX_RUNTIME}:{};
 const ready=installDependencies(install,{components:['codex'],node:process.execPath,runtimeOverrides});
 assert.deepEqual(ready.components,['codex']);assert(existsSync(join(ready.runtimes.codex,'node_modules/ws/package.json')));
 assert.equal(verifyDistribution(ready.payload,{allowDependencies:true}).treeSha256,f.built.treeSha256);
 const state=join(base,'runs/model-free-check');mkdirSync(state,{recursive:true});writeFileSync(join(state,'audit.json'),JSON.stringify({status:'checked',complete:false,modelStarted:false}));writeFileSync(join(base,'last-run.json'),JSON.stringify({stateRoot:state}));
 const output=execFileSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',join(nativePayload,'packaging/bootstrap.ps1'),'-Action','export'],{
  env:{...process.env,WORKFLOW_PREVIEW_NODE:process.execPath,WORKFLOW_PREVIEW_BASE:base},encoding:'utf8',timeout:60000
 });
 assert.match(output,/\.json/);assert.match(output,/仅导出了状态和计数/);assert.equal(existsSync(join(base,'latest.json')),true);
});
