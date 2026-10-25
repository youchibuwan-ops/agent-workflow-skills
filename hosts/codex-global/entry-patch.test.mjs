import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import vm from 'node:vm';import {patchMainTransport} from './entry-patch.mjs';
test('fixed-hash insertion blocks remote creation and forces local opaque gateway even FORCE_CLI exists',()=>{
 const fixture='function _7(e){return new Original(e)};globalThis.factory=_7;',hash=createHash('sha256').update(fixture).digest('hex'),url='ws://127.0.0.1:12345/workflow/'+'a'.repeat(64);
 const out=patchMainTransport(fixture,{expectedHash:hash,gatewayUrl:url});let calls=0;const context={Egt:h=>h.ssh,i:{zi:h=>!!h.distro,Mi:id=>id==='durable'},l:{E:class{constructor(p){calls++;this.p=p;}}},Original:class{constructor(){throw Error('must never execute original transport');}}};vm.runInNewContext(out.source,context);
 assert.equal(context.factory({hostConfig:{id:'local'},transportKind:'standard'}).p.websocketUrl,url);
 for(const e of [{hostConfig:{id:'durable'}},{hostConfig:{id:'ssh',ssh:true}},{hostConfig:{id:'local',distro:'Ubuntu'}},{hostConfig:{id:'local'},transportKind:'remote-control'},{hostConfig:{id:'unknown'}}])assert.throws(()=>context.factory(e),/route denied/);
 assert.equal(calls,1);assert.throws(()=>patchMainTransport(fixture+' ',{expectedHash:hash,gatewayUrl:url}),/hash/);assert.throws(()=>patchMainTransport(fixture,{expectedHash:hash,gatewayUrl:'ws://evil/workflow/'+'a'.repeat(64)}),/loopback/);
});
