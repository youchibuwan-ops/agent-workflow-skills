import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {createSandboxProvider} from './sandbox-provider.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'workflow-sandbox-test-'));
 t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(basename(root).startsWith('workflow-sandbox-test-'));rmSync(root,{recursive:true,force:true});});
 const workspace=join(root,'project'),methodRoot=join(root,'method'),stateRoot=join(root,'private');
 for(const p of [workspace,methodRoot,stateRoot])mkdirSync(p);
 writeFileSync(join(workspace,'input.txt'),'actual input\n');writeFileSync(join(stateRoot,'private-key.txt'),'HOST_SECRET_MUST_STAY_PRIVATE');
 return {root,workspace,methodRoot,stateRoot};
}

test('production method execution refuses a missing native permission delegate before running',async t=>{
 const f=fixture(t),provider=createSandboxProvider({stateRoot:f.stateRoot});
 await assert.rejects(provider.execute({...f,script:'run.py',inputPaths:['input.txt'],outputPaths:['out.txt']}),/native.*permission|permission.*delegate/i);
});

test('future private roots are protected without requiring unrelated homes to exist at startup',async t=>{
 const f=fixture(t);let called=0;
 const secretRoot=join(f.root,'not-created-home/profiles');
 const provider=createSandboxProvider({stateRoot:f.stateRoot,privateRoots:[secretRoot],invoke:async()=>{called++;throw Error('unused');},readInput:async()=>{called++;throw Error('must not read private bytes');}});
 assert.equal(provider.executionPolicy,'native-permission');assert.equal(called,0);
 mkdirSync(secretRoot,{recursive:true});writeFileSync(join(secretRoot,'note.txt'),'PRIVATE_AFTER_START');writeFileSync(join(f.methodRoot,'run.py'),'pass\n');
 await assert.rejects(provider.execute({...f,workspace:f.root,script:'run.py',inputPaths:['not-created-home/profiles/note.txt']}),/protected|linked alias/i);assert.equal(called,0);
});

test('paths are scoped before any sandbox process is started',async t=>{
 const f=fixture(t),provider=createSandboxProvider({stateRoot:f.stateRoot,executionPolicy:'test-only-direct'});
 await assert.rejects(provider.execute({...f,script:'../private-key.txt',inputPaths:[],outputPaths:['out.txt']}),/relative|traversal/i);
 await assert.rejects(provider.execute({...f,script:'run.py',inputPaths:['.env'],outputPaths:['out.txt']}),/credential|protected/i);
 await assert.rejects(provider.execute({...f,script:'run.py',inputPaths:['.CoDeX/config.toml'],outputPaths:['out.txt']}),/credential|protected/i);
});

test('production staging cannot bypass the native input read permission',async t=>{
 const f=fixture(t);writeFileSync(join(f.methodRoot,'run.py'),'pass\n');let calls=0;
 const provider=createSandboxProvider({stateRoot:f.stateRoot,invoke:async()=>{calls++;throw Error('must not execute');}});
 await assert.rejects(provider.execute({...f,script:'run.py',inputPaths:['input.txt']}),/input.*permission|read.*delegate/i);
 assert.equal(calls,0);
 const denied=createSandboxProvider({stateRoot:f.stateRoot,invoke:async()=>{calls++;throw Error('must not execute');},readInput:async()=>{throw Error('native read denied');}});
 await assert.rejects(denied.execute({...f,script:'run.py',inputPaths:['input.txt']}),/native read denied/);
 assert.equal(calls,0);
});

test('real OS sandbox runs an inspected method with read-only inputs and staged output bytes',{
 skip:process.env.WORKFLOW_REAL_SANDBOX_TEST!=='1'
},async t=>{
 const f=fixture(t),provider=createSandboxProvider({stateRoot:f.stateRoot,executionPolicy:'test-only-direct'});
 const probe=await provider.probe();assert.equal(probe.available,true,probe.reason);
 writeFileSync(join(f.methodRoot,'run.py'),"from pathlib import Path\nimport os\nassert not os.environ.get('DEEPSEEK_API_KEY')\ntext=Path('input.txt').read_text()\nPath('out.txt').write_text(text.upper())\nprint('METHOD_ACTUALLY_EXECUTED')\n");
 const result=await provider.execute({...f,script:'run.py',inputPaths:['input.txt'],outputPaths:['out.txt']});
 assert.equal(result.ok,true,result.stderr);assert.equal(result.outputs['out.txt'].toString(),'ACTUAL INPUT\n');
 assert.match(result.stdout,/METHOD_ACTUALLY_EXECUTED/);assert.equal(readFileSync(join(f.workspace,'input.txt'),'utf8'),'actual input\n');
 assert.equal(readFileSync(join(f.stateRoot,'private-key.txt'),'utf8'),'HOST_SECRET_MUST_STAY_PRIVATE');
});

test('sandbox cannot overwrite protected inputs, access host state or connect to host network',{
 skip:process.env.WORKFLOW_REAL_SANDBOX_TEST!=='1'
},async t=>{
 const f=fixture(t),provider=createSandboxProvider({stateRoot:f.stateRoot,executionPolicy:'test-only-direct'});
 writeFileSync(join(f.methodRoot,'attack.py'),"from pathlib import Path\nimport os,socket\nassert not Path('/mnt/c/Users').exists()\nassert not os.environ.get('DEEPSEEK_API_KEY')\ns=socket.socket();s.settimeout(.2)\nassert s.connect_ex(('1.1.1.1',443)) != 0\nPath('input.txt').write_text('CORRUPTED')\n");
 const result=await provider.execute({...f,script:'attack.py',inputPaths:['input.txt'],outputPaths:['out.txt']});
 assert.equal(result.ok,false);assert.equal(readFileSync(join(f.workspace,'input.txt'),'utf8'),'actual input\n');
 assert.equal(readFileSync(join(f.stateRoot,'private-key.txt'),'utf8'),'HOST_SECRET_MUST_STAY_PRIVATE');
 assert.equal(Object.keys(result.outputs).length,0);
});

test('real sandbox denies process creation and returns large output through a checked private manifest',{
 skip:process.env.WORKFLOW_REAL_SANDBOX_TEST!=='1'
},async t=>{
 const f=fixture(t),provider=createSandboxProvider({stateRoot:f.stateRoot,executionPolicy:'test-only-direct'});
 writeFileSync(join(f.methodRoot,'run.py'),"from pathlib import Path\nimport os,errno\ntry:\n os.fork()\n raise AssertionError('fork unexpectedly succeeded')\nexcept OSError as e:\n assert e.errno == errno.EPERM\nPath('out.txt').write_bytes(b'x'*131072)\nprint('FORK_DENIED')\n");
 const result=await provider.execute({...f,script:'run.py',outputPaths:['out.txt']});
 assert.equal(result.ok,true,result.stderr);assert.equal(result.outputs['out.txt'].length,131072);
 assert.match(result.stdout,/FORK_DENIED/);assert.equal(result.committed,false);
});
