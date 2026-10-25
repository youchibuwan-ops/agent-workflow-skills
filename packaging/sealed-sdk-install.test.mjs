import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {authenticatedReleaseSources,authenticatedManifestSources,installSealedSdk,ownerGlobalRoot} from './sealed-sdk-install.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function zip(entries){
 const locals=[],central=[];let at=0;for(const [name,bytes]of entries){const n=Buffer.from(name),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(bytes.length,18);l.writeUInt32LE(bytes.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(at,42);locals.push(l,n,bytes);central.push(c,n);at+=l.length+n.length+bytes.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(at,16);return Buffer.concat([...locals,cd,end]);
}
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'sealed-sdk-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));rmSync(root,{recursive:true,force:true});});
 const repoRoot=join(root,'repo'),ownerRoot=join(root,'owner'),toolRoot=join(root,'tools');mkdirSync(join(repoRoot,'hosts/dsh'),{recursive:true});mkdirSync(ownerRoot);mkdirSync(toolRoot);
 const pkg=Buffer.from('{"name":"fixture-sdk","private":true}'),lock=Buffer.from('{"lockfileVersion":3}');for(const [n,b]of [['package.json',pkg],['package-lock.json',lock]])writeFileSync(join(repoRoot,'hosts/dsh',n),b);
 const archive=zip([['preview/hosts/dsh/package.json',pkg],['preview/hosts/dsh/package-lock.json',lock]]),releaseArchivePath=join(root,'release.zip');writeFileSync(releaseArchivePath,archive);
 const code="import fs from 'node:fs';fs.mkdirSync('node_modules/fixture',{recursive:true});fs.writeFileSync('node_modules/fixture/index.js','module.exports=7;');";const npmCliPath=join(toolRoot,'install.mjs');writeFileSync(npmCliPath,code);
 const tree=sha(JSON.stringify({entries:[{path:'.',type:'directory'},{bytes:Buffer.byteLength(code),path:'install.mjs',sha256:sha(code),type:'file'}]}));
 return {root,repoRoot,ownerRoot,releaseArchivePath,expectedReleaseSha256:sha(archive),installer:{nodePath:process.execPath,nodeSha256:sha(readFileSync(process.execPath)),npmCliPath,npmCliSha256:sha(code),toolRoot,expectedTreeSha256:tree},nodeProvenance:{authority:'literal-test-fixture-not-publisher',expectedTreeSha256:tree},actorWritableRoots:[]};
}
test('source pins come from authenticated release bytes and reject changed current locks',t=>{
 const f=fixture(t),p=authenticatedReleaseSources(f);assert.equal(p.lock.sha256,sha(readFileSync(join(f.repoRoot,'hosts/dsh/package-lock.json'))));
 writeFileSync(join(f.repoRoot,'hosts/dsh/package-lock.json'),'{}');assert.throws(()=>authenticatedReleaseSources(f),/current|source|match/i);
 assert.throws(()=>authenticatedReleaseSources({...f,expectedReleaseSha256:'0'.repeat(64)}),/archive|hash/i);
});
test('fresh observed SDK install writes a private receipt and reuses only a genuine matching seal',async t=>{
 const f=fixture(t),r=await installSealedSdk(f);assert.equal(r.status,'sealed');assert.equal(r.reused,false);assert(existsSync(r.sealPath));assert.equal(readFileSync(r.keyPath).length,32);assert(!JSON.stringify(r).includes(readFileSync(r.keyPath).toString('hex')));
 const again=await installSealedSdk(f);assert.equal(again.reused,true);assert.equal(again.treeSha256,r.treeSha256);
 writeFileSync(join(r.installRoot,'node_modules/fixture/index.js'),'module.exports=9;');await assert.rejects(installSealedSdk(f),/differ|changed/i);
});
test('an existing unsealed SDK and owner paths inside actor scope are refused',async t=>{
 const f=fixture(t),p=authenticatedReleaseSources(f),target=join(f.ownerRoot,'dependencies','dsh-'+p.lock.sha256.slice(0,16));mkdirSync(target,{recursive:true});await assert.rejects(installSealedSdk(f),/unsealed|trust|existing/i);
 const g=fixture(t);await assert.rejects(installSealedSdk({...g,actorWritableRoots:[g.root]}),/actor|private|scope/i);assert.equal(existsSync(join(g.ownerRoot,'keys/shared-sdk.key')),false);
 assert(ownerGlobalRoot().endsWith(join('.agent-workflow','global')));
});
test('first trust from a release manifest still requires the independently fixed actual DSH sources',t=>{
 const f=fixture(t),entries=[];for(const name of ['package.json','package-lock.json']){const path='hosts/dsh/'+name,bytes=readFileSync(new URL('../'+path,import.meta.url));writeFileSync(join(f.repoRoot,path),bytes);entries.push({path,bytes:bytes.length,sha256:sha(bytes)});}const manifestPath=join(f.root,'manifest.json');writeFileSync(manifestPath,JSON.stringify({format:1,files:entries}));const authority={payloadRoot:f.repoRoot,manifestPath,manifestSha256:sha(readFileSync(manifestPath))};assert.equal(authenticatedManifestSources(authority).lock.sha256,'0047ae6efbad56d5dbd8da744a2e93f70b406a8062d282a401a2f27add152868');
 writeFileSync(join(f.repoRoot,'hosts/dsh/package-lock.json'),'{}');assert.throws(()=>authenticatedManifestSources(authority),/integrity/i);
 const g=fixture(t),fake=['package.json','package-lock.json'].map(name=>{const path='hosts/dsh/'+name,b=readFileSync(join(g.repoRoot,path));return{path,bytes:b.length,sha256:sha(b)};});writeFileSync(join(g.root,'manifest.json'),JSON.stringify({format:1,files:fake}));assert.throws(()=>authenticatedManifestSources({payloadRoot:g.repoRoot,manifestPath:join(g.root,'manifest.json'),manifestSha256:sha(readFileSync(join(g.root,'manifest.json')))}),/fixed|identity/i);
});
