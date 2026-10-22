"""Thin wrapper around Skills CLI and Codex's native catalog/JSONL interfaces.

No model judge, trigger simulator, credential exporter or custom agent loop.
Run outside the source repository; results remain private until manually redacted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import subprocess
import threading
import time

PACKAGE = Path(__file__).resolve().parent
PROTOCOL = json.loads((PACKAGE / 'protocol.json').read_text(encoding='utf8'))
SYSTEM = {'imagegen', 'openai-docs', 'plugin-creator', 'review-agent', 'skill-creator', 'skill-installer'}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def hashes(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file() and '.git' not in p.parts}


def fresh_root(root):
    root = root.resolve()
    repo = PACKAGE.parents[1]
    if root.exists() or ((repo / 'skills').is_dir() and (root == repo or repo in root.parents)):
        raise ValueError('Use a NEW directory outside the source repository')
    root.mkdir(parents=True)
    return root


def package_hashes():
    return {p: v for p, v in hashes(PACKAGE).items() if not p.endswith('.pyc')}


def check_frozen(root, preparation):
    current = {p: v for p, v in hashes(root / 'workspace').items()
               if not p.startswith('.agents/') and p != 'skills-lock.json'}
    if current != preparation['input_sha256'] or package_hashes() != preparation['package_sha256']:
        raise ValueError('Task inputs or evaluation package changed after preparation')


def isolated_env(root, original=None):
    original = os.environ if original is None else original
    env = {k: v for k, v in original.items() if k.upper() in
           {'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PROGRAMFILES', 'PROGRAMFILES(X86)'}}
    for rel in ['home', 'state', 'cache', 'temp', 'home/AppData/Roaming', 'home/AppData/Local']:
        (root / rel).mkdir(parents=True, exist_ok=True)
    env.update(HOME=str(root / 'home'), USERPROFILE=str(root / 'home'), CODEX_HOME=str(root / 'state'),
               APPDATA=str(root / 'home/AppData/Roaming'), LOCALAPPDATA=str(root / 'home/AppData/Local'),
               XDG_CONFIG_HOME=str(root / 'home/.config'), XDG_CACHE_HOME=str(root / 'cache'),
               TEMP=str(root / 'temp'), TMP=str(root / 'temp'), TMPDIR=str(root / 'temp'),
               npm_config_cache=str(root / 'cache/npm'), PIP_CACHE_DIR=str(root / 'cache/pip'),
               GIT_CONFIG_GLOBAL=str(root / 'home/.gitconfig'), GIT_CONFIG_NOSYSTEM='1',
               PYTHONUTF8='1', DISABLE_TELEMETRY='1', DO_NOT_TRACK='1', NO_COLOR='1')
    return env


def executable(name):
    path = Path(shutil.which(name) or name).resolve()
    if path.suffix.lower() in {'.cmd', '.ps1'}:
        js = path.parent / 'node_modules' / ('@openai/codex/bin/codex.js' if name == 'codex' else 'npm/bin/npm-cli.js')
        if not js.is_file():
            raise ValueError('Cannot resolve CLI shim; provide --codex with a native executable')
        return [shutil.which('node'), str(js)]
    return [str(path)]


def catalog(command, root, env):
    process = subprocess.Popen(command + ['app-server'], cwd=root / 'workspace', env=env,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, encoding='utf8')
    messages = queue.Queue()
    threading.Thread(target=lambda: [messages.put(line) for line in process.stdout], daemon=True).start()
    def send(message):
        process.stdin.write(json.dumps(message) + '\n')
        process.stdin.flush()
    def receive(identifier):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            message = json.loads(messages.get(timeout=max(.1, deadline - time.monotonic())))
            if message.get('id') == identifier:
                if 'error' in message:
                    raise ValueError(message['error'])
                return message['result']
        raise TimeoutError('Codex catalog timeout')
    try:
        send({'id': 0, 'method': 'initialize', 'params': {'clientInfo': {'name': 'workflow_skill_acceptance', 'version': '1'}}})
        receive(0)
        send({'method': 'initialized', 'params': {}})
        send({'id': 1, 'method': 'skills/list', 'params': {'cwds': [str(root / 'workspace')], 'forceReload': True}})
        result = receive(1)
        if len(result['data']) != 1 or result['data'][0]['errors']:
            raise ValueError('Unexpected cwd or Skill parse errors')
        write_json(root / 'catalog.json', result)
        return result['data'][0]['skills']
    finally:
        process.terminate()
        process.wait(timeout=10)


def check_catalog(skills, arm, target):
    enabled = [s for s in skills if s.get('enabled')]
    unexpected = [s['name'] for s in skills if not
                  (s.get('scope') == 'system' and s['name'] in SYSTEM) and not
                  (arm == 'B' and s['name'] == target and s.get('scope') == 'repo')]
    selected = [s for s in enabled if s['name'] == target]
    if unexpected or len(selected) != (1 if arm == 'B' else 0):
        raise ValueError('Contaminated/missing target catalog: ' + repr(unexpected))


def successful_read(item, target):
    """Find read candidates only; a reviewer must inspect the actual command/output."""
    command = item.get('command', '')
    return (item.get('type') == 'command_execution' and item.get('exit_code') == 0
            and target in command and 'SKILL.md' in command
            and bool(re.search(r'\b(Get-Content|cat|read_text|readFileSync|readFile)\b', command)))


def prepare(args):
    root = fresh_root(Path(args.out))
    env = isolated_env(root)
    shutil.copytree(PACKAGE / 'tasks' / args.task, root / 'workspace')
    (root / 'workspace/prompt.txt').unlink()
    command = [args.codex] if args.codex else executable('codex')
    version = subprocess.check_output(command + ['--version'], env=env, encoding='utf8').strip()
    if version != 'codex-cli ' + PROTOCOL['cli_version']:
        raise ValueError('Pin the declared Codex version; do not silently substitute')
    target = PROTOCOL['target_skills'][args.task]
    before = hashes(root / 'workspace')
    if args.arm == 'B':
        source = 'https://github.com/youchibuwan-ops/agent-workflow-skills/tree/' + PROTOCOL['frozen_skill_commit']
        with (root / 'install.log').open('w', encoding='utf8') as log:
            subprocess.run(executable('npm') + ['exec', '--yes', '--package=skills@1.7.4', '--', 'skills', 'add',
                           source, '--skill', target, '-a', 'codex', '--copy', '-y'], cwd=root / 'workspace',
                           env=env, stdout=log, stderr=log, check=True, timeout=180)
        expected = json.loads((PACKAGE / 'payloads.json').read_text(encoding='utf8'))[target]
        if hashes(root / 'workspace/.agents/skills' / target) != expected:
            raise ValueError('Installed payload mismatch')
    observed = catalog(command, root, env)
    check_catalog(observed, args.arm, target)
    write_json(root / 'preparation.json', {'arm': args.arm, 'task': args.task, 'cli': version, 'command': command,
               'input_sha256': before, 'target': target, 'protocol_sha256': hashlib.sha256((PACKAGE / 'protocol.json').read_bytes()).hexdigest(),
               'package_sha256': package_hashes(),
               'system_sha256': {s['name']: hashes(Path(s['path']).parent) for s in observed if s.get('scope') == 'system'},
               'catalog_valid': True, 'target_installed': args.arm == 'B'})
    print('Prepared fresh ' + args.arm + ' / ' + args.task + '; host catalog verified: ' + str(root))


def stop(process):
    if process.poll() is not None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=10)


def run(args):
    root = Path(args.out).resolve()
    preparation = json.loads((root / 'preparation.json').read_text(encoding='utf8'))
    if (root / 'events.jsonl').exists():
        raise ValueError('Never reuse a behavioral environment; prepare a fresh one')
    if preparation['protocol_sha256'] != hashlib.sha256((PACKAGE / 'protocol.json').read_bytes()).hexdigest():
        raise ValueError('Protocol changed after preparation')
    check_frozen(root, preparation)
    env = isolated_env(root)
    check_catalog(catalog(preparation['command'], root, env), preparation['arm'], preparation['target'])
    prompt_file = PACKAGE / 'tasks' / preparation['task'] / 'prompt.txt'
    if args.explicit:
        if preparation['arm'] != 'B':
            raise ValueError('Explicit smoke is separate from A/B and needs target B')
        prompt_file = PACKAGE / 'tasks' / ('explicit-svg.txt' if preparation['task'] == 'svg' else 'explicit-discovery.txt')
    prompt = prompt_file.read_text(encoding='utf8')
    (root / 'prompt.txt').write_text(prompt, encoding='utf8')
    auth = root / 'state/auth.json'
    if args.auth_file:
        if auth.exists():
            raise ValueError('Refusing to overwrite existing isolated credentials')
        shutil.copy2(args.auth_file, auth)
        auth.chmod(0o600)
    flags = ['exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--ephemeral', '--json',
             '-m', PROTOCOL['model'], '-c', 'model_reasoning_effort="' + PROTOCOL['reasoning_effort'] + '"',
             '-c', 'approval_policy="never"', '-c', 'web_search="live"',
             '-c', 'sandbox_workspace_write.network_access=true', '--sandbox', args.sandbox,
             '-C', str(root / 'workspace'), '-']
    started = time.monotonic()
    status, tools, usage, reads = 'environment_blocked', 0, None, []
    process = None
    try:
        with (root / 'events.jsonl').open('w', encoding='utf8') as log, (root / 'stderr.log').open('w', encoding='utf8') as error:
            process = subprocess.Popen(preparation['command'] + flags, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=error, env=env, text=True, encoding='utf8', cwd=root / 'workspace',
                                       start_new_session=os.name != 'nt')
            output = queue.Queue()
            def read():
                for line in process.stdout:
                    output.put(line)
                output.put(None)
            threading.Thread(target=read, daemon=True).start()
            process.stdin.write(prompt)
            process.stdin.close()
            while True:
                if time.monotonic() - started >= PROTOCOL['wall_seconds'] or tools >= PROTOCOL['max_tool_calls']:
                    status = 'budget_exhausted'
                    stop(process)
                    break
                try:
                    line = output.get(timeout=.2)
                except queue.Empty:
                    continue
                if line is None:
                    break
                log.write(line)
                log.flush()
                event = json.loads(line)
                item = event.get('item', {})
                if event['type'] == 'item.started' and item.get('type') in {'command_execution', 'web_search', 'mcp_tool_call'}:
                    tools += 1
                if event['type'] == 'item.completed' and successful_read(item, preparation['target']):
                    reads.append(item['id'])
                if event['type'] == 'turn.completed':
                    status, usage = 'completed_needs_review', event.get('usage')
                elif event['type'] == 'turn.failed':
                    status = 'environment_or_task_failure_needs_review'
            process.wait(timeout=10)
    finally:
        if process is not None:
            stop(process)
        if args.auth_file:
            auth.unlink(missing_ok=True)
        write_json(root / 'execution.json', {'mode': 'explicit_smoke' if args.explicit else 'implicit_task',
                   'model': PROTOCOL['model'], 'effort': PROTOCOL['reasoning_effort'], 'sandbox': args.sandbox,
                   'elapsed_seconds': round(time.monotonic() - started, 2), 'tool_calls': tools,
                   'usage': usage, 'status': status, 'instruction_read_candidates': reads,
                   'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(),
                   'automatic_pass': None, 'task_pass': None, 'review_required': True,
                   'artifact_sha256': hashes(root / 'workspace')})
    print('Actual run: ' + status + '; manual evidence/artifact review required')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    setup = commands.add_parser('prepare')
    setup.add_argument('--out', required=True)
    setup.add_argument('--task', choices=sorted(PROTOCOL['target_skills']), required=True)
    setup.add_argument('--arm', choices=['A', 'B'], required=True)
    setup.add_argument('--codex')
    execute = commands.add_parser('run')
    execute.add_argument('--out', required=True)
    execute.add_argument('--auth-file', help='PRIVATE account file; copied transiently, never logged or bundled')
    execute.add_argument('--explicit', action='store_true')
    execute.add_argument('--sandbox', choices=['workspace-write', 'danger-full-access'], default='workspace-write')
    arguments = parser.parse_args()
    prepare(arguments) if arguments.action == 'prepare' else run(arguments)
