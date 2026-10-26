import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLaunchArguments,prepareGuardedLaunch,ownerConfigurationPath,runOwnerCli} from './launcher.mjs';
import {join,dirname,resolve,relative} from 'node:path';
import {userInfo,tmpdir} from 'node:os';
import {mkdtempSync,writeFileSync,existsSync,mkdirSync,readFileSync,copyFileSync,realpathSync,rmSync,linkSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createDependencySealAuthority,measureDependencyTree} from '../security/dependency-seal.mjs';
import {createConversationFactory} from '../conversation/controller-factory.mjs';

async function resumeOwner(t){
 const root=mkdtempSync(join(tmpdir(),'dsh-public-resume-')),owner=join(root,'owner'),workspace=join(root,'workspace'),payload=join(root,'payload'),tools=join(root,'tools');for(const p of [owner,workspace,payload,tools])mkdirSync(p);t.after(()=>{const actual=realpathSync.native(root);assert.equal(dirname(actual),realpathSync.native(tmpdir()));rmSync(actual,{recursive:true,force:true});});const digest=b=>createHash('sha256').update(b).digest('hex'),members=['hosts/security/installation-verifier.mjs','hosts/security/dependency-seal.mjs','hosts/conversation/resume-authorization.mjs'];for(const name of members){const dest=join(payload,name);mkdirSync(dirname(dest),{recursive:true});copyFileSync(resolve(import.meta.dirname,'../..',name),dest);}const manifest=join(owner,'manifest.json');writeFileSync(manifest,JSON.stringify({format:1,files:members.map(path=>({path,bytes:readFileSync(join(payload,path)).length,sha256:digest(readFileSync(join(payload,path)))}))}));
 const key=randomBytes(32),keyPath=join(owner,'dependency.key'),seals=join(owner,'seals');writeFileSync(keyPath,key);const pkg=join(owner,'package.json'),lock=join(owner,'package-lock.json'),installer=join(tools,'fixture-installer.mjs');writeFileSync(pkg,'{"name":"resume-preflight-fixture","private":true}');writeFileSync(lock,'{"lockfileVersion":3,"packages":{}}');writeFileSync(installer,"import fs from 'node:fs';fs.mkdirSync('node_modules/fixture',{recursive:true});fs.writeFileSync('node_modules/fixture/index.js','export const fixture=1;');");const authority=createDependencySealAuthority({sealRoot:seals,key,payloadRoots:[payload],actorWritableRoots:[]}),installRoot=join(root,'sealed-fixture-deps'),installed=await authority.installAndSeal({installRoot,sourcePackage:{path:pkg,sha256:digest(readFileSync(pkg))},sourceLock:{path:lock,sha256:digest(readFileSync(lock))},installer:{nodePath:process.execPath,nodeSha256:digest(readFileSync(process.execPath)),npmCliPath:installer,npmCliSha256:digest(readFileSync(installer)),toolRoot:tools,expectedTreeSha256:measureDependencyTree({root:tools}).treeSha256}});
 installed.installRoot=installRoot;const controllerFile=join(owner,'controller-config.dsh.json'),conversationRoot=join(owner,'state','conversation'),controller={stateRoot:conversationRoot,installedRoots:[],external:false,privateRoots:[owner,process.env.DSH_RUNTIME_ROOT??join(root,'no-runtime')]};writeFileSync(controllerFile,JSON.stringify(controller));const verifier=join(payload,'hosts/security/installation-verifier.mjs'),configPath=join(owner,'owner-config.dsh.json');writeFileSync(configPath,JSON.stringify({integrityVerifierModule:verifier,integrityVerifierSha256:digest(readFileSync(verifier)),integrity:{payloadRoot:payload,manifestPath:manifest,manifestSha256:digest(readFileSync(manifest)),dependencyKeyFile:keyPath,dependencySealRoot:seals,dependencies:[{installRoot:installed.installRoot,sealPath:installed.sealPath}],actorWritableRoots:[],trustedLinkRoots:[]},runtimeRoot:installed.installRoot,controllerConfigFile:controllerFile}));
 // This test-only executable chooses an isolated owner config. It invokes the
 // unmodified public CLI command branch; it never writes an authorization itself.
 const driver=join(root,'cli-driver.mjs');writeFileSync(driver,`import {runOwnerCli} from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'launcher.mjs')).href)};try{const r=await runOwnerCli({ownerConfigPath:process.argv[2],argv:process.argv.slice(3)});process.exitCode=r.exitCode;}catch(e){process.stderr.write('CLI refused: '+e.message+'\\n');process.exitCode=1;}`);const env={};for(const name of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','PATH'])if(process.env[name])env[name]=process.env[name];const cli=(sessionId,cwd=workspace,extra=[])=>spawnSync(process.execPath,[driver,configPath,'authorize-resume',sessionId,...extra],{cwd,env,encoding:'utf8',windowsHide:true,timeout:15000});return{root,owner,workspace,payload,controller,controllerFile,conversationRoot,configPath,cli,env,installed};
}
test('public authorize-resume performs real source and sealed-dependency preflight and emits only bounded status',async t=>{const f=await resumeOwner(t),sessionId='public-paused',c=await createConversationFactory(f.controller)({workspace:f.workspace,sessionId,userMessage:'ORIGINAL_PRIVATE_TASK_MUST_NOT_BE_PRINTED'});c.abort('Native Agent disposed');const r=f.cli(sessionId);assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.deepEqual(Object.keys(report).sort(),['expiresAt','sessionId','status']);assert.equal(report.sessionId,sessionId);assert.equal(report.status,'authorized');assert.equal((r.stdout+r.stderr).includes('ORIGINAL_PRIVATE_TASK'),false);assert.equal(f.cli(sessionId,f.root).status,1);assert.equal(f.cli(sessionId,f.workspace,['--state-root','other']).status,1);const other=await resumeOwner(t),task=await createConversationFactory(other.controller)({workspace:other.workspace,sessionId,userMessage:'private second task'});task.abort('disposed');writeFileSync(join(other.payload,'hosts/conversation/resume-authorization.mjs'),'throw Error("TAMPER_BODY_EXECUTED")');const bad=other.cli(sessionId);assert.equal(bad.status,1);assert.equal((bad.stdout+bad.stderr).includes('TAMPER_BODY_EXECUTED'),false);assert.equal(existsSync(join(other.conversationRoot,'resume-grants')),false);const changed=await resumeOwner(t),pending=await createConversationFactory(changed.controller)({workspace:changed.workspace,sessionId,userMessage:'private third task'});pending.abort('disposed');writeFileSync(join(changed.installed.installRoot,'node_modules/fixture/index.js'),'tampered dependency');assert.equal(changed.cli(sessionId).status,1);assert.equal(existsSync(join(changed.conversationRoot,'resume-grants')),false);});
test('public authorization rejects a hardlinked authority helper before minting any grant',async t=>{
 const f=await resumeOwner(t),sessionId='linked-helper',c=await createConversationFactory(f.controller)({workspace:f.workspace,sessionId,userMessage:'Inspect the current input.'});c.abort('Native Agent disposed');linkSync(join(f.payload,'hosts/conversation/resume-authorization.mjs'),join(f.root,'outside-helper.mjs'));const result=f.cli(sessionId);assert.equal(result.status,1,'a linked authority helper was imported and minted a grant');assert.equal(existsSync(join(f.conversationRoot,'resume-grants')),false);
});
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
test('authorize-resume is a fixed two-argument command with no owner, state, profile or app overrides',()=>{assert.deepEqual(parseLaunchArguments(['authorize-resume','native-session-1']),{command:'authorize-resume',sessionId:'native-session-1',profile:'headless',appArgs:[]});for(const args of [['authorize-resume'],['authorize-resume','../outside'],['authorize-resume','native-session-1','--state-root','other'],['authorize-resume','native-session-1','--config','other'],['authorize-resume','native-session-1','new text']])assert.throws(()=>parseLaunchArguments(args));});

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
