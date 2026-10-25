// Host-only execution provider. It returns staged bytes, never commits them to a project.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,lstatSync,realpathSync,existsSync,rmSync} from 'node:fs';
import {resolve,relative,isAbsolute,join,dirname,basename} from 'node:path';
import {protectedProjectSegment,projectPathKey} from '../security/project-path.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(root,p)=>{const r=relative(root,p);return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
function privatePath(path){const absolute=resolve(path);let parent=absolute;while(!existsSync(parent)){const next=dirname(parent);if(next===parent)throw Error('Private path has no existing filesystem anchor');parent=next;}return resolve(realpathSync.native(parent),relative(parent,absolute));}
function member(p){
 if(typeof p!=='string'||!p||isAbsolute(p)||/[:\0\\]/.test(p)||p.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Expected a scoped relative path; traversal rejected');
 if(p.split('/').some(protectedProjectSegment))throw Error('Credential or protected path rejected');
 return p;
}
const helper=String.raw`
import os,sys,json,hashlib,tempfile,subprocess,resource,ctypes,errno
def seccomp_fd():
 lib=ctypes.CDLL('libseccomp.so.2')
 lib.seccomp_init.argtypes=[ctypes.c_uint32];lib.seccomp_init.restype=ctypes.c_void_p
 lib.seccomp_syscall_resolve_name.argtypes=[ctypes.c_char_p];lib.seccomp_syscall_resolve_name.restype=ctypes.c_int
 lib.seccomp_rule_add.argtypes=[ctypes.c_void_p,ctypes.c_uint32,ctypes.c_int,ctypes.c_uint];lib.seccomp_rule_add.restype=ctypes.c_int
 lib.seccomp_export_bpf.argtypes=[ctypes.c_void_p,ctypes.c_int];lib.seccomp_export_bpf.restype=ctypes.c_int
 lib.seccomp_release.argtypes=[ctypes.c_void_p]
 ctx=lib.seccomp_init(0x7fff0000)
 if not ctx:raise RuntimeError('seccomp context unavailable')
 try:
  for name in ['fork','vfork','clone','clone3','unshare','setns']:
   number=lib.seccomp_syscall_resolve_name(name.encode())
   if number>=0 and lib.seccomp_rule_add(ctx,0x00050000|errno.EPERM,number,0)!=0:raise RuntimeError('seccomp rule unavailable')
  fd=os.memfd_create('workflow-process-policy',0)
  if lib.seccomp_export_bpf(ctx,fd)!=0:raise RuntimeError('seccomp export failed')
  os.lseek(fd,0,os.SEEK_SET);return fd
 finally:lib.seccomp_release(ctx)
def run(d):
 fd=seccomp_fd()
 try:
  cmd=['/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL']
  for p in ['/usr','/bin','/lib','/lib64']:
   if os.path.exists(p):cmd+=['--ro-bind',p,p]
  cmd+=['--proc','/proc','--dev','/dev','--size','67108864','--tmpfs','/tmp',
        '--ro-bind',d['inputs'],'/workspace','--ro-bind',d['method'],'/method']
  for p in d['outputPaths']:cmd+=['--bind',os.path.join(d['outputs'],p),'/workspace/'+p]
  cmd+=['--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/nonexistent',
        '--chdir','/workspace','--seccomp',str(fd),'/usr/bin/python3','-E','-s','-B','/method/'+d['script']]
  def limits():
   resource.setrlimit(resource.RLIMIT_CPU,(8,8));resource.setrlimit(resource.RLIMIT_AS,(268435456,268435456));resource.setrlimit(resource.RLIMIT_FSIZE,(4194304,4194304))
  with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
   try:
    proc=subprocess.run(cmd,stdin=subprocess.DEVNULL,stdout=out,stderr=err,pass_fds=(fd,),timeout=d['timeoutMs']/1000,preexec_fn=limits)
    code=proc.returncode;timed=False
   except subprocess.TimeoutExpired:code=-1;timed=True
   out.seek(0);err.seek(0);stdout=out.read(65537);stderr=err.read(65537)
  too_long=len(stdout)>4096 or len(stderr)>4096
  outputs={};total=0
  if code==0 and not timed and not too_long:
   for p in d['outputPaths']:
    file=os.path.join(d['outputs'],p)
    if os.path.islink(file) or not os.path.isfile(file):raise RuntimeError('Output is not a regular staged file')
    total+=os.stat(file).st_size
    if total>2097152:raise RuntimeError('Staged output exceeds 2 MiB aggregate limit')
    with open(file,'rb') as f:data=f.read()
    outputs[p]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
  return {'ok':code==0 and not timed and not too_long,'exitCode':code,'timedOut':timed,'outputTruncated':too_long,
          'stdout':stdout[:4096].decode('utf8','replace'),'stderr':stderr[:4096].decode('utf8','replace'),'outputs':outputs,
          'isolation':{'readonlyInputs':True,'networkNamespace':True,'processCreation':'seccomp-denied','environment':'cleared'}}
 finally:os.close(fd)
try:print(json.dumps(run(json.load(sys.stdin))))
except Exception as e:print(json.dumps({'ok':False,'exitCode':-1,'stdout':'','stderr':str(e),'outputs':{},'providerError':True}))
`;

export function createSandboxProvider({stateRoot,privateRoots=[],executionPolicy='native-permission',invoke,readInput,timeoutMs=5000}={}){
 if(!stateRoot)throw Error('A host-owned sandbox state root is required');
 mkdirSync(stateRoot,{recursive:true});const root=realpathSync.native(stateRoot);
 if(!['native-permission','test-only-direct'].includes(executionPolicy))throw Error('Unknown sandbox execution policy');
 const secrets=[root,...privateRoots.map(privatePath)];
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA)$/i.test(k)));
 const direct=request=>spawnSync(request.command,request.args,{input:request.input,encoding:'utf8',env,windowsHide:true,timeout:20000,maxBuffer:4*1024*1024});
 async function invokeChecked(request){
  if(executionPolicy==='native-permission'&&typeof invoke!=='function')throw Error('Native permission delegate required; refusing a direct execution fallback');
  const result=await (invoke??direct)(request);
  if(result.error||result.status!==0)throw Error('Sandbox process unavailable: '+(result.error?.message??String(result.stderr).slice(0,1000)));
  return result.stdout;
 }
 async function linuxPath(path){
  if(process.platform==='linux')return path;
  if(process.platform!=='win32')throw Error('This execution provider supports Linux or Windows with WSL only');
  const text=await invokeChecked({command:'wsl.exe',args:['--exec','/usr/bin/wslpath','-a',path],input:'',purpose:'sandbox-path-resolution'});
  const value=String(text).trim();if(!value.startsWith('/')||value.includes('\n'))throw Error('Invalid WSL path resolution');return value;
 }
 async function execute({workspace,methodRoot,script,inputPaths=[],outputPaths=[],timeoutMs:taskTimeout=timeoutMs}={}){
  // Production requires the host adapter's existing approval/sandbox pipeline.
  if(executionPolicy==='native-permission'&&typeof invoke!=='function')throw Error('Native permission delegate required before any method execution');
  if(executionPolicy==='native-permission'&&inputPaths.length&&typeof readInput!=='function')throw Error('Native input read permission delegate required before staging');
  script=member(script);inputPaths=inputPaths.map(member);outputPaths=outputPaths.map(member);
  if(!script.endsWith('.py'))throw Error('Only inspected Python methods are supported by this provider');
  if(inputPaths.length>64||outputPaths.length>16||new Set(outputPaths.map(projectPathKey)).size!==outputPaths.length)throw Error('Sandbox manifest exceeds reviewed limits');
  if(!Number.isInteger(taskTimeout)||taskTimeout<100||taskTimeout>10000)throw Error('Sandbox timeout must be between 100 and 10000 ms');
  const project=realpathSync(workspace),physicalProject=realpathSync.native(workspace),method=realpathSync.native(methodRoot);
  const selected=resolve(method,script);if(!inside(method,realpathSync(selected))||lstatSync(selected).isSymbolicLink())throw Error('Method path escaped inspected bundle');
  let total=0;const inputs=[];
  for(const p of inputPaths){
   const path=resolve(project,p),actual=realpathSync.native(path);
   if(!inside(physicalProject,actual)||secrets.some(s=>inside(s,actual))||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||lstatSync(path).nlink>1)throw Error('Protected input or linked alias escaped the workspace');
   total+=lstatSync(path).size;if(total>8*1024*1024)throw Error('Sandbox input limit exceeded');
   const delivered=executionPolicy==='native-permission'?await readInput({workspace:project,path:p,absolutePath:actual}):readFileSync(actual);
   if(!Buffer.isBuffer(delivered))throw Error('Native read delegate must return exact untruncated bytes');
   total+=delivered.length-lstatSync(path).size;if(total>8*1024*1024)throw Error('Sandbox input limit exceeded');
   inputs.push({path:p,bytes:delivered});
  }
  const scratch=mkdtempSync(join(root,'sandbox-'));
  try{
   const stagedInputs=join(scratch,'inputs'),stagedOutputs=join(scratch,'outputs');mkdirSync(stagedInputs);mkdirSync(stagedOutputs);
   for(const item of inputs){const p=join(stagedInputs,item.path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,item.bytes);}
   for(const rel of outputPaths){
    const target=join(stagedOutputs,rel),placeholder=join(stagedInputs,rel);mkdirSync(dirname(target),{recursive:true});mkdirSync(dirname(placeholder),{recursive:true});
    const original=inputs.find(x=>x.path===rel)?.bytes??Buffer.alloc(0);writeFileSync(target,original);if(!existsSync(placeholder))writeFileSync(placeholder,Buffer.alloc(0));
   }
   const payload={method:await linuxPath(method),inputs:await linuxPath(stagedInputs),outputs:await linuxPath(stagedOutputs),script,outputPaths,timeoutMs:taskTimeout};
   const request=process.platform==='win32'?{command:'wsl.exe',args:['--exec','/usr/bin/python3','-c',helper]}:{command:'/usr/bin/python3',args:['-c',helper]};
   const text=await invokeChecked({...request,input:JSON.stringify(payload),purpose:'inspected-method-isolated-execution'});
   const result=JSON.parse(text);if(typeof result.ok!=='boolean'||!result.outputs||typeof result.outputs!=='object')throw Error('Malformed sandbox execution result');
   const outputs={};let outputBytes=0;
   if(result.ok&&Object.keys(result.outputs).length!==outputPaths.length)throw Error('Missing staged output manifest entry');
   if(result.ok)for(const [path,entry]of Object.entries(result.outputs)){
    if(!outputPaths.includes(path)||!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Unexpected sandbox output manifest');
    const staged=join(stagedOutputs,path);
    if(!inside(stagedOutputs,realpathSync(staged))||!lstatSync(staged).isFile()||lstatSync(staged).isSymbolicLink())throw Error('Staged output escaped its private root');
    outputBytes+=lstatSync(staged).size;if(outputBytes>2*1024*1024)throw Error('Sandbox aggregate output limit exceeded');
    const bytes=readFileSync(staged);if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Staged output digest mismatch');outputs[path]=bytes;
   }
   return {...result,outputs,methodScriptSha256:sha(readFileSync(selected)),inputSha256:Object.fromEntries(inputs.map(x=>[x.path,sha(x.bytes)])),committed:false};
  }finally{
   if(dirname(resolve(scratch))!==root||!basename(scratch).startsWith('sandbox-')||realpathSync(scratch)!==resolve(scratch))throw Error('Sandbox cleanup path verification failed');
   rmSync(scratch,{recursive:true,force:true});
  }
 }
 async function probe(){
  const scratch=mkdtempSync(join(root,'sandbox-probe-'));
  try{
   const workspace=join(scratch,'project'),methodRoot=join(scratch,'method');mkdirSync(workspace);mkdirSync(methodRoot);
   writeFileSync(join(methodRoot,'probe.py'),"import os\nassert not os.path.exists('/mnt/c/Users')\nprint('PYTHON_SANDBOX_READY')\n");
   const r=await execute({workspace,methodRoot,script:'probe.py'});return {available:r.ok&&r.stdout.trim()==='PYTHON_SANDBOX_READY',reason:r.ok?undefined:r.stderr,isolation:r.isolation,executionPolicy};
  }catch(error){return {available:false,reason:error.message,executionPolicy};}
  finally{if(dirname(resolve(scratch))!==root||!basename(scratch).startsWith('sandbox-probe-'))throw Error('Probe cleanup target invalid');rmSync(scratch,{recursive:true,force:true});}
 }
 return Object.freeze({execute,probe,executionPolicy});
}
