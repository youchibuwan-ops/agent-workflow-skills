import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcome,assertHostIsolation } from './launcher.mjs';

test('a completed model turn never marks an incomplete workflow as done',()=>{
  assert.equal(classifyOutcome({complete:false,stage:'selection'}, {kind:'completed'}).status,'waiting');
});
test('an aborted or missing model turn cannot mark a completed controller successful',()=>{
  for(const reason of [{kind:'aborted'},undefined]) assert.equal(classifyOutcome({complete:true,stage:'complete'},reason).status,'blocked');
});
test('only completed workflow plus completed turn produces complete',()=>{
  assert.equal(classifyOutcome({complete:true,stage:'complete'},{kind:'completed'}).status,'complete');
});
test('host profile and runtime directories cannot be within the actor workspace',()=>{
  for(const host of ['workspace','workspace/state','workspace/runtime']) assert.throws(()=>assertHostIsolation('workspace',[host]));
  assert.doesNotThrow(()=>assertHostIsolation('workspace',['private-state','stable-runtime']));
});
