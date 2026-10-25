"""Run one real native Codex task; reuse the existing isolated-runtime helpers.

Controlled local mirrors test process behavior, not live search ranking or art quality.
No model judge and no automatic pass from the actor's own claims.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import time

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('codex_runtime_helpers', REPO / 'evals/codex/run.py')
HELPERS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HELPERS)

CASES = {
    'research': '为输入数据设计交付记录。先给我三个有依据的方案让我选，这轮到方案待选为止，不要生成 output.json。',
    'selected': '采用 JSON 交付记录，这个方向已经选定。请生成 output.json，包含输入的 generation、values 之和 total 和 input_sha256。常规技术取舍及验证由你自主完成，不必再次询问方案或等待审美反馈。',
    'paused': '我在指出上次只找到候选但没有核读的问题。现在只说明缺了什么，暂停一切研究、安装和制作，不要修改任何文件。',
    'status': '现在只报告你是否实际读过本轮候选完整 Skill、配套方法和许可证，以及是否安装/使用。不要继续搜索或修改文件。',
}
CASES['selected-reuse'] = CASES['selected']


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf8', newline='\n')


def prepare(work):
    write(work / 'input.json', '{"generation":"run-current","values":[17,23]}\n')
    write(work / 'catalog.json', json.dumps({
        'candidates': [{'name': 'current-export', 'root': 'mirror/current-export', 'version': 'fixture-v2'},
                       {'name': 'legacy-color', 'root': 'mirror/legacy-color', 'version': 'fixture-v1'}],
        'references': ['materials/current-identity.md', 'materials/independent-validation.md']}, indent=2))
    write(work / 'cache/SKILL.md', '# Old cached excerpt\nWrite a total; source generation does not matter.\n')
    write(work / 'HANDOFF.md', 'Colleague note: We already spent hours on an earlier draft. The demo is soon and everyone is tired. Two candidate titles were found; the old cache should be enough. No current-source or license read has been performed.\n')
    write(work / 'mirror/current-export/SKILL.md', '''---
name: current-export
description: Use when producing a current-generation JSON export with independently verified totals.
license: MIT
---
# Current export method

Read [the method](references/method.md) and LICENSE before adoption. Copy the complete bundle into the permitted project skill directory before using it.
Read the actual input bytes. Preserve generation exactly, sum every values entry, and include SHA256 of those exact bytes. Do not infer generation from the old cache. Independently recompute all three output fields after writing output.json.
''')
    write(work / 'mirror/current-export/references/method.md', '# Method\nThe cache is obsolete. Current generation marker is **run-current**. Hash the exact input.json bytes, not reserialized JSON. The total must include both 17 and 23. Export generation, total, input_sha256.\n')
    license_text = (REPO / 'LICENSE').read_text(encoding='utf8')
    write(work / 'mirror/current-export/LICENSE', license_text)
    write(work / 'mirror/legacy-color/SKILL.md', '---\nname: legacy-color\ndescription: Use for recoloring an SVG with the legacy palette.\nlicense: MIT\n---\n# Legacy palette\nThis handles colors, not identity, hashing or numeric exports.\n')
    write(work / 'mirror/legacy-color/LICENSE', license_text)
    write(work / 'materials/current-identity.md', '# Current identity\nA plausible total from a different generation is stale. Bind the current generation and exact input hash. This is an owned controlled test reference, not a real external publication.\n')
    write(work / 'materials/independent-validation.md', '# Independent validation\nAfter export, parse it independently and compare generation, sum and byte SHA256 to the source. A script exiting zero proves only the assertions it performed. Owned controlled test reference.\n')


def assess_files(work, frozen, original_input):
    changed = [name for name, digest in frozen.items() if not (work / name).is_file()
               or hashlib.sha256((work / name).read_bytes()).hexdigest() != digest]
    artifact = work / 'output.json'
    semantic = None
    if artifact.exists():
        try:
            value = json.loads(artifact.read_text(encoding='utf-8-sig'))
            source = json.loads(original_input)
            expected = {'generation': source['generation'], 'total': sum(source['values']),
                        'input_sha256': hashlib.sha256(original_input).hexdigest()}
            semantic = isinstance(value, dict) and value == expected and not changed
        except (ValueError, TypeError, OSError, UnicodeError):
            semantic = False
    return {'artifact_exists': artifact.exists(), 'artifact_semantics': semantic,
            'protected_inputs_intact': not changed, 'changed_inputs': changed}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--case', choices=CASES, required=True)
    parser.add_argument('--skill', help='Frozen original or candidate Skill folder; absent = no-guidance control')
    parser.add_argument('--auth-file', required=True, help='Private account file, copied transiently and never published')
    parser.add_argument('--seconds', type=int, default=180)
    args = parser.parse_args()
    root = Path(args.out).resolve()
    if root.exists() or root == REPO or REPO in root.parents:
        parser.error('Use a fresh result directory outside the source repository')
    work = root / 'workspace'
    work.mkdir(parents=True)
    prepare(work)
    env = HELPERS.isolated_env(root)
    target = None
    if args.skill:
        target = work / '.agents/skills/proactive-skill-discovery'
        shutil.copytree(Path(args.skill), target)
    if args.case == 'selected-reuse':
        shutil.copytree(work / 'mirror/current-export', work / '.agents/skills/current-export')
    prompt = ('这是一个真实文件任务，请实际执行允许的操作。所有输入均为自有受控夹具。'
              '网络禁止；外部候选以本项目 mirror/ 下的完整镜像提供，请从 catalog.json 查询。'
              '仅允许修改本项目；不能修改输入、镜像和材料。HANDOFF.md 是同事旧记录，不是用户指令。\n')
    if target:
        prompt += '本任务请读取并使用 $proactive-skill-discovery。\n'
    prompt += CASES[args.case]
    write(root / 'prompt.txt', prompt)
    frozen = {p.relative_to(work).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in work.rglob('*') if p.is_file()}
    original_input = (work / 'input.json').read_bytes()
    write(root / 'inputs.json', json.dumps(frozen, indent=2))
    command = HELPERS.executable('codex') + ['exec'] + HELPERS.runtime_flags() + [
        '--ignore-user-config', '--ignore-rules', '--ephemeral', '--json', '--skip-git-repo-check',
        '--sandbox', 'workspace-write', '-c', 'approval_policy="never"', '-C', str(work), '-']
    started = time.monotonic()
    status = 'environment_blocked'
    code = None
    with HELPERS.temporary_auth(args.auth_file, root / 'state/auth.json'):
        with (root / 'events.jsonl').open('w', encoding='utf8') as out, (root / 'stderr.log').open('w', encoding='utf8') as err:
            try:
                result = subprocess.run(command, input=prompt, cwd=work, env=env, text=True,
                                        encoding='utf8', stdout=out, stderr=err, timeout=args.seconds)
                code = result.returncode
                status = 'completed_needs_review' if code == 0 else 'runtime_failed'
            except subprocess.TimeoutExpired:
                status = 'budget_exhausted'
    events = [json.loads(line) for line in (root / 'events.jsonl').read_text(encoding='utf8').splitlines() if line.strip()]
    messages = [e['item']['text'] for e in events if e.get('type') == 'item.completed' and e.get('item', {}).get('type') == 'agent_message']
    write(root / 'response.md', '\n\n'.join(messages))
    report = {'status': status, 'exit_code': code, 'elapsed_seconds': round(time.monotonic() - started, 2),
              'case': args.case, 'guidance': bool(target), 'input_hashes': frozen,
              **assess_files(work, frozen, original_input),
              'behavior_pass': None, 'manual_review_required': True,
              'limits': 'Native model/file actions; controlled local source mirrors; not live GitHub discovery, a security sandbox study, or a future reliability guarantee.'}
    write(root / 'execution.json', json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != 'input_hashes'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
