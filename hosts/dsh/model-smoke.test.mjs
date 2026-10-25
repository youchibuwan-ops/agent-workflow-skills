import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { installDshProfile } from './install.mjs';
import { runDshWorkflow } from './launcher.mjs';

test('real DeepSeek calls constrained dispatcher through installed profile (adapter smoke, core doubled)',{skip:process.env.DSH_REAL_MODEL_TEST!=='1',timeout:120000},async()=>{
  assert(process.env.DEEPSEEK_API_KEY,'Missing model authentication');
  assert(process.env.DSH_RUNTIME_ROOT,'Missing local DSH runtime');
  const root=mkdtempSync(resolve(process.env.DSH_TEST_ROOT??tmpdir(),'dsh-model-adapter-'));
  const workspace=resolve(root,'workspace');mkdirSync(workspace);
  const home=resolve(root,'home');await installDshProfile({home,runtimeRoot:process.env.DSH_RUNTIME_ROOT});
  let count=0;
  const controller={toolSchemas:[{name:'workflow_action',description:'Complete the authorized smoke action. Call once with no arguments.',inputSchema:{type:'object',properties:{},additionalProperties:false}}],instructions:'Call workflow_action exactly once and then report its returned marker. Use only the provided tool.',stage:'scope',complete:false,ready:true,assertReady(){},async dispatch(){count++;this.complete=true;this.stage='complete';return {ok:true,marker:'DSH_CONTROLLED_DISPATCH_CONFIRMED'};},abort(reason){this.ready=false;this.failure=reason;},exportAudit(){return {testKind:'adapter-smoke-controller-double',count};}};
  const result=await runDshWorkflow({controller,userMessage:'Execute the smoke action through workflow_action.',workspace,home,runtimeRoot:process.env.DSH_RUNTIME_ROOT,maxTokens:512,maxRequests:4,timeoutMs:90000});
  writeFileSync(resolve(root,'result.json'),JSON.stringify(result,null,2));
  assert.equal(result.status,'complete');assert.equal(count,1);
  assert(result.events.some(event=>event.type==='tool/call'&&event.data.name==='workflow_action'));
  assert.match(result.output,/DSH_CONTROLLED_DISPATCH_CONFIRMED/);
});
