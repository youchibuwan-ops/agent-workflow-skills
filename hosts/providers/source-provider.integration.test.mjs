import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createSourceProvider} from './source-provider.mjs';
import {SourceError,requestPublicHTTPS} from './source-provider.http.mjs';

test('actual installed Skill, public catalog/current GitHub source+license, and HTTPS facts are usable',{
 skip:process.env.SOURCE_PROVIDER_REAL_NETWORK!=='1',timeout:120000
},async t=>{
 const root=process.env.SOURCE_PROVIDER_EVIDENCE?resolve(process.env.SOURCE_PROVIDER_EVIDENCE):mkdtempSync(join(tmpdir(),'source-provider-real-'));
 mkdirSync(root,{recursive:true});
 if(!process.env.SOURCE_PROVIDER_EVIDENCE)t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith('source-provider-real-'));rmSync(root,{recursive:true,force:true});});
 const provider=createSourceProvider({installedRoots:[process.env.SOURCE_PROVIDER_INSTALLED_ROOT??join(homedir(),'.codex/skills')],cacheRoot:join(root,'cache')});
 const local=await provider.search('find-skills',{external:false});assert(local.candidates.some(c=>c.kind==='local'));
 const installed=await provider.acquire(local.candidates.find(c=>c.nameHint==='find-skills').id);assert.equal(installed.status,'ready');
 const result=await provider.search('find-skills',{external:true,limit:10});
 const hit=result.candidates.find(c=>c.kind==='github'&&c.source==='https://github.com/vercel-labs/skills');assert(hit,'Official real search candidate missing: '+JSON.stringify(result.diagnostics));
 const acquired=await provider.acquire(hit.id);assert.equal(acquired.status,'ready');assert.match(acquired.source.commit,/^[a-f0-9]{40}$/);assert(acquired.license);assert(acquired.manifest.some(f=>f.path==='SKILL.md'));
 const fallback=createSourceProvider({installedRoots:[],cacheRoot:join(root,'fallback-cache'),get:async(url,options)=>{if(new URL(url).hostname==='skills.sh')throw new SourceError('SOURCE_TIMEOUT','Injected catalog outage; GitHub uses real public HTTPS');return requestPublicHTTPS(url,options);}});
 const fallbackSearch=await fallback.search('find-skills',{external:true,limit:10}),fallbackHit=fallbackSearch.candidates.find(c=>c.source==='https://github.com/vercel-labs/skills');assert(fallbackHit,'Real GitHub fallback must find an actual current tree entry');assert(fallbackSearch.diagnostics.some(d=>d.code==='SOURCE_TIMEOUT'));assert.equal(fallbackSearch.externalUsed,true);const fallbackBundle=await fallback.acquire(fallbackHit.id);assert.equal(fallbackBundle.status,'ready');assert.equal(fallbackBundle.source.repo,'vercel-labs/skills');assert(fallbackBundle.manifest.every(f=>f.gitBlob));
 const reference=await provider.fetchReference('https://nodejs.org/dist/v24.22.1/SHASUMS256.txt');assert.equal(reference.status,'text');assert(readFileSync(reference.path,'utf8').includes('node-v24.22.1-win-x64.zip'));
 const registry=await provider.fetchReference('https://www.iana.org/assignments/iana-ipv4-special-registry');assert.equal(registry.status,'text');assert(readFileSync(registry.path,'utf8').includes('IPv4 Special-Purpose Address Space'));
 const report={status:'pass',node:process.version,local:{version:installed.version,files:installed.manifest.length},external:{id:hit.id,version:acquired.version,source:acquired.source,files:acquired.manifest,license:acquired.license},catalogOutageFallback:{injectedCatalogFailure:true,actualGitHubHTTPS:true,source:fallbackBundle.source,files:fallbackBundle.manifest},references:[reference,registry].map(({url,bytes,sha256,status,truncated,readConfirmed})=>({url,bytes,sha256,status,truncated,readConfirmed})),modelCalled:false};
 writeFileSync(join(root,'result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({evidence:root,commit:acquired.source.commit,files:acquired.manifest.length,references:report.references.map(r=>({bytes:r.bytes,status:r.status})),modelCalled:false}));
});
