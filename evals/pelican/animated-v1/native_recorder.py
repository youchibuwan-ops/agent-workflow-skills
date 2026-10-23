"""Optional CLI-0.155.1 native app-server recorder; no custom agent loop.

Raw events are an experimental diagnostic, not a stable public API. Logs can contain
private instructions, account data, copyrighted pages and image bytes: keep private.
Score manually with the unchanged protocol/rubric. Do not pool transports.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
import run as runner
from observer import is_primary_completion, budget_exhausted


def save_result(root, preparation, observed, record):
    # A treatment mutation is itself evidence. Never lose the failure record.
    try:
        if observed is not None:
            runner.check_payloads(root, preparation, observed)
    except ValueError:
        record['status'] = 'invalid_contamination'
        record['payload_integrity'] = False
    else:
        record['payload_integrity'] = True if observed is not None else None
    runner.write_json(root / 'execution.json', record)
    return record['status']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--auth-file', type=Path)
    parser.add_argument('--explicit', action='store_true')
    parser.add_argument('--network-proxy')
    parser.add_argument('--sandbox', choices=['workspace-write', 'danger-full-access'], default='workspace-write')
    parser.add_argument('--isolation-boundary', choices=['native-pilot', 'container', 'disposable-vm'], default='native-pilot')
    parser.add_argument('--boundary-id')
    parser.add_argument('--experimental-raw-events', action='store_true')
    args = parser.parse_args()
    root = Path(args.out).resolve()
    prep = json.loads((root / 'preparation.json').read_text(encoding='utf8'))
    runner.resume_study(prep)
    if (root / 'rpc.jsonl').exists() or (root / 'events.jsonl').exists():
        raise ValueError('Fresh runs only; never replace an earlier observation')
    runner.check_frozen(root, prep)
    env = runner.network_env(runner.isolated_env(root), args.network_proxy)
    proxy_hash = hashlib.sha256(args.network_proxy.encode()).hexdigest() if args.network_proxy else None
    if proxy_hash != prep.get('network_proxy_sha256'):
        raise ValueError('Network transport changed after preparation')
    if subprocess.check_output(prep['command'] + ['--version'], env=env, encoding='utf8').strip() != prep['cli']:
        raise ValueError('CLI changed after preparation')
    boundary = {'isolation_boundary':'external-controller/bubblewrap','boundary_id':args.boundary_id,'study_eligible_boundary':True,'boundary_attested_by':'actual clearenv mount/cache/PID probe; not hardware attestation'}
    if args.explicit:
        if prep['arm'] != 'B':
            raise ValueError('Explicit smoke requires treatment B')
    prompt_file = runner.task_prompt(prep['task'], args.explicit)
    prompt = prompt_file.read_text(encoding='utf8')
    (root / 'prompt.txt').write_text(prompt, encoding='utf8')
    command = prep['command'] + ['app-server'] + runner.runtime_flags() + ['-c', 'approval_policy="never"',
        '-c', 'sandbox_mode="' + args.sandbox + '"', '-c', 'sandbox_workspace_write.network_access=true',
        '-c', 'web_search="live"', '-c', 'model_reasoning_effort="' + runner.PROTOCOL['reasoning_effort'] + '"']
    started, tools, usage, process = time.monotonic(), 0, None, None
    primary_thread_id, primary_turn_id = None, None
    usage_by_thread = {}
    status, observed = 'environment_blocked', None
    drain_complete = False
    with runner.temporary_auth(args.auth_file, root / 'state/auth.json'):
        try:
            observed = runner.catalog(prep['command'], root, env, audit=True)
            runner.check_catalog(observed, prep['arm'], prep['target'])
            runner.check_payloads(root, prep, observed)
            with (root / 'rpc.jsonl').open('w', encoding='utf8') as log, (root / 'stderr.log').open('w', encoding='utf8') as err:
                process = subprocess.Popen(command, cwd=root / 'workspace', env=env, stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE, stderr=err, text=True, encoding='utf8', start_new_session=os.name != 'nt')
                messages = queue.Queue()
                def read():
                    for line in process.stdout:
                        messages.put(line)
                    messages.put(None)
                threading.Thread(target=read, daemon=True).start()
                def send(method, params, identifier=None):
                    event = {'method': method, 'params': params}
                    if identifier is not None:
                        event['id'] = identifier
                    process.stdin.write(json.dumps(event) + '\n')
                    process.stdin.flush()
                def next_event():
                    nonlocal tools, usage, drain_complete
                    while True:
                        if budget_exhausted(time.monotonic(), started, tools, runner.PROTOCOL):
                            raise TimeoutError('Frozen budget exhausted')
                        try:
                            line = messages.get(timeout=.2)
                        except queue.Empty:
                            continue
                        if line is None:
                            drain_complete = True
                            raise RuntimeError('App-server ended before turn completion')
                        log.write(line)
                        log.flush()
                        event = json.loads(line)
                        params = event.get('params', {})
                        item = params.get('item', {})
                        if event.get('method') == 'item/started' and item.get('type') in {'commandExecution', 'webSearch', 'imageView', 'mcpToolCall', 'fileChange'}:
                            tools += 1
                        if event.get('method') == 'thread/tokenUsage/updated':
                            usage_by_thread[params.get('threadId')] = params.get('tokenUsage')
                            if params.get('threadId') == primary_thread_id: usage = params.get('tokenUsage')
                        if item.get('type') == 'mcpToolCall':
                            raise UnexpectedMCP('Unexpected MCP event')
                        if event.get('method') in {'item/completed','turn/completed'}: runner.snapshot_artifacts(root, event)
                        return event
                def call(identifier, method, params):
                    send(method, params, identifier)
                    while True:
                        event = next_event()
                        if event.get('id') == identifier:
                            if 'error' in event:
                                raise RuntimeError(event['error'])
                            return event['result']
                call(0, 'initialize', {'clientInfo': {'name': 'workflow_acceptance_diagnostic', 'version': '1'},
                    'capabilities': {'experimentalApi': args.experimental_raw_events}})
                send('initialized', {})
                result = call(1, 'thread/start', {'cwd': '/workspace', 'model': runner.PROTOCOL['model'],
                    'approvalPolicy': 'never', 'sandbox': args.sandbox, 'ephemeral': False,
                    'experimentalRawEvents': args.experimental_raw_events})
                runner.write_json(root / 'thread-settings.json', {k: result.get(k) for k in
                    ['model', 'approvalPolicy', 'sandbox', 'reasoningEffort']})
                if result['model'] != runner.PROTOCOL['model'] or result['approvalPolicy'] != 'never':
                    raise ValueError('Unexpected native thread settings')
                expected = 'workspaceWrite' if args.sandbox == 'workspace-write' else 'dangerFullAccess'
                if result['sandbox']['type'] != expected or result['reasoningEffort'] != runner.PROTOCOL['reasoning_effort']:
                    raise ValueError('Unexpected sandbox/effort')
                if args.sandbox == 'workspace-write' and not result['sandbox'].get('networkAccess'):
                    raise ValueError('Required network absent from effective thread settings')
                primary_thread_id = result['thread']['id']
                main_turn = call(2, 'turn/start', {'threadId': result['thread']['id'], 'input': [{'type': 'text', 'text': prompt}],
                    'model': runner.PROTOCOL['model'], 'effort': runner.PROTOCOL['reasoning_effort']})
                primary_turn_id = main_turn['turn']['id']
                while True:
                    event = next_event()
                    method, params = event.get('method'), event.get('params', {})
                    item = params.get('item', {})
                    if is_primary_completion(event, primary_thread_id, primary_turn_id):
                        status = 'completed_needs_review' if params['turn']['status'] == 'completed' else 'task_or_environment_failure'
                        break
        except TimeoutError:
            status = 'budget_exhausted'
        except UnexpectedMCP:
            status = 'invalid_contamination'
        except Exception as exc:
            status = 'environment_blocked'
            runner.write_json(root/'controller-error.json', {'class':type(exc).__name__,'message':str(exc)})
        finally:
            try:
                if process is not None:
                    runner.stop(process)
                # Preserve already queued events after the frozen cutoff; report observed overrun.
                end_drain = time.monotonic() + 5
                while not drain_complete and time.monotonic() < end_drain:
                    try: extra = messages.get(timeout=.1)
                    except queue.Empty: continue
                    if extra is None:
                        drain_complete = True
                        break
                    with (root/'rpc.jsonl').open('a',encoding='utf8') as drain: drain.write(extra)
                    event=json.loads(extra); item=event.get('params',{}).get('item',{})
                    if event.get('method')=='item/started' and item.get('type') in {'commandExecution','webSearch','imageView','mcpToolCall','fileChange'}: tools+=1
                    if event.get('method')=='thread/tokenUsage/updated':
                        p=event.get('params',{}); usage_by_thread[p.get('threadId')]=p.get('tokenUsage')
                        if p.get('threadId')==primary_thread_id: usage=p.get('tokenUsage')
                runner.snapshot_artifacts(root, {'method':'coordinator/final-snapshot'})
            except (OSError, subprocess.SubprocessError):
                status = 'environment_blocked'
            status = save_result(root, prep, observed, {'mode': 'explicit' if args.explicit else 'implicit',
                'protocol_version': runner.PROTOCOL['version'], 'frozen_skill_commit': runner.PROTOCOL['frozen_skill_commit'],
                'transport': 'native app-server diagnostic', 'experimental_raw_events': args.experimental_raw_events,
                'model': runner.PROTOCOL['model'], 'effort': runner.PROTOCOL['reasoning_effort'], 'sandbox': args.sandbox,
                **boundary, 'runtime_flags': runner.runtime_flags(), 'network_proxy_sha256': proxy_hash,
                'status': status, 'tool_calls': tools, 'elapsed_seconds': round(time.monotonic() - started, 2),
                'primary_thread_id':primary_thread_id, 'primary_turn_id':primary_turn_id, 'usage_by_thread':usage_by_thread, 'usage': usage, 'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
                'raw_stream_complete':drain_complete, 'tool_overrun':max(0,tools-runner.PROTOCOL['max_tool_calls']), 'automatic_pass': None, 'task_pass': None, 'artifact_sha256': runner.hashes(root / 'workspace')})
    print(status, tools)
    return 0 if status == 'completed_needs_review' else 2


class UnexpectedMCP(Exception):
    pass


if __name__ == '__main__':
    sys.exit(main())
