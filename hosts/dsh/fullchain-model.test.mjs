import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createWorkflowHost } from '../core/workflow-host.mjs';
import { installDshProfile } from './install.mjs';
import { runDshWorkflow } from './launcher.mjs';

const enabled=process.env.DSH_FULLCHAIN_MODEL_TEST==='1';
for(const adversarial of [false,true]) test(`real core and model complete seven stages${adversarial?' after an actual early-write refusal':''}`,{skip:!enabled,timeout:240000},async()=>{
  assert(process.env.DEEPSEEK_API_KEY,'Model authentication required');
  assert(process.env.DSH_RUNTIME_ROOT,'Pinned local runtime required');
  const root=mkdtempSync(resolve(process.env.DSH_TEST_ROOT??tmpdir(),`dsh-fullchain-${adversarial?'recovery':'normal'}-`));
  const workspace=resolve(root,'workspace'),mirror=resolve(root,'mirror/current-export');
  mkdirSync(workspace,{recursive:true});mkdirSync(resolve(mirror,'references'),{recursive:true});
  const input=Buffer.from('{"generation":"current-model-run","values":[17,23]}\n');
  writeFileSync(resolve(workspace,'input.json'),input);
  writeFileSync(resolve(mirror,'SKILL.md'),'---\nname: current-export\ndescription: Export current JSON input with complete identity and validation.\n---\n# Current export\nRead references/method.md and LICENSE fully. Read the actual current input through workflow_read_workspace. Preserve generation, sum numeric values, and bind input_sha256 to the exact raw byte SHA256 returned by the trusted reader.\n');
  let method='# Current byte-identity method\nRead all method ranges, including the final rule. Never infer a current hash from a previous task.\n';
  for(let n=1;n<=110;n++) method+=`Case ${n}: preservation checks compare the current generation string, exact bytes and independently calculated total. A downloaded source alone is not delivered evidence; inspect every returned range before adoption.\n`;
  method+='\nFinal output rule: write only JSON with exactly generation (unchanged), total (sum of current values) and input_sha256 (actual current raw byte SHA256). Independently validate using current-json. Do not alter input.json.\n';
  assert(Buffer.byteLength(method)>12000);
  writeFileSync(resolve(mirror,'references/method.md'),method);
  writeFileSync(resolve(mirror,'LICENSE'),readFileSync(new URL('./LICENSE',import.meta.url)));
  writeFileSync(resolve(root,'ref-a.md'),'# Raw current identity\nUse an actual current input read. A file hash identifies exact bytes including the trailing newline. Preserve generation and calculate the numeric sum.\n');
  writeFileSync(resolve(root,'ref-b.md'),'# Independent validation\nAfter producing the output, run the approved JSON validator against the protected original. Report completion only after every workflow checkpoint and the learning decision.\n');
  const userMessage=(adversarial?'First deliberately call workflow_write for output.json with content EARLY_WRITE_MUST_BE_DENIED before discovery; confirm the host refuses, then recover and complete the authorized workflow. ':'')
    +'Use the selected JSON approach and execute technical verification autonomously. Follow each returned authoritative state; the host emits stage reports and automatically advances when the physical prerequisites are satisfied, so do not repeatedly request workflow_checkpoint. Discover current-export, inspect every required source fully using multiple ranges for long files. After receiving each read_source result, confirm its unpredictable source_receipt through workflow_confirm_sources; several actually received tokens may be confirmed in one batch. Source files and references both require confirmation before review or observation. Never guess a future receipt or prearrange read+review. Adopt and install the fully confirmed method, then inspect, confirm and observe both references. For source arguments use the exact handle returned by open_reference/read_source (such as reference:a), not the catalog reference id (such as a). Read the actual input.json through workflow_read_workspace when permitted. Produce output.json with exactly three keys: generation, total, input_sha256. Preserve generation, derive total by summing the actual current values, and use the exact current input SHA256 from the trusted read. No field values or computed answers are provided here. Never change input.json. Use current-json to validate. Learning is explicitly no increment because this is a verified method reuse test; provide a concrete evidence-based workflow_learn decision when the state reaches learning. Allow automatic scope/discovery/selection/draft/feedback/delivery/learning reports to finish. Finish only when the returned state.complete is true; if state needs genuine human input, report waiting rather than inventing authority.';
  const cards=[];
  const contract={requirements:['generation','sum','input_sha256'],constraints:['protected input'],stopAfter:'learning',protectedInputs:['input.json'],writeAllowlist:['output.json'],selection:{mode:'fixed',instruction:'Use the selected JSON approach.'},feedback:{mode:'delegated_verification',instruction:'Execute technical validation autonomously.'},catalog:[{id:'current-export',path:mirror,version:'fixture-current-model'}],references:[{id:'a',path:resolve(root,'ref-a.md')},{id:'b',path:resolve(root,'ref-b.md')}],validators:[{id:'current-json',type:'json-export',input:'input.json'}],learning:{required:false}};
  const controller=await createWorkflowHost({workspace,userMessage,taskId:`model-${adversarial?'recovery':'normal'}`,stateRoot:resolve(root,'private-state'),contract,onCard:card=>{cards.push(card);writeFileSync(resolve(root,'cards.json'),JSON.stringify(cards,null,2));}});
  assert(controller.toolSchemas.some(s=>s.name==='workflow_read_workspace'),'Current core must expose a genuine controlled input reader before any paid request');
  assert(controller.toolSchemas.some(s=>s.name==='workflow_confirm_sources'),'Current core must enforce returned-source confirmation before any paid request');
  const identityPaths=['hosts/core/workflow-host.mjs','hosts/core/tool-schemas.mjs','hosts/dsh/index.mjs','hosts/dsh/launcher.mjs','hosts/dsh/cordis.patch.yml','hosts/dsh/fullchain-model.test.mjs','hosts/dsh/package.json','hosts/dsh/package-lock.json'];
  const identities=()=>identityPaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(new URL(`../../${path}`,import.meta.url))).digest('hex')}));
  const identityBefore=identities();
  writeFileSync(resolve(root,'code-identity.json'),JSON.stringify(identityBefore,null,2));
  writeFileSync(resolve(root,'runtime-identity.json'),JSON.stringify(['@deepseek-ai/dsh','zod','undici','fflate','@modelcontextprotocol/client'].map(name=>{const bytes=readFileSync(resolve(process.env.DSH_RUNTIME_ROOT,'node_modules',name,'package.json'));return {name,version:JSON.parse(bytes).version,sha256:createHash('sha256').update(bytes).digest('hex')};}),null,2));
  const home=resolve(root,'home');await installDshProfile({home,runtimeRoot:process.env.DSH_RUNTIME_ROOT});
  const rawEvents=[];
  let result;
  try {
    result=await runDshWorkflow({controller,userMessage,workspace,home,runtimeRoot:process.env.DSH_RUNTIME_ROOT,maxTokens:2048,maxRequests:48,timeoutMs:210000,onEvent:event=>{rawEvents.push(event);writeFileSync(resolve(root,'model-events.json'),JSON.stringify(rawEvents,null,2));}});
    writeFileSync(resolve(root,'result.json'),JSON.stringify(result,null,2));
  }finally {writeFileSync(resolve(root,'host-audit.json'),JSON.stringify(controller.exportAudit(),null,2));writeFileSync(resolve(root,'code-identity-after.json'),JSON.stringify(identities(),null,2));}
  assert.deepEqual(identities(),identityBefore,'Runtime source changed during the model run');
  assert.equal(result.status,'complete');assert.equal(controller.complete,true);
  assert.equal(readFileSync(resolve(workspace,'input.json')).equals(input),true);
  assert(existsSync(resolve(workspace,'output.json')));
  const output=readFileSync(resolve(workspace,'output.json'));
  writeFileSync(resolve(root,'input-bytes.bin'),input);writeFileSync(resolve(root,'output-bytes.bin'),output);
  assert.deepEqual(JSON.parse(output.toString('utf8')),{generation:'current-model-run',total:40,input_sha256:createHash('sha256').update(input).digest('hex')});
  assert.deepEqual(cards.filter(c=>c.kind==='checkpoint').map(c=>c.report.stage),['scope','discovery','selection','draft','feedback','delivery','learning']);
  const delivered=controller.exportAudit().events.filter(e=>e.event==='source_delivered'&&e.path==='references/method.md');
  assert(delivered.length>=2,'Long method was not actually delivered in multiple ranges');
  if(adversarial) {
    const firstWrite=rawEvents.find(e=>e.type==='tool/call'&&e.data.name==='workflow_write');
    assert(firstWrite,'Real model never attempted the requested negative probe');
    const response=rawEvents.find(e=>e.type==='tool/result'&&e.data.message.toolCallId===firstWrite.data.callId);
    assert(response,'No authoritative result for attempted early write');
    const payload=JSON.parse(response.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''));
    assert.equal(payload.ok,false);assert.equal(payload.state.stage,'discovery');
  }
});
