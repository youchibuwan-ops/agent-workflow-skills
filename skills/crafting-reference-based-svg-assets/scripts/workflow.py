"""Local SVG workflow receipts, Python 3.10+, standard library only.

Checks order, current bytes, distinct local sources and review dependencies.
Does NOT inspect pixels, attest image viewing, or prevent bypass outside this CLI.
One writer per journal. Keep the journal and snapshots private unless reviewed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import xml.etree.ElementTree as ET


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sequence(parts):
    return [('plan', None)] + [(stage, part) for part in parts
                               for stage in ('geometry', 'material', 'review')] + [
        ('assembly', None), ('whole', None)]


def save(root, state):
    temp = root / 'state.tmp'
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    os.replace(temp, root / 'state.json')


def load(root):
    state = json.loads((root / 'state.json').read_text(encoding='utf8'))
    if state.get('version') != 1:
        raise ValueError('Unsupported journal version')
    return state


def stale(root, state):
    for index, row in enumerate(state['active']):
        for item in row['files']:
            original = Path(item['path'])
            snapshot = root / item['snapshot']
            if not original.is_file() or digest(original) != item['sha256']:
                return index, 'Source/evidence changed: ' + item['path']
            if not snapshot.is_file() or digest(snapshot) != item['sha256']:
                return index, 'Receipt snapshot missing/changed: ' + item['snapshot']
    return None


def status(root, state):
    steps = sequence(state['parts'])
    dirty = stale(root, state)
    index = dirty[0] if dirty else len(state['active'])
    done = index == len(steps)
    return {'status': 'stale' if dirty else ('receipts_complete' if done else 'incomplete'),
            'next': None if done else dict(zip(('stage', 'part'), steps[index])),
            'reason': dirty[1] if dirty else None,
            'completed': len(state['active']), 'total': len(steps),
            'visual_quality': 'not_assessed', 'actual_viewing': 'requires_tool_trace_audit'}


def init(root, parts):
    if not parts or len(set(parts)) != len(parts) or any(
            not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', p) for p in parts):
        raise ValueError('Use unique lowercase part IDs, e.g. base lever')
    root.mkdir(parents=True, exist_ok=False)
    state = {'version': 1, 'parts': parts, 'active': [], 'history': []}
    save(root, state)
    return status(root, state)


def inspect_file(path, role, stage):
    path = path.resolve(strict=True)
    if not path.is_file() or not path.stat().st_size:
        raise ValueError('Evidence must be a nonempty file: ' + str(path))
    if path.stat().st_size > 20_000_000:
        raise ValueError('Evidence exceeds 20 MB: ' + str(path))
    data = path.read_bytes()
    if role == 'image':
        if not (data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR'):
            raise ValueError('Use a rendered PNG, not a renamed text file')
    elif stage in ('geometry', 'material', 'review'):
        tree = ET.fromstring(data)
        if tree.tag.split('}')[-1] != 'svg' or not tree.get('viewBox'):
            raise ValueError('Local source must be an SVG with a shared viewBox')
        if not any(e.tag.split('}')[-1] in {'path', 'rect', 'circle', 'ellipse',
                                          'line', 'polyline', 'polygon', 'text', 'use'}
                   for e in tree.iter()):
            raise ValueError('Local SVG has no drawable geometry')
    return path


def record(root, stage, part, source, images, note):
    state = load(root)
    current = status(root, state)
    if current['status'] == 'stale':
        raise ValueError('Rewind before continuing: ' + str(current))
    if current['next'] != {'stage': stage, 'part': part}:
        raise ValueError('Wrong step. Next actual action: ' + str(current['next']))
    if not note.strip() or not images:
        raise ValueError('Provide a concrete observation and rendered/reference PNG evidence')
    source = inspect_file(source, 'source', stage)
    images = [inspect_file(p, 'image', stage) for p in images]
    if any(root == p or root in p.parents for p in [source] + images):
        raise ValueError('Use working files outside the receipt directory')
    if stage in ('geometry', 'material', 'review'):
        for row in state['active']:
            if row['part'] and row['part'] != part and row['files'][0]['path'] == str(source):
                raise ValueError('Different local parts require distinct independent SVG sources')
        if stage == 'material' and state['active'][-1]['files'][0]['path'] == str(source):
            raise ValueError('Keep the reviewed geometry source; write material to a separate SVG')
        if stage == 'review' and state['active'][-1]['files'][0]['path'] != str(source):
            raise ValueError('Review the current material source, not another revision')
        viewbox = ET.parse(source).getroot().get('viewBox').split()
        prior = next((r for r in state['active'] if r['stage'] == 'geometry'), None)
        if prior and ET.parse(prior['files'][0]['path']).getroot().get('viewBox').split() != viewbox:
            raise ValueError('Independent parts must preserve the common viewBox/coordinates')
    if stage == 'assembly' and any(str(source) == r['files'][0]['path']
                                   for r in state['active']):
        raise ValueError('Assembly needs its own current whole-object source')
    if stage == 'whole' and state['active'][-1]['files'][0]['path'] != str(source):
        raise ValueError('Whole review must use the current assembly source')
    row = {'event': len(state['history']) + 1, 'stage': stage, 'part': part,
           'observation': note.strip(), 'files': []}
    for role, path in [('source', source)] + [('image', p) for p in images]:
        sha = digest(path)
        rel = 'objects/' + sha + path.suffix.lower()
        dest = root / rel
        dest.parent.mkdir(exist_ok=True)
        if not dest.exists():
            shutil.copyfile(path, dest)
        row['files'].append({'role': role, 'path': str(path), 'sha256': sha, 'snapshot': rel})
    state['active'].append(row)
    state['history'].append({'action': 'record', **row})
    save(root, state)
    return status(root, state)


def rewind(root, stage, part, reason):
    state = load(root)
    index = sequence(state['parts']).index((stage, part))
    if not reason.strip() or index >= len(state['active']):
        raise ValueError('Rewind an existing receipt with a concrete rework reason')
    state['history'].append({'event': len(state['history']) + 1, 'action': 'rewind',
                             'stage': stage, 'part': part, 'reason': reason,
                             'invalidated_events': [r['event'] for r in state['active'][index:]]})
    state['active'] = state['active'][:index]
    save(root, state)
    return status(root, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('init', 'record', 'next', 'check', 'rewind'):
        cmd = commands.add_parser(name)
        cmd.add_argument('journal', type=Path)
        if name == 'init':
            cmd.add_argument('--parts', nargs='+', required=True)
        if name in ('record', 'rewind'):
            cmd.add_argument('--stage', required=True,
                             choices=['plan', 'geometry', 'material', 'review', 'assembly', 'whole'])
            cmd.add_argument('--part')
        if name == 'record':
            cmd.add_argument('--source', type=Path, required=True)
            cmd.add_argument('--image', type=Path, action='append', required=True)
            cmd.add_argument('--note', required=True)
        if name == 'rewind':
            cmd.add_argument('--reason', required=True)
    args = parser.parse_args()
    root = args.journal.resolve()
    try:
        if args.command == 'init':
            result = init(root, args.parts)
        elif args.command == 'record':
            result = record(root, args.stage, args.part, args.source, args.image, args.note)
        elif args.command == 'rewind':
            result = rewind(root, args.stage, args.part, args.reason)
        else:
            result = status(root, load(root))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.command == 'check' and result['status'] != 'receipts_complete' else 0
    except (ValueError, OSError, KeyError, ET.ParseError) as error:
        print(json.dumps({'status': 'blocked', 'reason': str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
