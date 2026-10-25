// Companion CI checks live outside the immutable runtime distribution. These
// assert refusal of an unverified capability, not Linux native IO support.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {createNativeWorkspaceIO} from '../../hosts/providers/native-workspace-io.mjs';
import {createConversationFactory} from '../../hosts/conversation/controller-factory.mjs';

function fixture(t){
  const parent=realpathSync.native(tmpdir()),root=mkdtempSync(join(parent,'aw-ci-capability-')),workspace=join(root,'workspace');mkdirSync(workspace);
  const bytes=Buffer.from('\ufeffactual protected input\r\n');writeFileSync(join(workspace,'input.txt'),bytes);
  t.after(()=>{assert.equal(dirname(realpathSync.native(root)),parent);assert(basename(root).startsWith('aw-ci-capability-'));rmSync(root,{recursive:true,force:true});});
  let executions=0;const nativeExecutor={catalog:[{name:'bash'},{name:'read'},{name:'write'}],async execute(){executions++;throw Error('Unsupported capability must fail before native execution');}};
  return{root,workspace,bytes,nativeExecutor,get executions(){return executions;}};
}

test('native workspace IO refuses a catalog without verified pwsh before reading or invoking a fallback',t=>{
  const f=fixture(t);
  assert.throws(()=>createNativeWorkspaceIO({workspace:f.workspace,nativeExecutor:f.nativeExecutor}),/Verified Windows pwsh\/readback capability required/);
  assert.equal(f.executions,0);assert(readFileSync(join(f.workspace,'input.txt')).equals(f.bytes));assert.deepEqual(readdirSync(f.workspace),['input.txt']);
});

test('production conversation creation fails closed on the same missing capability without a ready task or artifact',async t=>{
  const f=fixture(t),stateRoot=join(f.root,'state'),factory=createConversationFactory({stateRoot,installedRoots:[],external:false});
  await assert.rejects(factory({workspace:f.workspace,sessionId:'ci-unsupported-native',kind:'auto',userMessage:'Inspect input.txt and propose a repair; preserve the input.',nativeExecutor:f.nativeExecutor}),/Verified Windows pwsh\/readback capability required/);
  assert.equal(f.executions,0);assert.deepEqual(readdirSync(join(stateRoot,'sessions')),[]);assert.deepEqual(readdirSync(f.workspace),['input.txt']);assert(readFileSync(join(f.workspace,'input.txt')).equals(f.bytes));
});
