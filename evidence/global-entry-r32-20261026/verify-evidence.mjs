// Public record consistency check. This does not recreate paid calls or a GUI.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {collectGlobalEntries,readGlobalZip} from '../../scripts/build-global-package.mjs';

const root=import.meta.dirname,repo=resolve(root,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(readFileSync(root+'/'+p));
const artifact=n=>readFileSync(root+'/artifacts/'+n);
const summary=json('summary.json'),manifestBytes=readFileSync(root+'/source-manifest.json');
assert.equal(sha(manifestBytes),summary.sourceManifestSha256);
const manifest=JSON.parse(manifestBytes),actual=collectGlobalEntries(repo).map(e=>({path:e.path,bytes:e.bytes.length,sha256:sha(e.bytes)}));
assert.deepEqual(actual,manifest.files.filter(f=>f.path!=='先读说明.txt'));
assert.equal(manifest.files.length,132);
for(const [name,record] of Object.entries(summary.tests)){
 assert.equal(record.pass,name==='global'?425:record.tests);assert.equal(record.fail,name==='global'?1:0);assert.equal(record.skipped,0);assert.equal(record.sourceUnchanged,true);
}
assert.equal(summary.networkRetry.status,'pass');assert.equal(summary.networkRetry.pass,1);assert.equal(summary.networkRetry.skipped,0);
const previousBytes=readFileSync(root+'/behavioral-source-manifest.json');assert.equal(sha(previousBytes),summary.behavioralSourceManifestSha256);const previous=JSON.parse(previousBytes),old=new Map(previous.files.map(f=>[f.path,f]));assert.equal(previous.files.length,manifest.files.length);assert.deepEqual(manifest.files.filter(f=>f.sha256!==old.get(f.path)?.sha256).map(f=>f.path),summary.sourceDelta);assert.deepEqual(summary.sourceDelta,['hosts/core/workflow-host.test.mjs','skills/proactive-skill-discovery-dsh/references/stage-checks.md','skills/proactive-skill-discovery/references/stage-checks.md']);assert.equal(summary.installation.postflight.status,'pass');assert.equal(summary.installation.coldStart.status,'pass');
const stages=['scope','discovery','selection','draft','feedback','delivery','learning'];
for(const name of ['codex','web']){
 const record=json(name+'.json');assert.equal(record.stage,'complete');
 assert.equal(record.revision,2);assert.deepEqual(record.orderedStages,stages);
 assert.equal(record.sourceManifestSha256,summary.behavioralSourceManifestSha256);
 assert.equal(record.successfulWrites,2);assert.equal(record.humanApproval,false);
 const bytes=artifact(name+'-final.md.txt');assert.equal(bytes.length,record.artifact.bytes);
 assert.equal(sha(bytes),record.artifact.sha256);
}
const replace=(b,pairs)=>Buffer.from(pairs.reduce((s,[a,b])=>s.split(a).join(b),b.toString('utf8')));
assert.deepEqual(artifact('codex-final.md.txt'),replace(artifact('codex-before.md.txt'),[['图书馆A室','图书馆C室'],['Library Room A','Library Room C']]));
assert.deepEqual(artifact('web-first.md.txt'),replace(artifact('web-before.md.txt'),[['图书馆A室','图书馆C室'],['Library Room A','Library Room C']]));
assert.deepEqual(artifact('web-final.md.txt'),replace(artifact('web-first.md.txt'),[['19:00–20:00','19:30–20:30']]));
const differences=(a,b)=>{assert.equal(a.length,b.length);return [...a.keys()].filter(i=>a[i]!==b[i]);};
assert.equal(differences(artifact('web-before.md.txt'),artifact('web-first.md.txt')).length,2);
assert.equal(differences(artifact('web-first.md.txt'),artifact('web-final.md.txt')).length,4);
const model=json('dsh-sdk.json'),input=artifact('sdk-input.txt'),output=artifact('sdk-final.md.txt'),text=new TextDecoder('utf8',{fatal:true}).decode(output);
assert.equal(model.status,'pass');assert.equal(model.maxTokensBound,100000);
assert.equal(model.complete,true);assert.equal(model.sourceUnchanged,true);
assert.equal(sha(input),'c3ca1241c486c298ead0b26b290429c13ba0ae5e8f9734c3b8c72ed31231afab');
assert.equal(sha(output),model.artifact.sha256);assert.equal(output.length,551);
assert.equal(text.startsWith('\uFEFF'),false);assert.equal(text.replaceAll('\r\n','').includes('\n'),false);
assert.match(text,/2026\s*年\s*11\s*月\s*8\s*日/);assert.match(text,/8 November 2026/);
for(const fact of ['14:30','松林会议室','Songlin Meeting Room','11 月 5 日','5 November','test@example.invalid'])assert.ok(text.includes(fact));
assert.equal(model.sourceManifestSha256,summary.behavioralSourceManifestSha256);assert.equal(model.writeEvidence.matchesDeclaredOutput,true);assert.equal(model.writeEvidence.actualOutput.sha256,sha(output));
assert.equal(model.writeEvidence.arguments.sha256,sha(Buffer.from(text.replaceAll('\r\n','\n'))));
const controls=json('behavior-controls.json');assert.deepEqual(controls.controls.outcomes.map(x=>x.fixtureAccepted),[true,false,false]);assert.equal(controls.productionCore.unchanged,true);
const release=json('release.json');assert.equal(release.manifestSha256,summary.sourceManifestSha256);assert.equal(release.bootstrap.actualExtractedInstaller,true);assert.equal(json('ci.json').conclusion,'success');
const inventory=json('files.json');assert.deepEqual(readdirSync(root,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='files.json').map(e=>(e.parentPath.slice(root.length+1)+'/'+e.name).replaceAll('\\','/').replace(/^\//,'')).sort(),inventory.files.map(f=>f.path).sort());for(const entry of inventory.files){
 assert.ok(!entry.path.includes('..')&&!entry.path.includes('\\')&&!entry.path.startsWith('/'));
 const bytes=readFileSync(root+'/'+entry.path);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
}
if(process.argv[2]){
 const supplied=readFileSync(resolve(process.argv[2]));assert.equal(sha(supplied),release.sha256);const entries=readGlobalZip(supplied),prefix='AgentWorkflow-20261026-preview3/payload/';
 const packed=new Map(entries.filter(e=>e.path.startsWith(prefix)).map(e=>[e.path.slice(prefix.length),e.bytes]));
 assert.equal(packed.size,manifest.files.length+1);assert.deepEqual(packed.get('manifest.json'),manifestBytes);
 for(const entry of manifest.files){const bytes=packed.get(entry.path);assert.ok(bytes);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
}
console.log(JSON.stringify({status:'pass',scope:'public record and current source consistency; not a re-execution of historical model/UI actions',sourceFiles:actual.length,payloadFiles:manifest.files.length,publicFiles:inventory.files.length,zipChecked:Boolean(process.argv[2])}));
