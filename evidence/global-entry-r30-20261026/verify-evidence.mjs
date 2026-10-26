// Public record consistency check. This does not recreate paid calls or a GUI.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
for(const record of Object.values(summary.tests)){
 assert.equal(record.pass,record.tests);assert.equal(record.fail,0);
 assert.equal(record.skipped,0);assert.equal(record.sourceUnchanged,true);
}
const stages=['scope','discovery','selection','draft','feedback','delivery','learning'];
for(const name of ['codex','web']){
 const record=json(name+'.json');assert.equal(record.stage,'complete');
 assert.equal(record.revision,2);assert.deepEqual(record.orderedStages,stages);
 assert.equal(record.sourceManifestSha256,summary.sourceManifestSha256);
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
assert.equal(sha(output),model.artifact.sha256);assert.equal(output.length,613);
assert.equal(text.startsWith('\uFEFF'),false);assert.equal(text.replaceAll('\r\n','').includes('\n'),false);
assert.match(text,/2026\s*年\s*11\s*月\s*8\s*日/);assert.match(text,/8 November 2026/);
for(const fact of ['14:30','松林会议室','Pine Conference Room','11 月 5 日','5 November','test@example.invalid'])assert.ok(text.includes(fact));
// Retain and disclose the actual sample's editorial defect; do not polish it.
assert.ok(text.includes('We want this notice to stay brief'));
const inventory=json('files.json');for(const entry of inventory.files){
 assert.ok(!entry.path.includes('..')&&!entry.path.includes('\\')&&!entry.path.startsWith('/'));
 const bytes=readFileSync(root+'/'+entry.path);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
}
if(process.argv[2]){
 const entries=readGlobalZip(readFileSync(resolve(process.argv[2]))),prefix='AgentWorkflow-20261026-preview3/payload/';
 const packed=new Map(entries.filter(e=>e.path.startsWith(prefix)).map(e=>[e.path.slice(prefix.length),e.bytes]));
 assert.equal(packed.size,manifest.files.length+1);assert.deepEqual(packed.get('manifest.json'),manifestBytes);
 for(const entry of manifest.files){const bytes=packed.get(entry.path);assert.ok(bytes);assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
}
console.log(JSON.stringify({status:'pass',scope:'public record and current source consistency; not a re-execution of historical model/UI actions',sourceFiles:actual.length,payloadFiles:manifest.files.length,publicFiles:inventory.files.length,zipChecked:Boolean(process.argv[2])}));
