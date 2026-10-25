import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,symlinkSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {createSourceProvider} from './source-provider.mjs';
import {publicUrl,isPublicAddress,resolvePublicUrl,requestPublicHTTPS,validateResponse} from './source-provider.http.mjs';

function fixture(t,{license=true,binary=false}={}){
 const root=mkdtempSync(join(tmpdir(),'source-provider-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith('source-provider-test-'));rmSync(root,{recursive:true,force:true});});
 const installed=join(root,'skills'),skill=join(installed,'example-method');mkdirSync(join(skill,'references'),{recursive:true});
 writeFileSync(join(skill,'SKILL.md'),'\ufeff---\nname: >-\n  formal name differs from directory\ndescription: |\n  Nested: metadata is not parsed here.\n---\n# Example method\nRead [method](references/method.md).\n');writeFileSync(join(skill,'references/method.md'),'# Actual current procedure\n');
 if(license)writeFileSync(join(skill,'LICENSE'),'MIT controlled test license body\n');if(binary)writeFileSync(join(skill,'asset.png'),Buffer.from([0xff,0,0xfe]));
 const provider=createSourceProvider({installedRoots:[installed],cacheRoot:join(root,'cache'),external:false});return {root,installed,skill,provider};
}
const blob=bytes=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes])).digest('hex');
function remoteFixture({missingLicense=false,truncated=false,symlink=false}={}){
 const files=new Map([['skills/example-method/SKILL.md',Buffer.from('# Example\nRead [method](references/method.md).\n')],['skills/example-method/references/method.md',Buffer.from('# Complete current method\n')],...(!missingLicense?[['LICENSE',Buffer.from('MIT upstream license body\n')]]:[])]);
 const commit='a'.repeat(40),tree='b'.repeat(40),requests=[];
 const get=async(url)=>{requests.push(url);const u=new URL(url);let bytes;
  if(u.hostname==='skills.sh')bytes=Buffer.from(JSON.stringify({skills:[{id:'owner/repo/example-method',source:'owner/repo',skillId:'example-method',name:'Example',installs:1200}]}));
  else if(u.pathname==='/repos/owner/repo/commits/HEAD')bytes=Buffer.from(JSON.stringify({sha:commit,commit:{tree:{sha:tree}}}));
  else if(u.pathname===`/repos/owner/repo/git/trees/${tree}`)bytes=Buffer.from(JSON.stringify({sha:tree,truncated,tree:[...files].map(([path,b])=>({path,type:'blob',mode:symlink&&path.endsWith('method.md')?'120000':'100644',size:b.length,sha:blob(b)}))}));
  else if(u.hostname==='raw.githubusercontent.com')bytes=files.get(decodeURIComponent(u.pathname.split('/').slice(4).join('/')));
  if(!bytes)throw new Error('Unexpected URL '+url);return {status:200,headers:{'content-length':String(bytes.length)},bytes};
 };return {get,files,requests,commit};
}

test('local discovery only offers name hints and exact byte provenance, not guessed YAML metadata',async t=>{
 const f=fixture(t),result=await f.provider.search('example method');const candidate=result.candidates[0];assert(candidate);assert.equal(candidate.metadataStatus,'not-parsed');assert.equal(candidate.nameHint,'example-method');assert.equal(candidate.version,null);
 const acquired=await f.provider.acquire(candidate.id);assert.equal(acquired.status,'ready');assert(acquired.manifest.some(x=>x.path==='references/method.md'));assert.equal(readFileSync(join(acquired.path,'SKILL.md'))[0],0xef);
 assert(acquired.manifest.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));assert.equal(acquired.readConfirmed,false);
 const again=await f.provider.acquire(candidate.id);assert.equal(again.path,acquired.path);
 writeFileSync(join(f.skill,'references/method.md'),'Changed actual current procedure\n');const changed=await f.provider.acquire(candidate.id);assert.notEqual(changed.version,acquired.version);
});
test('missing license and binary resources are explicit incomplete capabilities',async t=>{
 const f=fixture(t,{license:false}),s=await f.provider.search('example');const result=await f.provider.acquire(s.candidates[0].id);assert.equal(result.status,'incomplete');assert(result.missing.includes('license_missing'));
 const empty=fixture(t);writeFileSync(join(empty.skill,'LICENSE'),'\n  ');const es=await empty.provider.search('example');assert.equal((await empty.provider.acquire(es.candidates[0].id)).status,'incomplete');
 const g=fixture(t,{binary:true}),r=await g.provider.search('example');const b=await g.provider.acquire(r.candidates[0].id);assert.equal(b.status,'needs_viewer');assert(b.manifest.some(x=>x.encoding==='binary'));assert.equal(b.readConfirmed,false);
});

test('installed source hard links cannot launder private external text as an inspected resource',async t=>{
 const f=fixture(t),secret=join(f.root,'private-note.txt');writeFileSync(secret,'PRIVATE_SOURCE_SENTINEL');linkSync(secret,join(f.skill,'references/alias.txt'));
 const s=await f.provider.search('example');await assert.rejects(()=>f.provider.acquire(s.candidates[0].id),e=>e.code==='UNSAFE_RESOURCE');
});
test('cache payload tampering fails instead of treating directory existence as availability',async t=>{
 const f=fixture(t),s=await f.provider.search('example');const a=await f.provider.acquire(s.candidates[0].id);writeFileSync(join(a.path,'LICENSE'),'tampered');await assert.rejects(()=>f.provider.acquire(s.candidates[0].id),e=>e.code==='CACHE_INTEGRITY');
});
test('cache directory redirection and unresolved outside references are not accepted',async t=>{
 const f=fixture(t),foreign=join(f.root,'foreign');mkdirSync(foreign);mkdirSync(join(f.root,'cache'),{recursive:true});symlinkSync(foreign,join(f.root,'cache/bundles'),process.platform==='win32'?'junction':'dir');
 const s=await f.provider.search('example');await assert.rejects(()=>f.provider.acquire(s.candidates[0].id),e=>e.code==='CACHE_INTEGRITY');assert.deepEqual([...readFileSync(join(f.skill,'LICENSE'))].slice(0,3),[77,73,84]);
 const g=fixture(t);writeFileSync(join(g.skill,'SKILL.md'),'# Example method\nRead [outside](../private.md).');const q=await g.provider.search('example');const a=await g.provider.acquire(q.candidates[0].id);assert.equal(a.status,'incomplete');assert(a.missing.some(m=>m.startsWith('unresolved_local_reference:')));
});
test('actual remote catalog hit pins current commit and verifies every acquired Git blob',async t=>{
 const f=fixture(t),remote=remoteFixture(),p=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'remote-cache'),get:remote.get});
 const search=await p.search('example');assert.equal(search.candidates.length,1);const acquired=await p.acquire(search.candidates[0].id);assert.equal(acquired.status,'ready');assert.equal(acquired.source.commit,remote.commit);assert.equal(acquired.license.originPath,'LICENSE');assert.equal(acquired.manifest.length,3);
 assert(remote.requests.some(u=>u.includes(remote.commit)));assert(acquired.manifest.every(x=>x.originPath));
});
test('remote missing license, truncated tree and symlink resources never become complete bundles',async t=>{
 const f=fixture(t);
 for(const options of [{missingLicense:true},{truncated:true},{symlink:true}]){
  const remote=remoteFixture(options),p=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'remote-'+JSON.stringify(options).replaceAll(/[^a-z]/gi,'')),get:remote.get});const s=await p.search('example');
  if(options.missingLicense){const a=await p.acquire(s.candidates[0].id);assert.equal(a.status,'incomplete');assert(a.missing.includes('license_missing'));}
  else await assert.rejects(()=>p.acquire(s.candidates[0].id),e=>['TRUNCATED_TREE','UNSAFE_RESOURCE'].includes(e.code));
 }
});
test('remote resource limits reject before fetching or writing partial bundles',async t=>{
 const f=fixture(t),remote=remoteFixture(),p=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'limited'),get:remote.get,maxFiles:1});const s=await p.search('example');await assert.rejects(()=>p.acquire(s.candidates[0].id),e=>e.code==='SOURCE_LIMIT');assert(!remote.requests.some(u=>u.includes('raw.githubusercontent')));
});
test('downloaded raw bytes must match the actual fixed Git blob instead of a new-looking label',async t=>{
 const f=fixture(t),remote=remoteFixture();const get=async(url,options)=>{const r=await remote.get(url,options);if(url.includes('raw.githubusercontent.com')&&url.endsWith('method.md')){r.bytes=Buffer.from(r.bytes);r.bytes[0]^=1;}return r;};
 const p=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'wrong-blob'),get});const s=await p.search('example');await assert.rejects(()=>p.acquire(s.candidates[0].id),e=>e.code==='GIT_BLOB_INTEGRITY');
});
test('SSRF policy rejects obfuscated, private, special-purpose, credential and redirect targets',async()=>{
 for(const url of ['http://example.com/','https://127.1/','https://2130706433/','https://0x7f000001/','https://10.2.3.4/','https://169.254.169.254/','https://[::1]/','https://[::ffff:127.0.0.1]/','https://[64:ff9b::a00:1]/','https://user:pass@example.com/','https://example.com:8443/','https://host.internal/'])assert.throws(()=>publicUrl(url),e=>['UNSAFE_URL','SSRF_BLOCKED'].includes(e.code),url);
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700::1111'),true);assert.equal(isPublicAddress('2001:db8::1'),false);
 const lookup=async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}];await assert.rejects(()=>resolvePublicUrl('https://public.example/',{lookup}),e=>e.code==='SSRF_DNS_BLOCKED');
 await assert.rejects(()=>requestPublicHTTPS('https://public.example/',{lookup}),e=>e.code==='SSRF_DNS_BLOCKED');
 assert.throws(()=>validateResponse({status:302,headers:{location:'https://127.0.0.1/'},bytes:Buffer.alloc(0)},100),e=>e.code==='REDIRECT_BLOCKED');
});
test('reference bytes are never silently truncated or executed and binary remains explicit',async t=>{
 const f=fixture(t),get=async()=>({status:200,headers:{'content-length':'100'},bytes:Buffer.from('short')});const p=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'refs'),get});await assert.rejects(()=>p.fetchReference('https://example.com/page'),e=>e.code==='TRUNCATED_RESPONSE');
 const b=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'binary-ref'),get:async()=>({status:200,headers:{'content-type':'application/pdf'},bytes:Buffer.from([0xff,0])})});const result=await b.fetchReference('https://example.com/paper.pdf');assert.equal(result.status,'binary_requires_viewer');assert.equal(result.truncated,false);assert.equal(result.readConfirmed,false);
 assert.throws(()=>validateResponse({status:200,headers:{},bytes:Buffer.alloc(101)},100),e=>e.code==='SOURCE_LIMIT');
 const ascii=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'ascii-pdf'),get:async()=>({status:200,headers:{'content-type':'application/pdf'},bytes:Buffer.from('%PDF-1.7\nASCII is not rendered page evidence')})});assert.equal((await ascii.fetchReference('https://example.com/ascii.pdf')).status,'binary_requires_viewer');
 const zero=createSourceProvider({installedRoots:[],cacheRoot:join(f.root,'empty-ref'),get:async()=>({status:200,headers:{},bytes:Buffer.alloc(0)})});await assert.rejects(()=>zero.fetchReference('https://example.com/empty'),e=>e.code==='EMPTY_SOURCE');
});
test('DNS stalls and pre-aborted network actions fail before a connection can start',async()=>{
 await assert.rejects(()=>requestPublicHTTPS('https://example.com/',{timeoutMs:10,lookup:()=>new Promise(()=>{})}),e=>e.code==='SOURCE_TIMEOUT');
 const abort=new AbortController();abort.abort();let lookedUp=false;await assert.rejects(()=>requestPublicHTTPS('https://example.com/',{signal:abort.signal,lookup:async()=>{lookedUp=true;return [{address:'8.8.8.8',family:4}];}}),e=>e.code==='SOURCE_ABORTED');assert.equal(lookedUp,false);
});
