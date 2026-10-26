import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync,linkSync,symlinkSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import {projectDesktopSettings} from './desktop-settings.mjs';
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'workflow-desktop-settings-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const stateRoot=path.join(root,'state'),workspace=path.join(root,'work');mkdirSync(workspace);return{root,stateRoot,workspace,config:path.join(stateRoot,'desktop-home/config.toml')};}
const content=workspace=>`[desktop]\nprojectlessWorkspaceRoot = ${JSON.stringify(workspace.replaceAll('\\','/'))}\n`;
test('cold owner writes exactly one frontend setting and authenticated repeated projection is unchanged',t=>{
 const f=fixture(t),first=projectDesktopSettings(f);assert.equal(first.status,'created');assert.equal(readFileSync(f.config,'utf8'),content(f.workspace));
 const receipt=readFileSync(first.receiptPath),key=readFileSync(first.keyPath);assert.equal(key.length,32);assert.equal(projectDesktopSettings(f).status,'unchanged');assert.deepEqual(readFileSync(first.receiptPath),receipt);assert.deepEqual(readFileSync(first.keyPath),key);
});
test('unknown existing config, even matching minimal bytes without authority, is never adopted or overwritten',t=>{
 for(const text of ['[model]\nprovider="unknown"\n',content(fixture(t).workspace)]){const f=fixture(t);mkdirSync(path.dirname(f.config),{recursive:true});writeFileSync(f.config,text);assert.throws(()=>projectDesktopSettings(f),/unknown|authority|receipt/i);assert.equal(readFileSync(f.config,'utf8'),text);assert.equal(existsSync(path.join(f.stateRoot,'desktop-settings-owner')),false);}
});
test('verified owner can change the root, retaining exact old bytes and authenticating the new bytes',t=>{
 const f=fixture(t),first=projectDesktopSettings(f),old=readFileSync(f.config),next=path.join(f.root,'next');mkdirSync(next);const changed=projectDesktopSettings({...f,workspace:next});assert.equal(changed.status,'updated');assert.deepEqual(readFileSync(changed.backupPath),old);assert.equal(readFileSync(f.config,'utf8'),content(next));assert.equal(projectDesktopSettings({...f,workspace:next}).status,'unchanged');assert.equal(readdirSync(path.dirname(first.receiptPath)).some(x=>x.endsWith('.tmp')),false);
});
test('config/receipt/key tampering or interrupted update refuses rather than replacing unknown bytes',t=>{
 for(const target of ['config','receiptPath','keyPath']){const f=fixture(t),r=projectDesktopSettings(f),file=target==='config'?f.config:r[target];writeFileSync(file,'tampered');assert.throws(()=>projectDesktopSettings(f),/integrity|authority|receipt|key/i);assert.equal(readFileSync(file,'utf8'),'tampered');}
 const f=fixture(t),r=projectDesktopSettings(f);rmSync(f.config);assert.throws(()=>projectDesktopSettings(f),/missing|interrupted|receipt/i);assert.equal(existsSync(f.config),false);assert.equal(existsSync(r.receiptPath),true);
});
test('hardlinked or redirected settings paths refuse without changing the link target',t=>{
 const f=fixture(t);mkdirSync(path.dirname(f.config),{recursive:true});const target=path.join(f.root,'target');writeFileSync(target,'original');linkSync(target,f.config);assert.throws(()=>projectDesktopSettings(f),/regular|link|redirect/i);assert.equal(readFileSync(target,'utf8'),'original');
 const g=fixture(t),outside=path.join(g.root,'outside');mkdirSync(g.stateRoot);mkdirSync(outside);symlinkSync(outside,path.join(g.stateRoot,'desktop-home'),process.platform==='win32'?'junction':'dir');assert.throws(()=>projectDesktopSettings(g),/link|redirect/i);assert.deepEqual(readdirSync(outside),[]);
});
test('failed replacement keeps exact old config, receipt and backup; no permissive retry follows',t=>{
 const f=fixture(t),r=projectDesktopSettings(f),before=readFileSync(f.config),receipt=readFileSync(r.receiptPath),next=path.join(f.root,'next');mkdirSync(next);
 assert.throws(()=>projectDesktopSettings({...f,workspace:next,replaceFile:()=>{throw Error('simulated replacement failure');}}),/simulated/);assert.deepEqual(readFileSync(f.config),before);assert.deepEqual(readFileSync(r.receiptPath),receipt);assert.equal(projectDesktopSettings(f).status,'unchanged');
});
