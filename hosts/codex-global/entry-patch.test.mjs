import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {patchMainTransport} from './entry-patch.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const url='ws://127.0.0.1:12345/workflow/'+'a'.repeat(64);
// Only this small fixture executes, with the pinned vendor's actual field shapes.
const registration='this.durableThreadHostConfig!=null){let e=this.createAppServerConnection(this.durableThreadHostConfig.id,this.durableThreadHostConfig,!1,a);this.executionHostRegistry.add(this.durableThreadHostConfig.id,e),this.appServerConnectionRegistry.addConnection(this.durableThreadHostConfig.id,e)}';
const configured='getConfiguredHostIds:()=>[u.h,...this.durableThreadHostConfig==null?[]:[this.durableThreadHostConfig.id],...this.getRemoteConnections().map(e=>e.hostId)]';
const portal='new TIe({statsig:this.publishedStatsig,assertDestinationAllowed:t=>e.applicationNetwork.assertAllowed(t),auth:a,desktopApiOptions:e,hostConfig:this.durableThreadHostConfig,getConnection:A,fallback:j})';
const fixture=`function _7(e){return new Original(e)};
const Lje='wss://vendor-cloud.invalid/';function rE(e){return{id:i.wi,display_name:\`Long-lived\`,kind:\`local\`,websocket_url:Lje}}
class Fixture{
 constructor(e={},a={}){
  this.durableThreadHostConfig=rE(e);this.executionHostRegistry={add:()=>{throw Error('durable registry must not run')}};this.appServerConnectionRegistry={addConnection:()=>{throw Error('durable registry must not run')}};
  this.getRemoteConnections=()=>[{hostId:'remote-ssh:sample'}];this.configuration={${configured}};
  this.local=this.createAppServerConnection('local',{id:'local',display_name:'Local',kind:'local'});
  if(this.constructorSideEffect=true,${registration}
  this.installPortal(e,a);
 }
 createAppServerConnection(id,hostConfig){return _7({transportKind:'standard',hostConfig})}
 installPortal(e,a){let A=()=>{throw Error('durable connection must not be read')},j=()=>{throw Error('cloud fallback must not run')};this.cloudPortals=${portal};return this.cloudPortals}
}
globalThis.fixtureAPI={factory:_7,Fixture,durableFactory:rE};`;
function transformed(source=fixture){return patchMainTransport(source,{expectedHash:sha(source),gatewayUrl:url});}
function load({forceCli=false}={}){
 const calls={transport:[],portal:0};
 const context={URL,u:{h:'local'},i:{wi:'durable',zi:h=>h?.kind==='wsl',Mi:id=>id==='durable'},Egt:h=>!forceCli&&h.kind==='ssh'?{}:null,
  l:{E:class{constructor(p){calls.transport.push(p);this.p=p;}}},Original:class{constructor(){throw Error('original transport must not execute');}},
  TIe:class{constructor(e){calls.portal++;new URL(e.hostConfig.websocket_url);throw Error('original portal HTTP client must not be created');}}};
 vm.runInNewContext(transformed().source,context);return {...context.fixtureAPI,calls};
}
test('local startup keeps durable metadata without registering or advertising a durable connection',()=>{
 const {Fixture,calls,durableFactory}=load(),instance=new Fixture();
 assert.equal(instance.constructorSideEffect,true);assert.equal(instance.local.p.websocketUrl,url);
 assert.deepEqual(JSON.parse(JSON.stringify(instance.durableThreadHostConfig)),{id:'durable',display_name:'Long-lived',kind:'local',websocket_url:'wss://vendor-cloud.invalid/'});
 assert.equal(durableFactory({}).id,'durable');assert.deepEqual([...instance.configuration.getConfiguredHostIds()],['local']);
 assert.equal(calls.transport.length,1);assert.equal(calls.portal,0);
});
test('nonnull denied portal rejects both operations without consulting auth, flags, fallback or HTTP',async()=>{
 const {Fixture,durableFactory,calls}=load(),instance=Object.create(Fixture.prototype);instance.durableThreadHostConfig=durableFactory({});
 const forbidden=new Proxy({},{get(){throw Error('forbidden dependency consulted');}});instance.publishedStatsig=forbidden;
 const denied=instance.installPortal({applicationNetwork:forbidden},forbidden);
 assert(denied);assert.equal(typeof denied.dispose,'function');
 await assert.rejects(denied.create({environmentId:'sample'}),/Workflow host route denied/);
 await assert.rejects(denied.getSshPortal('sample'),/Workflow host route denied/);
 assert.doesNotThrow(()=>{denied.dispose();denied.dispose();});
 assert.equal(calls.portal,0);assert.equal(calls.transport.length,0);
});
test('only genuine standard local transport reaches the fixed gateway, including when FORCE_CLI bypasses Egt',()=>{
 const denied=[
  {hostConfig:{id:'durable',kind:'local',websocket_url:'wss://vendor-cloud.invalid/'}},
  ...['ssh','wsl','remote-control','unknown',undefined].map(kind=>({hostConfig:{id:'local',kind}})),
  ...[{id:'remote-ssh:sample',kind:'ssh'},{id:'remote-wsl:sample',kind:'wsl'},{id:'remote-control:sample',kind:'remote-control'},
   {id:'unknown',kind:'local'},{id:'local',kind:'local',websocket_url:'ws://evil.invalid/'},
   {id:'local',kind:'local',distro:'Ubuntu'},{id:'local',kind:'local',ssh_host:'example.invalid'},
   {id:'local',kind:'local',ssh:true},{id:'local',kind:'local',transport_kind:'ssh-websocket-v0'},
   {id:'local',kind:'local',transportKind:'remote-control'}].map(hostConfig=>({hostConfig})),
  ...['remote-control','ssh-websocket-v0','unknown'].map(transportKind=>({hostConfig:{id:'local',kind:'local'},transportKind}))
 ];
 for(const forceCli of [false,true]){
  const {factory,calls}=load({forceCli});
  assert.equal(factory({hostConfig:{id:'local',display_name:'Local',kind:'local'},transportKind:'standard'}).p.websocketUrl,url);
  for(const input of denied)assert.throws(()=>factory({transportKind:'standard',...input}),/route denied/,JSON.stringify(input));
  assert.throws(()=>factory({hostConfig:{id:'local',kind:'local'}}),/route denied/);
  assert.throws(()=>factory(null),/route denied/);assert.equal(calls.transport.length,1);
 }
});
test('all four exact patch boundaries must exist once before a transform is returned',()=>{
 for(const anchor of ['function _7(e){',registration,configured,portal]){
  for(const source of [fixture.replace(anchor,''),fixture+anchor])assert.throws(()=>transformed(source),/anchor|unique/i,anchor);
 }
});
test('unknown vendor bytes and unsafe loopback URLs refuse before transformation',()=>{
 assert.throws(()=>patchMainTransport(fixture+' ',{expectedHash:sha(fixture),gatewayUrl:url}),/hash/);
 for(const gatewayUrl of ['ws://evil.invalid/workflow/'+'a'.repeat(64),'ws://127.0.0.1:12/short','ws://user:pass@127.0.0.1:12/workflow/'+'a'.repeat(64)])assert.throws(()=>patchMainTransport(fixture,{expectedHash:sha(fixture),gatewayUrl}),/loopback/);
});

const metadataAnchors=[
 'async generateTitle({hostId:e,prompt:t,maxTitleChars:n,refreshFrom:r,cwd:a,readOnlyAppToolAllowlist:o,serviceName:c}){',
 'async generateDescription({hostId:e,threadId:t,title:n,cwd:r,serviceName:i}){',
 'async generateSummary({hostId:e,principalIdentity:t,threadId:n,title:r,previousUserMessage:i,previousAssistantMessage:a,latestMessage:o,phase:c,cwd:l,includeCompactSummary:d,serviceName:f}){'
];
const metadataFixture=fixture+'\nclass MetadataFixture{'+metadataAnchors.map((anchor,i)=>anchor+`return provider(${i});}`).join('')+'};globalThis.metadataFixture=new MetadataFixture();';
test('title, description and summary return null without provider, registry or auth access while preserving argument evaluation',async()=>{
 let providerCalls=0;const context={provider(){providerCalls++;throw Error('Metadata must never call a provider');}};
 const out=patchMainTransport(metadataFixture,{expectedHash:sha(metadataFixture),gatewayUrl:url,suppressBackgroundMetadata:true});vm.runInNewContext(out.source,context);
 let getterCalls=0;const params={get prompt(){getterCalls++;return 'fixture user input';}};
 assert.equal(await context.metadataFixture.generateTitle(params),null);assert.equal(getterCalls,1,'Original parameter destructuring must still evaluate its getter once');
 assert.equal(await context.metadataFixture.generateDescription({}),null);assert.equal(await context.metadataFixture.generateSummary({}),null);assert.equal(providerCalls,0);
 // This is the frontend's existing null-result branch, not a title prompt bypass.
 const generated=await context.metadataFixture.generateTitle({prompt:'Repair fixture'}),fallback='Repair fixture';assert.equal(generated?.title?.trim()||fallback,'Repair fixture');
 assert.equal(out.backgroundMetadata,'disabled-local-title-fallback');
});
test('metadata suppression requires each exact method anchor once and preserves the existing transport hard gate',()=>{
 for(const anchor of metadataAnchors)for(const source of [metadataFixture.replace(anchor,'async wrongMetadataMethod(){'),metadataFixture+';'+anchor])assert.throws(()=>patchMainTransport(source,{expectedHash:sha(source),gatewayUrl:url,suppressBackgroundMetadata:true}),/metadata.*anchor|unique/i);
 assert.throws(()=>patchMainTransport(metadataFixture,{expectedHash:sha(metadataFixture),gatewayUrl:url,suppressBackgroundMetadata:'true'}),/boolean|metadata/i);
 const out=patchMainTransport(metadataFixture,{expectedHash:sha(metadataFixture),gatewayUrl:url,suppressBackgroundMetadata:true}),calls=[];
 const context={URL,u:{h:'local'},i:{wi:'durable',zi:h=>h?.kind==='wsl',Mi:id=>id==='durable'},Egt:()=>null,l:{E:class{constructor(p){calls.push(p);}}},provider(){throw Error('provider invoked');}};vm.runInNewContext(out.source,context);
 context.fixtureAPI.factory({hostConfig:{id:'local',kind:'local'},transportKind:'standard'});assert.equal(calls.length,1);assert.throws(()=>context.fixtureAPI.factory({hostConfig:{id:'durable',kind:'local'},transportKind:'standard'}),/route denied/);assert.equal(calls.length,1);
});
