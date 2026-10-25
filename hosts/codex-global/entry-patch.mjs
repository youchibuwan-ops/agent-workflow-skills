import {createHash} from 'node:crypto';
export const INSTALLED_MAIN_SHA256='2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f';
/** Pure transform only. Caller must rebuild private ASAR and private PE integrity resource. */
export function patchMainTransport(source,{gatewayUrl,expectedHash=INSTALLED_MAIN_SHA256}={}){
 const actual=createHash('sha256').update(source).digest('hex');if(actual!==expectedHash)throw Error('Installed main bundle hash mismatch; refusing patch');
 let url;try{url=new URL(gatewayUrl);}catch{throw Error('Opaque loopback gateway URL required');}
 if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||!/^\/workflow\/[A-Za-z0-9_-]{32,}$/.test(url.pathname))throw Error('Opaque loopback gateway URL required');
 const anchor='function _7(e){';if(source.split(anchor).length!==2)throw Error('Transport factory anchor is not unique');
 // All earlier branch predicates are evaluated before constructing any transport.
 const injected=`if(!e||!e.hostConfig||e.hostConfig.id!=="local"||Egt(e.hostConfig)||e.transportKind==="remote-control"||i.zi(e.hostConfig)||i.Mi(e.hostConfig.id))throw Error("Workflow host route denied before connection");return new l.E({hostConfig:e.hostConfig,websocketUrl:${JSON.stringify(url.href)}});`;
 const patched=source.replace(anchor,anchor+injected);return {source:patched,inputSha256:actual,outputSha256:createHash('sha256').update(patched).digest('hex'),anchor,injectedBytes:Buffer.byteLength(injected)};
}
