import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {requiredSessionPolicy} from './policy.mjs';

test('mandatory launcher policy is independent of the optional bundle and preserves prior injections',()=>{
  const entries=[{id:'llm',inject:['priorLlmGate']},{id:'tools',inject:{nativePermissionGate:{mode:'preserved'}}},{id:'agent-loop',inject:['priorAgentGate']}];
  const before=structuredClone(entries),factoryModule=resolve('trusted-factory.mjs');
  const policy=requiredSessionPolicy({entries,factoryModule});assert.deepEqual(entries,before);
  assert.deepEqual(policy.find(p=>p.id==='llm').inject,['priorLlmGate','workflowBrokerInstalled']);
  assert.deepEqual(policy.find(p=>p.id==='tools').inject,{nativePermissionGate:{mode:'preserved'},workflowBrokerInstalled:null});
  assert.deepEqual(policy.find(p=>p.id==='agent-loop').inject,['priorAgentGate','workflowBrokerReady']);
  const inserted=policy.find(p=>p.insert)?.insert;assert.equal(inserted.length,1);assert.equal(inserted[0].config.factoryModule,factoryModule);assert.match(inserted[0].name,/index\.mjs$/);
  const next=requiredSessionPolicy({entries:[...entries,...inserted],factoryModule,eventFile:resolve('private-events.jsonl')});assert.equal(next.find(p=>p.id==='required-workflow-session-broker').config.eventFile,resolve('private-events.jsonl'));assert(!next.some(p=>p.insert));
});

test('mandatory policy refuses ambiguous or absent native service rows and relative factories',()=>{
  const entries=['llm','tools','agent-loop'].map(id=>({id}));
  for(const changed of [entries.slice(1),[...entries,{id:'tools'}],[...entries,{id:'required-workflow-session-broker'}]])assert.throws(()=>requiredSessionPolicy({entries:changed,factoryModule:resolve('factory.mjs')}));
  assert.throws(()=>requiredSessionPolicy({entries,factoryModule:'factory.mjs'}));
});
