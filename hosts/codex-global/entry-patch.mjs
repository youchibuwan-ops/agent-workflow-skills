import {createHash} from 'node:crypto';
export const INSTALLED_MAIN_SHA256='2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f';
/** Pure transform only. Caller must rebuild private ASAR and private PE integrity resource. */
export function patchMainTransport(source,{gatewayUrl,expectedHash=INSTALLED_MAIN_SHA256,suppressBackgroundMetadata=expectedHash===INSTALLED_MAIN_SHA256,suppressUncontrolledExecutor=expectedHash===INSTALLED_MAIN_SHA256}={}){
 const actual=createHash('sha256').update(source).digest('hex');if(actual!==expectedHash)throw Error('Installed main bundle hash mismatch; refusing patch');
 if(typeof suppressBackgroundMetadata!=='boolean'||expectedHash===INSTALLED_MAIN_SHA256&&!suppressBackgroundMetadata)throw Error('Explicit boolean background metadata policy required; verified vendor metadata generation cannot be enabled');
 if(typeof suppressUncontrolledExecutor!=='boolean'||expectedHash===INSTALLED_MAIN_SHA256&&!suppressUncontrolledExecutor)throw Error('Explicit boolean executor policy required; uncontrolled vendor execution cannot be enabled');
 let url;try{url=new URL(gatewayUrl);}catch{throw Error('Opaque loopback gateway URL required');}
 if(url.protocol!=='ws:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||!/^\/workflow\/[A-Za-z0-9_-]{32,}$/.test(url.pathname))throw Error('Opaque loopback gateway URL required');
 const anchor='function _7(e){';
 const registration='this.durableThreadHostConfig!=null){let e=this.createAppServerConnection(this.durableThreadHostConfig.id,this.durableThreadHostConfig,!1,a);this.executionHostRegistry.add(this.durableThreadHostConfig.id,e),this.appServerConnectionRegistry.addConnection(this.durableThreadHostConfig.id,e)}';
 const configured='getConfiguredHostIds:()=>[u.h,...this.durableThreadHostConfig==null?[]:[this.durableThreadHostConfig.id],...this.getRemoteConnections().map(e=>e.hostId)]';
 const portal='new TIe({statsig:this.publishedStatsig,assertDestinationAllowed:t=>e.applicationNetwork.assertAllowed(t),auth:a,desktopApiOptions:e,hostConfig:this.durableThreadHostConfig,getConnection:A,fallback:j})';
 for(const [name,value] of [['Transport factory',anchor],['Durable registration',registration],['Configured hosts',configured],['Cloud portal',portal]])if(source.split(value).length!==2)throw Error(`${name} anchor is not unique`);
 const metadata=[
  ['Title','async generateTitle({hostId:e,prompt:t,maxTitleChars:n,refreshFrom:r,cwd:a,readOnlyAppToolAllowlist:o,serviceName:c}){'],
  ['Description','async generateDescription({hostId:e,threadId:t,title:n,cwd:r,serviceName:i}){'],
  ['Summary','async generateSummary({hostId:e,principalIdentity:t,threadId:n,title:r,previousUserMessage:i,previousAssistantMessage:a,latestMessage:o,phase:c,cwd:l,includeCompactSummary:d,serviceName:f}){']
 ];
 if(suppressBackgroundMetadata)for(const [name,value]of metadata)if(source.split(value).length!==2)throw Error(`${name} metadata anchor is not unique`);
 const work='start(){if(this.clearingRegistrations||(this.enabled=!0,this.state={...this.state,enabled:!0}';
 if(suppressUncontrolledExecutor&&source.split(work).length!==2)throw Error('Work executor anchor is not unique');
 // Preserve vendor metadata, but never register a remote host or instantiate its HTTP portal.
 // A rejected portal must not return null: the vendor interprets null as a cloud-exec fallback.
 const deniedPortal='({create:async()=>{throw Error("Workflow host route denied before connection")},getSshPortal:async()=>{throw Error("Workflow host route denied before connection")},dispose(){}})';
 const injected=`if(!e||!e.hostConfig||e.hostConfig.id!=="local"||e.hostConfig.kind!=="local"||e.transportKind!=="standard"||e.hostConfig.websocket_url!=null||e.hostConfig.distro!=null||e.hostConfig.ssh!=null||e.hostConfig.ssh_host!=null||e.hostConfig.transportKind!=null||e.hostConfig.transport_kind!=null||Egt(e.hostConfig)||i.zi(e.hostConfig)||i.Mi(e.hostConfig.id))throw Error("Workflow host route denied before connection");return new l.E({hostConfig:e.hostConfig,websocketUrl:${JSON.stringify(url.href)}});`;
 let patched=source.replace(anchor,anchor+injected).replace(registration,'!1){}').replace(configured,'getConfiguredHostIds:()=>[u.h]').replace(portal,deniedPortal);
 // The private desktop must not silently start paid auxiliary workflows. Keep
 // method signatures/destructuring (including argument side effects) intact;
 // null uses the renderer's existing local provisional-title fallback. No
 // prompt matching or new execution exception is added to the gateway.
 // Custom-hash transport-only fixtures retain their narrower legacy policy;
 // the production fixed vendor hash always requires all metadata anchors.
 if(suppressBackgroundMetadata)for(const [,value]of metadata)patched=patched.replace(value,value+'return null;');
 // Reuse the native manager's disabled/stop path. Returning null or a fake
 // enabled manager would conceal this unsupported, unguarded execution route.
 if(suppressUncontrolledExecutor)patched=patched.replace(work,work.replace('start(){','start(){return this.setEnabled(!1,"workflow_host_unavailable");'));
 return {source:patched,inputSha256:actual,outputSha256:createHash('sha256').update(patched).digest('hex'),anchor,injectedBytes:Buffer.byteLength(injected),backgroundMetadata:suppressBackgroundMetadata?'disabled-local-title-fallback':'legacy-transport-fixture-only',uncontrolledExecutor:suppressUncontrolledExecutor?'disabled-native-manager-path':'legacy-transport-fixture-only'};
}
