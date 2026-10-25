// Read-only public HTTPS transport. Network policy is trusted host code, never
// a candidate instruction or a model-provided proxy/headers/lookup function.
import https from 'node:https';
import {lookup as lookupDns} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';

export class SourceError extends Error{constructor(code,message){super(message);this.name='SourceError';this.code=code;}}
const deny4=new BlockList(),deny6=new BlockList(),global6=new BlockList();
for(const [base,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])deny4.addSubnet(base,prefix,'ipv4');
global6.addSubnet('2000::',3,'ipv6');
for(const [base,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3ffe::',16],['3fff::',20]])deny6.addSubnet(base,prefix,'ipv6');
export function isPublicAddress(address){
 const kind=isIP(address);return kind===4?!deny4.check(address,'ipv4'):kind===6&&global6.check(address,'ipv6')&&!deny6.check(address,'ipv6');
}
export function publicUrl(input){
 let url;try{url=new URL(input);}catch{throw new SourceError('INVALID_URL','Expected an absolute HTTPS URL');}
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.hash)throw new SourceError('UNSAFE_URL','Only credential-free public HTTPS on port 443 without a fragment is supported');
 if(!host||host==='localhost'||/\.(?:localhost|local|internal|localdomain)$/.test(host)||(isIP(host)&&!isPublicAddress(host)))throw new SourceError('SSRF_BLOCKED','Local, special-purpose and private destinations are not readable sources');
 return url;
}
export async function resolvePublicUrl(input,{lookup=lookupDns}={}){
 const url=publicUrl(input),host=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true,verbatim:true});
 if(!Array.isArray(addresses)||!addresses.length||addresses.some(a=>![4,6].includes(a.family)||isIP(a.address)!==a.family||!isPublicAddress(a.address)))throw new SourceError('SSRF_DNS_BLOCKED','Every resolved address must be a public unicast address');
 return {url,addresses};
}
export function validateResponse(response,maxBytes){
 const status=response.status??response.statusCode,headers=response.headers??{},bytes=Buffer.from(response.bytes??[]);
 if(status>=300&&status<400)throw new SourceError('REDIRECT_BLOCKED','Redirects are not followed; provide the canonical source URL');
 if(status!==200)throw new SourceError(status===403||status===429?'REMOTE_LIMIT_OR_DENIED':'HTTP_STATUS',`Source returned HTTP ${status}`);
 if(headers['content-encoding']&&!/^identity$/i.test(headers['content-encoding']))throw new SourceError('UNSUPPORTED_ENCODING','Compressed transfer content is not accepted by this bounded transport');
 const declared=headers['content-length'];
 if(declared!==undefined&&(!/^\d+$/.test(String(declared))||Number(declared)!==bytes.length))throw new SourceError('TRUNCATED_RESPONSE','Declared content length does not match the complete received body');
 if(bytes.length>maxBytes)throw new SourceError('SOURCE_LIMIT','Source exceeds its byte limit');
 if(response.complete===false)throw new SourceError('TRUNCATED_RESPONSE','Source transport ended before the complete body arrived');
 return {...response,status,headers,bytes};
}
export async function requestPublicHTTPS(input,{maxBytes=4*1024*1024,timeoutMs=20000,headers={},lookup=lookupDns,signal}={}){
 if(signal?.aborted)throw new SourceError('SOURCE_ABORTED','Source fetch cancelled by the trusted host');
 let dnsTimer;const started=Date.now();
 const {url,addresses}=await Promise.race([resolvePublicUrl(input,{lookup}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new SourceError('SOURCE_TIMEOUT','Source DNS resolution exceeded its deadline')),timeoutMs);})]).finally(()=>clearTimeout(dnsTimer));
 timeoutMs=Math.max(1,timeoutMs-(Date.now()-started));
 return new Promise((fulfill,reject)=>{
  let req,settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):fulfill(value);};
  const abort=()=>{const error=new SourceError('SOURCE_ABORTED','Source fetch cancelled by the trusted host');req?.destroy(error);done(error);};
  const timer=setTimeout(()=>{const error=new SourceError('SOURCE_TIMEOUT','Source fetch exceeded its deadline');req?.destroy(error);done(error);},timeoutMs);
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  // Pin the checked DNS answers to the actual connection. No second resolver,
  // inherited proxy, cookie jar, connection pool or automatic redirect exists.
  const pinnedLookup=(_host,options,callback)=>queueMicrotask(()=>options?.all?callback(null,addresses):callback(null,addresses[0].address,addresses[0].family));
  try{req=https.request(url,{method:'GET',agent:false,lookup:pinnedLookup,headers:{'User-Agent':'agent-workflow-source-provider/1','Accept-Encoding':'identity',...headers}},res=>{
   const status=res.statusCode??0;
   if(status!==200){try{validateResponse({status,headers:res.headers,bytes:Buffer.alloc(0)},maxBytes);}catch(error){res.destroy();done(error);return;}}
   if(res.headers['content-encoding']&&!/^identity$/i.test(res.headers['content-encoding'])){res.destroy();done(new SourceError('UNSUPPORTED_ENCODING','Compressed transfer content is not accepted'));return;}
   if(Number(res.headers['content-length']??0)>maxBytes){res.destroy();done(new SourceError('SOURCE_LIMIT','Declared source exceeds its byte limit'));return;}
   const chunks=[];let total=0;
   res.on('data',part=>{total+=part.length;if(total>maxBytes){const error=new SourceError('SOURCE_LIMIT','Source exceeds its byte limit');res.destroy(error);done(error);}else chunks.push(part);});
   res.on('error',error=>done(error));res.on('aborted',()=>done(new SourceError('TRUNCATED_RESPONSE','Source connection aborted')));
   res.on('end',()=>{try{done(null,validateResponse({status,headers:res.headers,bytes:Buffer.concat(chunks),complete:res.complete},maxBytes));}catch(error){done(error);}});
  });req.on('error',error=>done(error));req.end();}catch(error){done(error);}
 });
}
