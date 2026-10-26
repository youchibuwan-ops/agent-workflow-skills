import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,mkdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createOwnerActivationServer,requestOwnerActivation} from './owner-activation.mjs';
const manifest='a'.repeat(64),owner='b'.repeat(64);
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
function fixture(t){const root=realpathSync.native(mkdtempSync(path.join(os.tmpdir(),'workflow-activation-')));t.after(()=>rmSync(root,{recursive:true,force:true}));return{stateRoot:path.join(root,'state'),sourceManifestSha256:manifest,ownerConfigSha256:owner};}
const keyPath=f=>path.join(f.stateRoot,'owner-activation/host.key');
function packet(key,extra={}){const p={action:'activate',manifest,owner,nonce:randomBytes(32).toString('hex'),time:Date.now(),...extra};p.mac=createHmac('sha256',key).update(JSON.stringify(['owner-activate-request-v1',p.action,p.manifest,p.owner,p.nonce,p.time])).digest('hex');return p;}
function post(port,body,headers={}){return new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port,path:'/owner/activate',method:'POST',agent:false,headers:{'content-type':'application/json',...headers}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({code:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(JSON.stringify(body));});}
async function fake(t,port,handler){const s=createServer(handler);await new Promise((r,j)=>{s.once('error',j);s.listen(port,'127.0.0.1',r);});t.after(async()=>{s.closeAllConnections();await new Promise(r=>s.close(r));});return s;}
test('only connection refused permits cold startup and never creates or changes auth',async t=>{
 const f=fixture(t),p=await port();assert.deepEqual(await requestOwnerActivation({...f,port:p}),{status:'absent'});assert.equal(existsSync(f.stateRoot),false);
});
test('owner request and response authenticate with an independent key and activation is the only capability',async t=>{
 const f=fixture(t),p=await port();let count=0;const s=await createOwnerActivationServer({...f,port:p,onActivate:()=>{count++;return true;}});t.after(()=>s.close());
 assert.equal(readFileSync(keyPath(f)).length,32);assert.deepEqual(await requestOwnerActivation({...f,port:p}),{status:'activated'});assert.equal(count,1);
 const key=readFileSync(keyPath(f));for(const body of [packet(key,{action:'exec'}),{...packet(key),cmd:'must never execute'},{...packet(key),mac:'0'.repeat(64)},packet(key,{time:Date.now()-60000})])assert.notEqual((await post(p,body)).code,200);
 assert.notEqual((await post(p,packet(key),{origin:'https://untrusted.invalid'})).code,200);assert.equal(count,1);
});
test('a signed nonce is single use and source or owner configuration changes never activate an old owner',async t=>{
 const f=fixture(t),p=await port();let count=0;const s=await createOwnerActivationServer({...f,port:p,onActivate:()=>{count++;return true;}});t.after(()=>s.close());
 const body=packet(readFileSync(keyPath(f)));assert.equal((await post(p,body)).code,200);assert.notEqual((await post(p,body)).code,200);
 await assert.rejects(requestOwnerActivation({...f,port:p,sourceManifestSha256:'c'.repeat(64)}),/source differs/);
 await assert.rejects(requestOwnerActivation({...f,port:p,ownerConfigSha256:'d'.repeat(64)}),/configuration differs/);assert.equal(count,1);
});
test('starting or failed activation stays explicit and never converts to absent',async t=>{
 const f=fixture(t),p=await port();let ready=false;const s=await createOwnerActivationServer({...f,port:p,onActivate:()=>{if(ready)throw Error('second child failed');return false;}});t.after(()=>s.close());
 await assert.rejects(requestOwnerActivation({...f,port:p}),/still starting/);ready=true;await assert.rejects(requestOwnerActivation({...f,port:p}),/refused/);
});
test('fake occupied port, stale authority and malformed private keys refuse without activating',async t=>{
 const f=fixture(t),p=await port();let count=0;const s=await createOwnerActivationServer({...f,port:p,onActivate:()=>{count++;return true;}});const key=readFileSync(keyPath(f));
 writeFileSync(keyPath(f),randomBytes(32));await assert.rejects(requestOwnerActivation({...f,port:p}),/not authenticated/);assert.equal(count,0);
 writeFileSync(keyPath(f),'invalid');await assert.rejects(requestOwnerActivation({...f,port:p}),/Invalid private.*key/);assert.equal(count,0);writeFileSync(keyPath(f),key);await s.close();
 await fake(t,p,(req,res)=>{const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{const value=JSON.parse(Buffer.concat(chunks));res.end(JSON.stringify({status:'activated',manifest,owner,nonce:value.nonce,time:value.time,mac:'0'.repeat(64)}));});});
 await assert.rejects(requestOwnerActivation({...f,port:p}),/not authenticated/);
});
test('a valid old signed response cannot be replayed for a fresh activation request',async t=>{
 const f=fixture(t),p=await port(),s=await createOwnerActivationServer({...f,port:p,onActivate:()=>true});const old=(await post(p,packet(readFileSync(keyPath(f))))).body;await s.close();
 await fake(t,p,(_req,res)=>res.end(JSON.stringify(old)));await assert.rejects(requestOwnerActivation({...f,port:p}),/not authenticated/);
});
test('cold owner restart rejects old signed requests and a competing bind never changes the live authority',async t=>{
 const f=fixture(t),p=await port();let count=0;const options={...f,port:p,onActivate:()=>{count++;return true;}};const first=await createOwnerActivationServer(options),key=readFileSync(keyPath(f)),old=packet(key);
 try{await assert.rejects(createOwnerActivationServer(options),/EADDRINUSE/);assert.deepEqual(readFileSync(keyPath(f)),key);assert.deepEqual(await requestOwnerActivation({...f,port:p}),{status:'activated'});}finally{await first.close();}
 const second=await createOwnerActivationServer(options);t.after(()=>second.close());assert.notEqual((await post(p,old)).code,200);assert.equal(count,1);assert.deepEqual(await requestOwnerActivation({...f,port:p}),{status:'activated'});assert.equal(count,2);
});
test('an occupied trickle service cannot extend the total activation deadline',async t=>{
 const f=fixture(t),p=await port();mkdirSync(path.dirname(keyPath(f)),{recursive:true});writeFileSync(keyPath(f),randomBytes(32));const intervals=[];
 await fake(t,p,(_req,res)=>{res.writeHead(200,{'content-type':'application/json'});intervals.push(setInterval(()=>res.write(' '),20));});t.after(()=>intervals.forEach(clearInterval));
 let timer;const bounded=await Promise.race([requestOwnerActivation({...f,port:p,timeoutMs:100}).then(()=>false,()=>true),new Promise(r=>{timer=setTimeout(()=>r(false),400);})]);clearTimeout(timer);assert.equal(bounded,true,'The absolute deadline must not reset on incoming bytes');
});
