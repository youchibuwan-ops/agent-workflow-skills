"""Exercise the actual recorder against a fake RPC executable; zero inference."""
from pathlib import Path
import contextlib,importlib.util,json,os,shutil,signal,subprocess,sys,tempfile,time,types

HERE=Path(__file__).resolve().parent
FAKE='''import sys,json,time
scenario=sys.argv[1]
def emit(x):print(json.dumps(x),flush=True)
def done(thread,turn,status='completed'):return {'method':'turn/completed','params':{'threadId':thread,'turn':{'id':turn,'status':status}}}
for line in sys.stdin:
 e=json.loads(line);m=e.get('method')
 if m=='initialize':emit({'id':e['id'],'result':{}})
 if m=='thread/start':emit({'id':e['id'],'result':{'model':'gpt-6-astra','reasoningEffort':'xhigh','approvalPolicy':'never','sandbox':{'type':'dangerFullAccess'},'thread':{'id':'parent'}}})
 if m=='turn/start':
  emit({'id':e['id'],'result':{'turn':{'id':'main-turn'}}})
  emit({'method':'thread/tokenUsage/updated','params':{'threadId':'parent','tokenUsage':{'total':{'totalTokens':123}}}})
  emit({'method':'thread/tokenUsage/updated','params':{'threadId':'child','tokenUsage':{'total':{'totalTokens':999}}}})
  emit(done('child','child-turn'))
  emit(done('parent','stale-turn'))
  if scenario=='crash':sys.exit(7)
  if scenario=='tools':
   for i in range(3):emit({'method':'item/started','params':{'item':{'type':'commandExecution','id':str(i)}}})
  elif scenario=='mcp':emit({'method':'item/started','params':{'item':{'type':'mcpToolCall','id':'unexpected'}}})
  elif scenario!='child-only':emit(done('parent','main-turn','failed' if scenario=='failed' else 'completed'))
  time.sleep(20)
'''

def run_case(base,scenario):
    root=base/scenario;root.mkdir();(root/'workspace').mkdir();(root/'state').mkdir()
    (root/'workspace/output.html').write_text('<svg/>')
    fake=root/'server.py';fake.write_text(FAKE)
    (root/'preparation.json').write_text(json.dumps({'command':[sys.executable,str(fake),scenario],'cli':'fake','network_proxy_sha256':None,'arm':'A','task':'svg','target':'crafting-reference-based-svg-assets'}))
    # The recorder's pre-turn CLI version check is mocked separately from RPC.
    original_check=subprocess.check_output
    subprocess.check_output=lambda *a,**kw:'fake'
    runner=types.ModuleType('run')
    runner.PROTOCOL={'version':1,'frozen_skill_commit':'test','model':'gpt-6-astra','reasoning_effort':'xhigh','wall_seconds':.3,'max_tool_calls':3}
    runner.resume_study=lambda *_:None;runner.check_frozen=lambda *_:None
    runner.check_catalog=lambda *_:None;runner.check_payloads=lambda *_:None
    runner.network_env=lambda env,*_:env;runner.isolated_env=lambda *_:dict(os.environ)
    runner.runtime_flags=lambda:[];runner.catalog=lambda *_a,**_kw:[]
    runner.task_prompt=lambda *_:HERE/'prompt.txt'
    runner.hashes=lambda p:{q.name:'test' for q in p.rglob('*') if q.is_file()}
    runner.write_json=lambda p,v:p.write_text(json.dumps(v))
    runner.snapshot_artifacts=lambda p,e:(p/'snapshot-seen.txt').write_text(e.get('method',''))
    @contextlib.contextmanager
    def auth(source,dest):
        dest.write_text('fake-test-only')
        try:yield
        finally:dest.unlink(missing_ok=True)
    runner.temporary_auth=auth
    def stop(proc):
        try:os.killpg(proc.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        proc.wait(timeout=3)
    runner.stop=stop
    sys.modules['run']=runner
    spec=importlib.util.spec_from_file_location('tested_recorder',HERE/'native_recorder.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    original_argv=sys.argv;sys.argv=['recorder','--out',str(root),'--sandbox','danger-full-access','--experimental-raw-events']
    started=time.monotonic()
    try:module.main()
    finally:sys.argv=original_argv;subprocess.check_output=original_check
    result=json.loads((root/'execution.json').read_text());result['test_wall_seconds']=time.monotonic()-started
    assert not (root/'state/auth.json').exists()
    assert result['raw_stream_complete'] is True
    assert result['test_wall_seconds']<3
    assert result['usage']['total']['totalTokens']==123
    return result

def main():
    base=Path(sys.argv[1]);base.mkdir(exist_ok=False)
    cases={s:run_case(base,s) for s in ['success','child-only','tools','failed','mcp','crash']}
    assert cases['success']['status']=='completed_needs_review'
    assert cases['success']['primary_turn_id']=='main-turn'
    assert cases['child-only']['status']=='budget_exhausted'
    assert cases['tools']['status']=='budget_exhausted' and cases['tools']['tool_calls']==3
    assert cases['failed']['status']=='task_or_environment_failure'
    assert cases['mcp']['status']=='invalid_contamination'
    assert cases['crash']['status']=='environment_blocked'
    from observer import budget_exhausted,is_primary_completion
    assert budget_exhausted(10,0,0,{'wall_seconds':10,'max_tool_calls':3})
    assert not budget_exhausted(9,0,2,{'wall_seconds':10,'max_tool_calls':3})
    assert budget_exhausted(0,0,3,{'wall_seconds':10,'max_tool_calls':3})
    assert not is_primary_completion({'method':'turn/completed','params':{'threadId':'child','turn':{'id':'main'}}},'parent','main')
    result={'all_pass':True,'inference_calls':0,'cases':{s:{k:r[k] for k in ['status','tool_calls','raw_stream_complete','test_wall_seconds']} for s,r in cases.items()},'boundary_assertions':4}
    (base/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))

if __name__=='__main__':main()
