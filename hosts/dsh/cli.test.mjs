import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('actual CLI emits real scope cards and preserves audit on startup refusal without calling a model',async()=>{
  const root=mkdtempSync(resolve(process.env.DSH_TEST_ROOT??tmpdir(),'dsh-cli-refusal-'));
  const workspace=resolve(root,'workspace');mkdirSync(workspace);
  const message=resolve(root,'human-request.txt'),audit=resolve(root,'audit.json');
  writeFileSync(message,'Perform the authorized task using the required workflow.');
  const result=await new Promise((fulfill,reject)=>{
    const env={};for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','PATH'])if(process.env[key]!==undefined)env[key]=process.env[key];
    const child=spawn(process.execPath,[fileURLToPath(new URL('./launcher.mjs',import.meta.url)),'--workspace',workspace,'--home',resolve(root,'uninstalled-home'),'--user-message-file',message,'--state-root',resolve(root,'private-state'),'--audit-file',audit],{env,windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>fulfill({code,stdout,stderr}));
  });
  assert.equal(result.code,1);
  const lines=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert(lines.some(line=>line.type==='workflow_card'&&line.card.report?.stage==='scope'));
  assert.equal(lines.at(-1).status,'blocked');
  assert(existsSync(audit),'Failure discarded the host audit');
  assert.equal(JSON.parse(readFileSync(audit,'utf8')).audit.stage,'discovery');
});
