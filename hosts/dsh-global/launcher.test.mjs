import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLaunchArguments,prepareGuardedLaunch,ownerConfigurationPath,runOwnerCli} from './launcher.mjs';
import {join} from 'node:path';
import {userInfo,tmpdir} from 'node:os';
import {mkdtempSync,writeFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('the launcher accepts only its fixed owner config, a profile and native app arguments',()=>{
  assert.deepEqual(parseLaunchArguments(['--profile','web','--','--port','0']),{profile:'web',appArgs:['--port','0']});
  assert.deepEqual(parseLaunchArguments(['web','--port','0']),{profile:'web',appArgs:['--port','0']});
  assert.deepEqual(parseLaunchArguments(['--profile','headless','An ordinary task']),{profile:'headless',appArgs:['An ordinary task']});
  assert.equal(ownerConfigurationPath(),join(userInfo().homedir,'.agent-workflow','global','owner-config.dsh.json'));
  for(const args of [
    ['--config','one','--config','two'],['--config','one','--patch','actor.yml'],['--config','one','--home','actor'],
    ['--config','one','--','--patch','actor.yml'],['--config','one','--','--from-default-profile','headless'],
    ['--config','one','--','--open'],['--config','one','--profile','../outside']
  ])assert.throws(()=>parseLaunchArguments(args));
});

test('an absent or failed installation verifier prevents any runtime preparation',async()=>{
  await assert.rejects(prepareGuardedLaunch({config:{},profile:'headless'}),/verif/i);
  let checked=0;await assert.rejects(prepareGuardedLaunch({config:{},profile:'headless',verifyInstallation:async()=>{checked++;throw Error('Dependency seal rejected');}}),/Dependency seal rejected/);assert.equal(checked,1);
});

test('owner configuration pins verifier bytes before importing its module body',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-owner-pin-')),modulePath=join(root,'untrusted-verifier.mjs'),effect=join(root,'must-not-exist'),configPath=join(root,'owner.json');
  writeFileSync(modulePath,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(effect)},'imported');export const verifyInstallation=()=>({ok:true});`);
  writeFileSync(configPath,JSON.stringify({integrityVerifierModule:modulePath,integrityVerifierSha256:'0'.repeat(64)}));
  await assert.rejects(runOwnerCli({ownerConfigPath:configPath,argv:['headless','A real task']}),/SHA256 mismatch/);assert.equal(existsSync(effect),false);
});

test('tampering a verifier static dependency is refused before its marker, runtime import or state creation',async()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-bootstrap-closure-')),payload=join(root,'payload'),runtime=join(root,'runtime'),state=join(root,'state'),marker=join(root,'dependency-marker'),runtimeMarker=join(root,'runtime-marker');mkdirSync(payload);mkdirSync(runtime);
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),entry=join(payload,'installation-verifier.mjs'),dependency=join(payload,'dependency-seal.mjs'),manifest=join(root,'manifest.json'),configPath=join(root,'owner.json'),factory=join(root,'factory.mjs'),controller=join(root,'controller.json');
  writeFileSync(dependency,'export const trusted=true;');writeFileSync(entry,"import './dependency-seal.mjs';export const verifyInstallation=async()=>({ok:true});");
  writeFileSync(manifest,JSON.stringify({format:1,files:[entry,dependency].map(path=>({path:path.split(/[\\/]/).at(-1),bytes:readFileSync(path).length,sha256:digest(readFileSync(path))}))}));
  writeFileSync(dependency,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');`);
  writeFileSync(factory,'export const controllerFactory=()=>{};');writeFileSync(controller,'{}');writeFileSync(join(runtime,'package.json'),'{}');
  for(const name of ['dsh','dsh-app-boot'])mkdirSync(join(runtime,'node_modules','@deepseek-ai',name),{recursive:true});
  writeFileSync(join(runtime,'node_modules','@deepseek-ai','dsh','package.json'),'{"name":"@deepseek-ai/dsh","version":"0.2.1-rc.2","main":"index.js"}');
  writeFileSync(join(runtime,'node_modules','@deepseek-ai','dsh-app-boot','package.json'),'{"name":"@deepseek-ai/dsh-app-boot","main":"index.mjs"}');writeFileSync(join(runtime,'node_modules','@deepseek-ai','dsh-app-boot','index.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(runtimeMarker)},'imported');`);
  writeFileSync(configPath,JSON.stringify({runtimeRoot:runtime,nodeExecutable:process.execPath,home:join(root,'home'),stateRoot:state,factoryModule:factory,controllerConfigFile:controller,integrityVerifierModule:entry,integrityVerifierSha256:digest(readFileSync(entry)),integrity:{payloadRoot:payload,manifestPath:manifest,manifestSha256:digest(readFileSync(manifest))}}));
  try{await runOwnerCli({ownerConfigPath:configPath,argv:['headless','An actual task']});}catch{}
  assert.equal(existsSync(marker),false,'Tampered bootstrap dependency executed');assert.equal(existsSync(runtimeMarker),false,'DSH runtime imported before complete bootstrap verification');assert.equal(existsSync(state),false,'Runtime state was created before bootstrap verification');
});

test('loading the owner launcher cannot execute unverified policy or runtime sibling modules',()=>{
  const root=mkdtempSync(join(tmpdir(),'dsh-launcher-import-')),launcher=join(root,'launcher.mjs'),policyMarker=join(root,'policy-marker'),runtimeMarker=join(root,'runtime-marker');
  writeFileSync(launcher,readFileSync(new URL('./launcher.mjs',import.meta.url)));
  writeFileSync(join(root,'policy.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(policyMarker)},'executed');export const requiredSessionPolicy=()=>[];`);
  writeFileSync(join(root,'runtime.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(runtimeMarker)},'executed');export const resolveDshRuntime=()=>({});`);
  const bootstrap=join(root,'load-only.mjs');writeFileSync(bootstrap,`await import(${JSON.stringify(pathToFileURL(launcher).href)});`);
  const result=spawnSync(process.execPath,[bootstrap],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(existsSync(policyMarker),false,'Policy sibling executed before verification');assert.equal(existsSync(runtimeMarker),false,'Runtime sibling executed before verification');
});
