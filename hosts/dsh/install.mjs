#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve,dirname,delimiter } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { runtimeBin } from './runtime.mjs';

export async function installDshProfile({home,profile='proactive-workflow',runtimeRoot,packagePath=import.meta.dirname}) {
  if(!home || !/^[a-zA-Z0-9_-]+$/.test(profile)) throw new Error('Explicit DSH home and a safe custom profile name are required');
  home=resolve(home);packagePath=resolve(packagePath);
  if(['headless','web','sdk','sdk-minimal','acp'].includes(profile)) throw new Error('Install into a dedicated custom profile');
  mkdirSync(home,{recursive:true});
  const env={};
  for(const key of ['SystemRoot','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','PATH','PROCESSOR_ARCHITECTURE']) if(process.env[key]!==undefined) env[key]=process.env[key];
  env.PATH=[resolve(runtimeRoot??import.meta.dirname,'node_modules','.bin'),dirname(process.execPath),env.PATH??''].join(delimiter);
  env.DSH_HOME=home;env.HOME=env.USERPROFILE=resolve(home,'isolated-home');env.DSH_TELEMETRY_DISABLED='1';env.npm_config_ignore_scripts='true';
  mkdirSync(env.HOME,{recursive:true});
  const run=args=>new Promise((fulfill,reject)=>{
    const child=spawn(process.execPath,[runtimeBin(runtimeRoot),...args],{cwd:packagePath,env,windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    child.on('error',reject);child.on('close',code=>code===0?fulfill({args,code,stdout,stderr}):reject(new Error(`DSH profile installation failed (exit ${code}): ${stderr.slice(-3000)}`)));
  });
  const manifest=resolve(home,'profiles',profile,'package.json');
  if(!existsSync(manifest)) await run(['--profile',profile,'--from-default-profile','headless','--dump-config']);
  const installed=await run(['plugin','--profile',profile,'add',packagePath]);
  const data=JSON.parse(readFileSync(manifest,'utf8'));
  if(!data.dsh?.profile?.bundles?.includes('dsh-proactive-workflow')) throw new Error('Official installer did not activate the workflow bundle');
  return {home,profile,manifest,bundles:data.dsh.profile.bundles,installation:installed};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href) {
  const {values}=parseArgs({options:{home:{type:'string'},profile:{type:'string'},'runtime-root':{type:'string'}}});
  installDshProfile({home:values.home,profile:values.profile,runtimeRoot:values['runtime-root']})
    .then(result=>console.log(JSON.stringify({home:result.home,profile:result.profile,bundles:result.bundles})))
    .catch(error=>{console.error(error.message);process.exitCode=1;});
}
