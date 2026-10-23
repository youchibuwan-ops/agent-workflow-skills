"""External control-plane adapter; model and every model tool run only inside bwrap."""
from pathlib import Path
import subprocess,shutil,json,hashlib,sys,os,time,atexit
source=Path('/mnt/c/Users/33092/.codex/exports/agent-workflow-skills-20261022')
public=source/'evals/pelican/animated-v1'; base=Path('/var/tmp/codex-clean-runtime-20261023-base')
arm=sys.argv[1]; assert arm in ['A','B']
setup_only='--setup-only' in sys.argv
run=Path('/var/tmp/pelican-animated-ab-v1-r01-20261023-'+('setup-' if setup_only else '')+arm);run.mkdir(exist_ok=False)
actor=run/'actor';control=run/'control';actor.mkdir();control.mkdir()
status={'arm':arm,'launched':False,'exception':None}
def export_all():
    (actor/'state/auth.json').unlink(missing_ok=True)
    status['auth_copy_absent']=not (actor/'state/auth.json').exists()
    (control/'driver-result.json').write_text(json.dumps(status,indent=2))
    output=Path('/mnt/c/Users/33092/.codex/tmp/pelican-animated-ab-20261023')/('r01-'+('setup-' if setup_only else '')+arm)
    output.mkdir(exist_ok=False)
    for p in control.iterdir():
        if p.is_file():shutil.copy2(p,output/p.name)
        elif p.is_dir() and not p.is_symlink() and p.name not in ['home','state','cache','temp']:shutil.copytree(p,output/p.name)
    if (actor/'workspace').exists():shutil.copytree(actor/'workspace',output/'workspace',symlinks=True)
atexit.register(export_all)
original_exception_hook=sys.excepthook
def record_exception(kind,value,trace):
    status['exception']=kind.__name__+': '+str(value)
    original_exception_hook(kind,value,trace)
sys.excepthook=record_exception
for name in ['workspace','home','state','cache','temp']:(actor/name).mkdir()
for name in ['workspace','state']:(control/name).symlink_to(actor/name,target_is_directory=True)
for name in ['TOOLS.md']:shutil.copy2(public/name,actor/'workspace'/name)
manifest=json.loads((source/'evals/codex/v7/payloads.json').read_text())
target='crafting-reference-based-svg-assets'
if arm=='B':
    dest=actor/'workspace/.agents/skills'/target
    for name,digest in manifest[target].items():
        content=subprocess.check_output(['git','show','d8a81d9f0c46c94f2c8ccb904da0514377a8573c:skills/'+target+'/'+name],cwd=source)
        assert hashlib.sha256(content).hexdigest()==digest
        (dest/name).parent.mkdir(parents=True,exist_ok=True);(dest/name).write_bytes(content)
(run/'hosts').write_text('127.0.0.1 localhost\n');(run/'passwd').write_text('actor:x:1000:1000:actor:/home/actor:/bin/bash\n')
codepath='/tools/codex/package/vendor/x86_64-unknown-linux-musl/bin/codex'
prefix=['bwrap','--unshare-all','--share-net','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind','/etc/ssl','/etc/ssl','--ro-bind','/etc/resolv.conf','/etc/resolv.conf','--ro-bind',str(run/'hosts'),'/etc/hosts','--ro-bind',str(run/'passwd'),'/etc/passwd','--ro-bind',str(base/'container-marker'),'/.dockerenv','--ro-bind',str(base/'node/node-v22.22.1-linux-x64'),'/tools/node','--ro-bind',str(base/'codex'),'/tools/codex','--ro-bind',str(base/'python'),'/tools/python','--ro-bind','/var/tmp/pelican-ab-20261023-tools','/tools/render']
for name,dest in [('workspace','/workspace'),('home','/home/actor'),('state','/state'),('cache','/cache'),('temp','/temp')]:prefix+=['--bind',str(actor/name),dest]
env={'PATH':'/tools/node/bin:/tools/python/bin:/tools/codex/package/vendor/x86_64-unknown-linux-musl/bin:/usr/bin:/bin','HOME':'/home/actor','USERPROFILE':'/home/actor','CODEX_HOME':'/state','XDG_CONFIG_HOME':'/home/actor/.config','XDG_CACHE_HOME':'/cache','TEMP':'/temp','TMP':'/temp','TMPDIR':'/temp','npm_config_cache':'/cache/npm','PIP_CACHE_DIR':'/cache/pip','GIT_CONFIG_GLOBAL':'/home/actor/.gitconfig','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'http.version','GIT_CONFIG_VALUE_0':'HTTP/1.1','HTTP_PROXY':'http://127.0.0.1:7892','HTTPS_PROXY':'http://127.0.0.1:7892','http_proxy':'http://127.0.0.1:7892','https_proxy':'http://127.0.0.1:7892','LANG':'C.UTF-8','PYTHONUTF8':'1','DISABLE_TELEMETRY':'1','DO_NOT_TRACK':'1','NO_COLOR':'1'}
prefix+=['--ro-bind','/var/tmp/pelican-animated-20261023-tools','/tools/animation']
env['PLAYWRIGHT_BROWSERS_PATH']='/tools/animation/browsers'
env['LD_LIBRARY_PATH']='/tools/animation/sysdeps/usr/lib/x86_64-linux-gnu'
for key,value in env.items():prefix+=['--setenv',key,value]
prefix+=['--chdir','/workspace']
(control/'wrapper.py').write_text('import os,sys\nprefix='+repr(prefix)+'\nos.execvp(prefix[0],prefix+['+repr(codepath)+']+sys.argv[1:])\n')
probe="""from pathlib import Path
import os,json
bad=[str(p) for p in [Path('/mnt'),Path('/opt/experiment'),Path('/control'),Path('/run/auth.json'),Path('/home/lasydog')] if p.exists()]
assert not bad,bad
assert sorted(Path('/home').iterdir())==[Path('/home/actor')]
assert not any(Path('/cache').iterdir())
assert not any(Path('/temp').iterdir())
assert not any(Path('/state').iterdir())
assert not any(Path('/home/actor').iterdir())
assert not Path('/workspace/AGENTS.md').exists()
print(json.dumps({'hidden_control_plane':True,'host_mounts_absent':True,'fresh_cache_home_state_temp':True,'pid_namespace':len([p for p in Path('/proc').iterdir() if p.name.isdigit()])<10,'environment_keys':sorted(os.environ),'workspace_files':[str(p.relative_to('/workspace')) for p in Path('/workspace').rglob('*') if p.is_file()]}))
"""
boundary=subprocess.check_output(prefix+['/tools/python/bin/python3','-c',probe],text=True)
(control/'boundary.json').write_text(boundary)
assert json.loads(boundary)['pid_namespace']
package=control/'package';package.mkdir();(package/'tasks/svg').mkdir(parents=True)
for name in ['prompt.txt','TOOLS.md']:shutil.copy2(public/name,package/'tasks/svg'/name)
shutil.copy2(public/'protocol.json',package/'protocol.json');shutil.copy2(source/'evals/codex/v7/payloads.json',package/'payloads.json')
runner=(source/'evals/codex/run.py').read_text()
runner=runner.replace("str(root / 'workspace')","'/workspace'")
old="hashes(Path(s['path']).parent)"
assert runner.count(old)==2
runner=runner.replace(old,"hashes(root / 'state' / Path(s['path']).relative_to('/state').parent)")
(package/'run.py').write_text(runner)
for name in ['native_recorder.py','observer.py']:
    shutil.copy2(public/name,package/('record_rpc.py' if name=='native_recorder.py' else name))

snapshot='''
def snapshot_artifacts(root,event):
    import shutil
    store=root/'artifact-history';store.mkdir(exist_ok=True)
    rows=[]
    workspace=(root/'workspace').resolve()
    for p in (root/'workspace').rglob('*'):
        rel=p.relative_to(root/'workspace').as_posix()
        if p.suffix.lower() not in {'.svg','.png','.jpg','.jpeg','.html','.css','.js','.mjs','.webm'} or rel.startswith('.agents/'):continue
        try:
            if p.is_symlink() or not p.resolve().is_relative_to(workspace):
                rows.append({'file':rel,'skipped':'symlink/outside workspace'});continue
            if not p.is_file():continue
            if p.stat().st_size>20000000:
                rows.append({'file':rel,'skipped':'over 20MB snapshot cap; original retained'});continue
            data=p.read_bytes(); digest=hashlib.sha256(data).hexdigest();dest=store/(digest+p.suffix.lower())
            if not dest.exists():dest.write_bytes(data)
            rows.append({'file':rel,'sha256':digest,'bytes':len(data)})
        except OSError as exc:rows.append({'file':rel,'snapshot_error':type(exc).__name__})
    with (root/'artifact-history.jsonl').open('a') as f:f.write(json.dumps({'event':event.get('method'),'item_id':event.get('params',{}).get('item',{}).get('id'),'files':rows})+'\\n')
'''
runner+=snapshot;(package/'run.py').write_text(runner)
control_code='''from pathlib import Path
import sys,json,hashlib,subprocess
sys.path.insert(0,PACKAGE)
import run as runner
root=Path(CONTROL)
command=['/usr/bin/python3',WRAPPER]
env=runner.network_env(runner.isolated_env(root),'http://127.0.0.1:7892')
cli=subprocess.check_output(command+['--version'],env=env,text=True).strip()
assert cli=='codex-cli 0.155.1'
observed=runner.catalog(command,root,env)
runner.check_catalog(observed,ARM,'crafting-reference-based-svg-assets')
current=runner.hashes(root/'workspace')
inputs={p:v for p,v in current.items() if not p.startswith('.agents/')}
prep={'arm':ARM,'task':'svg','cli':cli,'command':command,'frozen_skill_commit':runner.PROTOCOL['frozen_skill_commit'],'input_sha256':inputs,'target':'crafting-reference-based-svg-assets','protocol_version':1,'protocol_sha256':hashlib.sha256(runner.PROTOCOL_FILE.read_bytes()).hexdigest(),'package_sha256':runner.package_hashes(),'system_sha256':{s['name']:runner.hashes(root/'state'/Path(s['path']).relative_to('/state').parent) for s in observed if s.get('scope')=='system'},'runtime_flags':runner.runtime_flags(),'network_proxy_sha256':hashlib.sha256(b'http://127.0.0.1:7892').hexdigest(),'catalog_valid':True,'target_installed':ARM=='B','installation':'verified exact Git blobs copied before fresh actor; no installer cache'}
runner.write_json(root/'preparation.json',prep)
runner.check_payloads(root,prep,observed)
if SETUP_ONLY:
    print('SETUP_ONLY: version/catalog/payload/boundary verified; no auth/model call')
    sys.exit(0)
guard=json.loads(Path('/mnt/c/Users/33092/.codex/tmp/pelican-animated-ab-20261023/preflight-pass.json').read_text())
assert guard['all_pass'] and guard['inference_calls']==0
assert guard['package_hashes']=={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('/mnt/c/Users/33092/.codex/exports/agent-workflow-skills-20261022/evals/pelican/animated-v1').iterdir() if p.is_file()}
subprocess.run(['/usr/bin/python3',str(Path(PACKAGE)/'record_rpc.py'),'--out',CONTROL,'--auth-file','/mnt/c/Users/33092/.codex/auth.json','--sandbox','danger-full-access','--isolation-boundary','container','--boundary-id',BOUNDARY,'--network-proxy','http://127.0.0.1:7892','--experimental-raw-events'],check=True,timeout=970)
'''.replace('PACKAGE',repr(str(package))).replace('CONTROL',repr(str(control))).replace('WRAPPER',repr(str(control/'wrapper.py'))).replace('BOUNDARY',repr(hashlib.sha256((package/'protocol.json').read_bytes()).hexdigest())).replace('ARM',repr(arm)).replace('SETUP_ONLY',repr(setup_only))
(control/'control.py').write_text(control_code)
try:
    with (control/'stdout.log').open('w') as stdout,(control/'stderr.log').open('w') as stderr:
        status['launched']=True
        proc=subprocess.Popen(['/usr/bin/python3',str(control/'control.py')],stdout=stdout,stderr=stderr,start_new_session=True)
        try:status['exit']=proc.wait(timeout=1100)
        except subprocess.TimeoutExpired:
            import signal
            os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=15);raise
except Exception as exc:
    status['exception']=type(exc).__name__+': '+str(exc)
finally:
    # Exact task-owned temporary copy only. Never alter the original authentication file.
    (actor/'state/auth.json').unlink(missing_ok=True)
    status['auth_copy_absent']=not (actor/'state/auth.json').exists()
    (control/'driver-result.json').write_text(json.dumps(status,indent=2))
print(json.dumps(status));print((control/'stdout.log').read_text()[-1500:]);print((control/'stderr.log').read_text()[-1500:])
sys.exit(0 if status.get('exit')==0 else 2)
