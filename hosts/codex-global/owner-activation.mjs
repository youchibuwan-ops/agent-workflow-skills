import {createServer,request} from 'node:http';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {existsSync,mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';

const endpoint='/owner/activate',windowMs=10000,maxBytes=2048;
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const boundedTimeout=n=>{if(!Number.isInteger(n)||n<100||n>5000)throw Error('Bounded owner activation timeout required');return n;};
const sourcePin=s=>{if(!hex(s))throw Error('Pinned source manifest required for owner activation');return s;};
const portNumber=n=>{if(!Number.isInteger(n)||n<1||n>65535)throw Error('Fixed owner activation port required');return n;};
function keyFor(stateRoot,create=false,rotate=false){
 if(typeof stateRoot!=='string'||!path.isAbsolute(stateRoot))throw Error('Private absolute activation state required');
 if(!existsSync(stateRoot)){if(!create)return null;mkdirSync(stateRoot,{recursive:true});}
 if(lstatSync(stateRoot).isSymbolicLink()||!lstatSync(stateRoot).isDirectory())throw Error('Owner activation state redirected');
 const dir=path.join(realpathSync.native(stateRoot),'owner-activation');
 if(!existsSync(dir)){if(!create)return null;mkdirSync(dir);}
 if(lstatSync(dir).isSymbolicLink()||!lstatSync(dir).isDirectory())throw Error('Owner activation authority redirected');
 const file=path.join(dir,'host.key');
 if(!existsSync(file)){if(!create)return null;try{writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
 const st=lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size!==32)throw Error('Invalid private owner activation key');
 const key=readFileSync(file);if(key.length!==32)throw Error('Invalid private owner activation key');
 if(!rotate)return key;const next=randomBytes(32),temp=path.join(dir,'new-'+randomBytes(16).toString('hex')+'.key');writeFileSync(temp,next,{flag:'wx',mode:0o600});
 try{renameSync(temp,file);}finally{if(existsSync(temp))unlinkSync(temp);}return next;
}
const mac=(key,kind,m)=>createHmac('sha256',key).update(JSON.stringify([kind,m.action??m.status,m.manifest,m.owner,m.nonce,m.time])).digest('hex');
const validMac=(key,kind,m)=>hex(m.mac)&&timingSafeEqual(Buffer.from(mac(key,kind,m)),Buffer.from(m.mac));
const exact=(m,keys)=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.keys(m).length===keys.length&&keys.every(k=>Object.hasOwn(m,k));
const write=(res,code,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify(value));};

/** Same loopback listener later receives the gateway's WebSocket upgrade handler.
 * Only activate is accepted; no request data is passed to the trusted callback. */
export async function createOwnerActivationServer({stateRoot,sourceManifestSha256,ownerConfigSha256,port,onActivate,timeoutMs=1500}={}){
 sourcePin(sourceManifestSha256);sourcePin(ownerConfigSha256);portNumber(port);boundedTimeout(timeoutMs);if(typeof onActivate!=='function')throw Error('Owner activation callback required');
 keyFor(stateRoot,true);const used=new Map();let key,closed=false;
 const server=createServer(async(req,res)=>{
  const deadline=setTimeout(()=>{req.destroy();res.destroy();},timeoutMs);res.once('close',()=>clearTimeout(deadline));
  if(!key){write(res,503,{});return;}
  if(closed||req.method!=='POST'||req.url!==endpoint||req.headers.origin||req.headers['content-type']!=='application/json'||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){write(res,403,{});return;}
  let value;try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw Error('Owner message too large');chunks.push(chunk);}value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(!res.destroyed)write(res,400,{});return;}
  if(!exact(value,['action','manifest','owner','nonce','time','mac'])||!hex(value.manifest)||!hex(value.owner)||!hex(value.nonce)||!Number.isSafeInteger(value.time)){write(res,400,{});return;}
  const reply=status=>{if(res.destroyed||res.writableEnded)return;const response={status,manifest:sourceManifestSha256,owner:ownerConfigSha256,nonce:value.nonce,time:value.time};response.mac=mac(key,'owner-activate-response-v1',response);write(res,status==='activated'?200:409,response);};
  const now=Date.now();for(const [nonce,expires] of used)if(expires<now)used.delete(nonce);
  if(value.action!=='activate'||value.manifest!==sourceManifestSha256||value.owner!==ownerConfigSha256||Math.abs(now-value.time)>windowMs||!validMac(key,'owner-activate-request-v1',value)||used.has(value.nonce)||used.size>=256){reply('denied');return;}
  used.set(value.nonce,value.time+windowMs+1);
  let timer;try{const activated=await Promise.race([Promise.resolve().then(()=>onActivate()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owner activation timed out')),timeoutMs);})]);reply(activated===true?'activated':'starting');}catch{reply('failed');}finally{clearTimeout(timer);}
 });
 server.requestTimeout=timeoutMs;server.headersTimeout=timeoutMs;server.keepAliveTimeout=100;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 // Rotate only after owning the listener: failed competitors must never change
 // the live owner's key, and a cold restart must invalidate captured requests.
 try{key=keyFor(stateRoot,true,true);}catch(e){await new Promise(resolve=>server.close(resolve));throw e;}
 return{server,async close(){if(closed)return;closed=true;if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections?.();});}};
}

/** Only ECONNREFUSED means no owner. Every other transport/authentication failure
 * refuses startup; it never imports native code or inspects/deletes auth files. */
export async function requestOwnerActivation({stateRoot,sourceManifestSha256,ownerConfigSha256,port,timeoutMs=1500}={}){
 sourcePin(sourceManifestSha256);sourcePin(ownerConfigSha256);portNumber(port);boundedTimeout(timeoutMs);const key=keyFor(stateRoot);
 const value={action:'activate',manifest:sourceManifestSha256,owner:ownerConfigSha256,nonce:randomBytes(32).toString('hex'),time:Date.now()};value.mac=key?mac(key,'owner-activate-request-v1',value):'';
 return new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path:endpoint,method:'POST',agent:false,headers:{'content-type':'application/json','content-length':Buffer.byteLength(JSON.stringify(value))}},res=>{
   let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy();reject(Error('Owner activation response exceeds bounds'));}else chunks.push(chunk);});
   res.on('error',()=>reject(Error('Owner activation response failed')));res.on('end',()=>{try{
    const response=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!key||!exact(response,['status','manifest','owner','nonce','time','mac'])||response.nonce!==value.nonce||response.time!==value.time||!validMac(key,'owner-activate-response-v1',response))throw Error('Owner activation response was not authenticated');
    if(response.manifest!==sourceManifestSha256)throw Error('Owner activation source differs from the verified source');
    if(response.owner!==ownerConfigSha256)throw Error('Owner activation configuration differs from the verified owner');
    if(response.status!=='activated'||res.statusCode!==200)throw Error(response.status==='starting'?'Owner is still starting; activation refused':'Owner activation refused');resolve({status:'activated'});
   }catch(e){reject(e);}});
  });
  const deadline=setTimeout(()=>req.destroy(Error('Owner activation connection timed out')),timeoutMs);req.once('close',()=>clearTimeout(deadline));
  req.on('error',e=>{clearTimeout(deadline);if(e.code==='ECONNREFUSED')resolve({status:'absent'});else reject(e);});req.end(JSON.stringify(value));
 });
}
