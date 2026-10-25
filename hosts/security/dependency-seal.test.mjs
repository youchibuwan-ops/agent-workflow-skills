import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,unlinkSync,existsSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createDependencySealAuthority,measureDependencyTree} from './dependency-seal.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nodeSha=sha(readFileSync(process.execPath));
const support='export const support=true;\n';
const producer=`import './support.mjs';import fs from 'node:fs';import path from 'node:path';
const args=process.argv.slice(2);if(JSON.stringify(args)!==JSON.stringify(['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund']))process.exit(90);
const c=JSON.parse(fs.readFileSync('package.json','utf8'));
if(c.fixtureMode==='fail')process.exit(12);
if(c.fixtureMode==='change-tool')fs.writeFileSync(new URL('./support.mjs',import.meta.url),'changed by child');
fs.mkdirSync('node_modules/pkg/lib',{recursive:true});fs.mkdirSync('node_modules/.bin',{recursive:true});
fs.writeFileSync('node_modules/pkg/lib/main.js','export const value=17;\\n');fs.writeFileSync('node_modules/pkg/package.json','{"name":"pkg","version":"1.0.0"}');
fs.writeFileSync('node_modules/.bin/pkg.cmd','@echo fixture');
if(c.fixtureMode==='internal-link')fs.symlinkSync(path.resolve('node_modules/pkg'),'node_modules/alias',process.platform==='win32'?'junction':'dir');
if(c.externalTarget)fs.symlinkSync(c.externalTarget,'node_modules/external',process.platform==='win32'?'junction':'dir');
`;
function fixture(t,{mode,externalTarget,trustedLinkRoots=[]}={}){
 const root=mkdtempSync(join(tmpdir(),'dependency-seal-test-'));
 t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith('dependency-seal-test-'));rmSync(root,{recursive:true,force:true});});
 const payload=join(root,'payload'),actor=join(root,'actor'),sources=join(root,'trusted-source'),sealRoot=join(root,'private-seals'),toolRoot=join(root,'trusted-tool');
 for(const p of [payload,actor,sources,toolRoot])mkdirSync(p);
 const packagePath=join(sources,'package.json'),lockPath=join(sources,'package-lock.json'),cli=join(toolRoot,'fixture-installer.mjs');
 writeFileSync(packagePath,JSON.stringify({name:'seal-test-fixture',private:true,fixtureMode:mode,externalTarget}));writeFileSync(lockPath,'{"name":"seal-test-fixture","lockfileVersion":3,"packages":{}}');writeFileSync(cli,producer);writeFileSync(join(toolRoot,'support.mjs'),support);
 // Literal fixture layout and public SHA256, not a call to the measured code.
 const expectedTreeSha256=sha(JSON.stringify({entries:[{path:'.',type:'directory'},{bytes:Buffer.byteLength(producer),path:'fixture-installer.mjs',sha256:sha(producer),type:'file'},{bytes:Buffer.byteLength(support),path:'support.mjs',sha256:sha(support),type:'file'}]}));
 const key=randomBytes(32),config={sealRoot,key,payloadRoots:[payload],actorWritableRoots:[actor],trustedLinkRoots};
 const authority=createDependencySealAuthority(config),installRoot=join(root,'installation');
 const install={installRoot,sourcePackage:{path:packagePath,sha256:sha(readFileSync(packagePath))},sourceLock:{path:lockPath,sha256:sha(readFileSync(lockPath))},installer:{nodePath:process.execPath,nodeSha256:nodeSha,npmCliPath:cli,npmCliSha256:sha(readFileSync(cli)),toolRoot,expectedTreeSha256}};
 return {root,payload,actor,sources,sealRoot,key,config,authority,installRoot,install,toolRoot};
}

test('fresh observed installation seals every directory, ordinary file and .bin shim',async t=>{
 const f=fixture(t),sealed=await f.authority.installAndSeal(f.install);assert.equal(sealed.attestation,'observed-locked-installation');assert.equal(sealed.installRecord.exitCode,0);assert.equal(sealed.installRecord.command,'npm-ci-ignore-scripts');
 const doc=JSON.parse(readFileSync(sealed.sealPath));const item=doc.manifest.entries.find(e=>e.path==='node_modules/pkg/lib/main.js');
 assert.equal(item.type,'file');assert.equal(item.sha256,sha(Buffer.from('export const value=17;\n')));assert(doc.manifest.entries.some(e=>e.path==='node_modules/.bin/pkg.cmd'));assert(doc.manifest.entries.some(e=>e.type==='directory'));
 const checked=f.authority.verify({installRoot:f.installRoot,sealPath:sealed.sealPath});assert.equal(checked.ok,true);assert.equal(checked.treeSha256,doc.manifest.treeSha256);
});
test('addition, removal, replacement and same-length executable changes are rejected',async t=>{
 for(const kind of ['add-file','add-directory','remove','modify','type']){
  const f=fixture(t),s=await f.authority.installAndSeal(f.install),file=join(f.installRoot,'node_modules/pkg/lib/main.js');
  if(kind==='add-file')writeFileSync(join(f.installRoot,'node_modules/hidden.mjs'),'new code');
  if(kind==='add-directory')mkdirSync(join(f.installRoot,'node_modules/extra-empty'));
  if(kind==='remove')unlinkSync(file);
  if(kind==='modify')writeFileSync(file,'export const value=99;\n');
  if(kind==='type'){unlinkSync(file);mkdirSync(file);}
  assert.throws(()=>f.authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}),e=>e.code==='DEPENDENCY_CHANGED',kind);
 }
});
test('existing arbitrary dependencies cannot be promoted by a passed field or borrowed record',async t=>{
 const f=fixture(t);mkdirSync(join(f.installRoot,'node_modules'),{recursive:true});writeFileSync(join(f.installRoot,'node_modules/modified.js'),'untrusted existing code');
 await assert.rejects(()=>f.authority.installAndSeal({...f.install,passed:true}),e=>e.code==='UNTRUSTED_EXISTING_INSTALLATION');
 const fake=join(f.sealRoot,'fake.json');writeFileSync(fake,JSON.stringify({passed:true,installRecord:{exitCode:0},manifest:{entries:[]}}));
 assert.throws(()=>f.authority.verify({installRoot:f.installRoot,sealPath:fake}),e=>e.code==='UNTRUSTED_SEAL');
 assert.equal(typeof f.authority.sealExisting,'undefined');
});
test('seal documents, keys and actor-authored replacement manifests cannot bless tampered bytes',async t=>{
 const f=fixture(t),s=await f.authority.installAndSeal(f.install),doc=JSON.parse(readFileSync(s.sealPath));doc.manifest.entries=[];doc.manifest.treeSha256='0'.repeat(64);writeFileSync(s.sealPath,JSON.stringify(doc));
 assert.throws(()=>f.authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}),e=>e.code==='UNTRUSTED_SEAL');
 const g=fixture(t),b=await g.authority.installAndSeal(g.install),wrong=createDependencySealAuthority({...g.config,key:randomBytes(32)});assert.throws(()=>wrong.verify({installRoot:g.installRoot,sealPath:b.sealPath}),e=>e.code==='UNTRUSTED_SEAL');
});
test('seal storage inside payload, actor paths or an installation root is refused',async t=>{
 const f=fixture(t);
 for(const sealRoot of [join(f.actor,'seals'),join(f.payload,'seals')])assert.throws(()=>createDependencySealAuthority({...f.config,sealRoot}),e=>e.code==='UNSAFE_SEAL_STORAGE');
 const g=fixture(t),bad=createDependencySealAuthority({...g.config,sealRoot:join(g.root,'future-install/seals')});
 await assert.rejects(()=>bad.installAndSeal({...g.install,installRoot:join(g.root,'future-install')}),e=>e.code==='UNSAFE_SEAL_STORAGE');
});
test('an installation cannot contain a future declared actor-write directory',async t=>{
 const f=fixture(t),authority=createDependencySealAuthority({...f.config,actorWritableRoots:[join(f.installRoot,'future-workspace')]});
 await assert.rejects(()=>authority.installAndSeal(f.install),e=>e.code==='ACTOR_WRITABLE_INSTALLATION');assert.equal(existsSync(f.installRoot),false);
});
test('trusted installer and locked-source identities are checked before a process or installation begins',async t=>{
 const f=fixture(t);await assert.rejects(()=>f.authority.installAndSeal({...f.install,installer:{...f.install.installer,npmCliSha256:'0'.repeat(64)}}),e=>e.code==='INSTALL_SOURCE_MISMATCH');assert.equal(existsSync(f.installRoot),false);
 const g=fixture(t);writeFileSync(g.install.sourceLock.path,'{}');await assert.rejects(()=>g.authority.installAndSeal(g.install),e=>e.code==='INSTALL_SOURCE_MISMATCH');assert.equal(existsSync(g.installRoot),false);
});
test('a modified installer submodule cannot run when its entry file still has the expected hash',async t=>{
 const f=fixture(t),marker=join(f.root,'submodule-was-executed');
 writeFileSync(join(f.toolRoot,'support.mjs'),`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'EXECUTED');`);
 assert.equal(sha(readFileSync(f.install.installer.npmCliPath)),f.install.installer.npmCliSha256);
 await assert.rejects(()=>f.authority.installAndSeal(f.install),e=>e.code==='INSTALL_SOURCE_MISMATCH');assert.equal(existsSync(marker),false);assert.equal(existsSync(f.installRoot),false);
});
test('complete installer trust is mandatory and rechecked after the child exits',async t=>{
 const f=fixture(t);await assert.rejects(()=>f.authority.installAndSeal({...f.install,installer:{...f.install.installer,expectedTreeSha256:undefined}}),e=>e.code==='INSTALL_SOURCE_MISMATCH');assert.equal(existsSync(f.installRoot),false);
 const g=fixture(t,{mode:'change-tool'});await assert.rejects(()=>g.authority.installAndSeal(g.install),e=>e.code==='INSTALL_SOURCE_MISMATCH');assert.equal(readdirSync(g.sealRoot).length,0);
});
test('failed installer runs create no accepted dependency seal',async t=>{
 const f=fixture(t,{mode:'fail'});await assert.rejects(()=>f.authority.installAndSeal(f.install),e=>e.code==='INSTALL_FAILED');assert.equal(readdirSync(f.sealRoot).length,0);
});
test('in-root directory junctions are covered and retargeting to identical bytes changes identity',async t=>{
 const f=fixture(t,{mode:'internal-link'}),s=await f.authority.installAndSeal(f.install);assert.equal(f.authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}).ok,true);
 const doc=JSON.parse(readFileSync(s.sealPath));assert(doc.manifest.entries.some(e=>e.path==='node_modules/alias'&&e.type==='link'));
 const alias=join(f.installRoot,'node_modules/alias');unlinkSync(alias);symlinkSync(join(f.installRoot,'node_modules/pkg/lib'),alias,process.platform==='win32'?'junction':'dir');assert.throws(()=>f.authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
});
test('explicit external trusted directory contents are covered, while escape and dangling targets fail',async t=>{
 const f=fixture(t),external=join(f.root,'trusted-store');mkdirSync(external);writeFileSync(join(external,'shared.js'),'const shared=1;');
 const authority=createDependencySealAuthority({...f.config,trustedLinkRoots:[{id:'store',path:external}]});
 const pkg=JSON.parse(readFileSync(f.install.sourcePackage.path));pkg.externalTarget=external;writeFileSync(f.install.sourcePackage.path,JSON.stringify(pkg));const install={...f.install,sourcePackage:{...f.install.sourcePackage,sha256:sha(readFileSync(f.install.sourcePackage.path))}};
 const s=await authority.installAndSeal(install);writeFileSync(join(external,'shared.js'),'const shared=2;');assert.throws(()=>authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
 const g=fixture(t),outside=join(g.root,'unapproved');mkdirSync(outside);const p=JSON.parse(readFileSync(g.install.sourcePackage.path));p.externalTarget=outside;writeFileSync(g.install.sourcePackage.path,JSON.stringify(p));await assert.rejects(()=>g.authority.installAndSeal({...g.install,sourcePackage:{...g.install.sourcePackage,sha256:sha(readFileSync(g.install.sourcePackage.path))}}),e=>e.code==='LINK_OUTSIDE_TRUST');
 const h=fixture(t);mkdirSync(join(h.installRoot,'node_modules'),{recursive:true});symlinkSync(join(h.root,'missing-target'),join(h.installRoot,'node_modules/missing'),process.platform==='win32'?'junction':'dir');assert.throws(()=>measureDependencyTree({root:h.installRoot}),e=>e.code==='DANGLING_LINK');
});
test('changing an unmeasured link alias or moving a valid seal under an actor path cannot pass',async t=>{
 const f=fixture(t),s=await f.authority.installAndSeal(f.install);symlinkSync(join(f.installRoot,'node_modules/pkg'),join(f.installRoot,'node_modules/new-alias'),process.platform==='win32'?'junction':'dir');assert.throws(()=>f.authority.verify({installRoot:f.installRoot,sealPath:s.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
 const g=fixture(t),a=await g.authority.installAndSeal(g.install),copy=join(g.actor,'copied-seal.json');writeFileSync(copy,readFileSync(a.sealPath));assert.throws(()=>g.authority.verify({installRoot:g.installRoot,sealPath:copy}),e=>e.code==='UNSAFE_SEAL_STORAGE');
});
test('measuring a pre-existing real tree is useful but never emits installation trust',t=>{
 const f=fixture(t);mkdirSync(join(f.installRoot,'node_modules/pkg'),{recursive:true});writeFileSync(join(f.installRoot,'node_modules/pkg/index.js'),'preexisting');const r=measureDependencyTree({root:f.installRoot});assert.equal(r.attested,false);assert.equal(r.status,'measurement-only');assert.equal(r.entries.find(e=>e.path==='node_modules/pkg/index.js').sha256,sha(Buffer.from('preexisting')));
});
test('owner canonical binding preserves the original signed bytes and survives removal of an input alias',async t=>{
 const f=fixture(t),s=await f.authority.installAndSeal(f.install),original=readFileSync(s.sealPath),alias=join(f.root,'legacy-alias');symlinkSync(f.installRoot,alias,process.platform==='win32'?'junction':'dir');
 const bound=await f.authority.rebindCanonicalPath({installRoot:alias,sealPath:s.sealPath});assert.equal(bound.canonicalRoot,resolve(f.installRoot));assert.deepEqual(readFileSync(s.sealPath),original);assert.notEqual(bound.sealPath,s.sealPath);
 const document=JSON.parse(readFileSync(bound.sealPath));assert.equal(document.kind,'dependency-canonical-alias-seal');assert.deepEqual(Buffer.from(document.originSeal.documentBase64,'base64'),original);unlinkSync(alias);
 assert.equal(f.authority.verify({installRoot:bound.canonicalRoot,sealPath:bound.sealPath}).ok,true);
});
test('same bytes at another directory, a changed source tree, or altered old signatures cannot obtain a canonical binding',async t=>{
 const f=fixture(t),s=await f.authority.installAndSeal(f.install),g=fixture(t);await g.authority.installAndSeal(g.install);
 await assert.rejects(()=>f.authority.rebindCanonicalPath({installRoot:g.installRoot,sealPath:s.sealPath}),e=>e.code==='UNTRUSTED_SEAL');
 const h=fixture(t),hs=await h.authority.installAndSeal(h.install);writeFileSync(join(h.installRoot,'node_modules/pkg/lib/main.js'),'changed');await assert.rejects(()=>h.authority.rebindCanonicalPath({installRoot:h.installRoot,sealPath:hs.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
 const j=fixture(t),js=await j.authority.installAndSeal(j.install),doc=JSON.parse(readFileSync(js.sealPath));doc.installRecord.exitCode=0;doc.installRecord.runId='forged';writeFileSync(js.sealPath,JSON.stringify(doc));await assert.rejects(()=>j.authority.rebindCanonicalPath({installRoot:j.installRoot,sealPath:js.sealPath}),e=>e.code==='UNTRUSTED_SEAL');
});
test('canonical seals reject later content changes and forged bindings, and refuse link-bearing first-version migrations',async t=>{
 const f=fixture(t),s=await f.authority.installAndSeal(f.install),b=await f.authority.rebindCanonicalPath({installRoot:f.installRoot,sealPath:s.sealPath});writeFileSync(join(f.installRoot,'node_modules/pkg/lib/main.js'),'changed');assert.throws(()=>f.authority.verify({installRoot:b.canonicalRoot,sealPath:b.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
 const g=fixture(t),gs=await g.authority.installAndSeal(g.install),gb=await g.authority.rebindCanonicalPath({installRoot:g.installRoot,sealPath:gs.sealPath}),doc=JSON.parse(readFileSync(gb.sealPath));doc.binding.canonicalRoot=f.installRoot;writeFileSync(gb.sealPath,JSON.stringify(doc));assert.throws(()=>g.authority.verify({installRoot:g.installRoot,sealPath:gb.sealPath}),e=>e.code==='UNTRUSTED_SEAL');
 const h=fixture(t,{mode:'internal-link'}),hs=await h.authority.installAndSeal(h.install);await assert.rejects(()=>h.authority.rebindCanonicalPath({installRoot:h.installRoot,sealPath:hs.sealPath}),e=>e.code==='UNSUPPORTED_CANONICAL_REBIND');
});
test('actual npm offline local installation seals source provenance and rejects later dependency edits',async t=>{
 const f=fixture(t),npmCli=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 if(!existsSync(npmCli)){t.skip('This Node installation has no adjacent npm CLI');return;}
 const local=join(f.root,'trusted-local-package');mkdirSync(local);writeFileSync(join(local,'package.json'),'{"name":"local-fixture","version":"1.0.0","main":"index.js"}');writeFileSync(join(local,'index.js'),'module.exports={n:23};\n');
 writeFileSync(f.install.sourcePackage.path,JSON.stringify({name:'real-offline-install-fixture',version:'1.0.0',private:true,dependencies:{'local-fixture':'file:'+local.replaceAll('\\','/')}}));
 const env={...process.env,npm_config_update_notifier:'false',npm_config_cache:join(f.root,'fixture-npm-cache')};
 execFileSync(process.execPath,[npmCli,'install','--package-lock-only','--ignore-scripts','--offline','--no-audit','--no-fund'],{cwd:f.sources,env,timeout:60000});
 const authority=createDependencySealAuthority({...f.config,trustedLinkRoots:[{id:'local-fixture',path:local}]});
 // Only this isolated real-npm fixture bootstraps an expected tool tree by
 // observation. Production must obtain it from a verified publisher artifact.
 const toolRoot=dirname(dirname(npmCli)),expectedTreeSha256=measureDependencyTree({root:toolRoot}).treeSha256;
 const sealed=await authority.installAndSeal({...f.install,sourcePackage:{path:f.install.sourcePackage.path,sha256:sha(readFileSync(f.install.sourcePackage.path))},sourceLock:{path:f.install.sourceLock.path,sha256:sha(readFileSync(f.install.sourceLock.path))},installer:{nodePath:process.execPath,nodeSha256:nodeSha,npmCliPath:npmCli,npmCliSha256:sha(readFileSync(npmCli)),toolRoot,expectedTreeSha256},offline:true});
 assert.equal(authority.verify({installRoot:f.installRoot,sealPath:sealed.sealPath}).ok,true);
 execFileSync(process.execPath,['-e',"if(require(process.argv[1]).n!==23)process.exit(9)",join(f.installRoot,'node_modules/local-fixture')]);
 writeFileSync(join(f.installRoot,'node_modules/local-fixture/index.js'),'module.exports={n:99};\n');assert.throws(()=>authority.verify({installRoot:f.installRoot,sealPath:sealed.sealPath}),e=>e.code==='DEPENDENCY_CHANGED');
});
