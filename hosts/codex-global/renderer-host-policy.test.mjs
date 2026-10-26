import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import vm from 'node:vm';
import {patchRendererHostInventory,RENDERER_HOST_POLICIES,assertPrivateHostPolicy,VENDOR_HEADER_SHA256} from './renderer-host-policy.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const archive='b=[a,...a===`local`&&o!=null?[s]:[]]';
const inventory='l2n=Qe(q,({get:e})=>[{available:!0,hostId:Ei},...e(ow)==null?[]:[{available:e(Yg,It)===`connected`,hostId:It}],...Array.from(e(wrt)).map(t=>({available:e(Yg,t)===`connected`,hostId:t}))])';
test('archive sources follow the registered local capability even with a logged-in cloud identity',()=>{
 const source=`let a='local',o={account:true},s='durable',${archive};globalThis.sources=b;globalThis.nativeError=(result)=>result.isError;globalThis.chatgptAccount=o;`,out=patchRendererHostInventory(source,{asset:'archive',expectedHash:sha(source)}),ctx={};vm.runInNewContext(out.source,ctx);
 assert.deepEqual([...ctx.sources],['local']);assert.equal(ctx.chatgptAccount.account,true);assert.equal(ctx.nativeError({isError:true}),true);assert.equal(ctx.nativeError({isError:false}),false);
});
test('production runtime rejects an old private build even when its transport and owner prefix pass',()=>{
 const old={sourceHeaderSha256:VENDOR_HEADER_SHA256};let reads=0;
 assert.throws(()=>assertPrivateHostPolicy({report:old,main:Buffer.from('old transport-only main'),readPacked(){reads++;throw Error('must not read');}}),/private host|executor|policy/i);assert.equal(reads,0);
 for(const mutate of [r=>{r.uncontrolledExecutor='enabled';},r=>{r.rendererHostInventory=[];}]){
  const report={sourceHeaderSha256:VENDOR_HEADER_SHA256,sourceMainSha256:'2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f',uncontrolledExecutor:'disabled-native-manager-path',rendererHostInventory:RENDERER_HOST_POLICIES.map(p=>({path:p.path,inputSha256:p.inputSha256,outputSha256:p.outputSha256,policy:'registered-local-only'}))};mutate(report);
  assert.throws(()=>assertPrivateHostPolicy({report,main:Buffer.from('start(){return this.setEnabled(!1,"workflow_host_unavailable");'),readPacked(){reads++;throw Error('must not read');}}),/private host|executor|policy/i);
 }
});
test('shared sidebar inventory never probes or advertises an unregistered remote executor',()=>{
 const source=`let ${inventory};globalThis.hosts=l2n;`,ctx={q:null,Ei:'local',Qe:(_q,fn)=>fn({get(){throw Error('Unavailable remote capability must not be probed');}})};
 vm.runInNewContext(patchRendererHostInventory(source,{asset:'inventory',expectedHash:sha(source)}).source,ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.hosts)),[{available:true,hostId:'local'}]);
});
test('renderer changes are pinned to the exact asset, original bytes and one unique inventory boundary',()=>{
 assert.equal(RENDERER_HOST_POLICIES.length,2);
 for(const [asset,anchor]of [['archive',archive],['inventory',inventory]]){
  for(const source of ['',anchor+anchor])assert.throws(()=>patchRendererHostInventory(source,{asset,expectedHash:sha(source)}),/anchor|unique/);
  assert.throws(()=>patchRendererHostInventory(anchor+' ',{asset,expectedHash:sha(anchor)}),/hash/);
  assert.throws(()=>patchRendererHostInventory(anchor,{asset}),/hash/);
 }
 assert.throws(()=>patchRendererHostInventory(archive,{asset:'unknown',expectedHash:sha(archive)}),/asset/);
});
