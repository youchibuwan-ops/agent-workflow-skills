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


def steps(state):
    if state['version'] == 1:
        return sequence(state['parts'])
    result = [('plan', None)]
    for obj in state['objects']:
        result.append(('basis', obj['id']))
        result.extend((stage, part) for part in obj['parts']
                      for stage in ('geometry', 'material', 'review'))
        result.extend([('assembly', obj['id']), ('whole', obj['id'])])
    return result + [('compose', None), ('final', None)]


def coverage(state, stage, part):
    if stage in ('plan', 'compose', 'final'):
        return [obj['id'] for obj in state['objects']]
    if stage in ('basis', 'assembly', 'whole'):
        return next(obj['parts'] for obj in state['objects'] if obj['id'] == part)
    return [part]


def save(root, state):
    temp = root / 'state.tmp'
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    os.replace(temp, root / 'state.json')


def load(root):
    state = json.loads((root / 'state.json').read_text(encoding='utf8'))
    if state.get('version') not in (1, 2):
        raise ValueError('Unsupported journal version')
    if state['version'] == 2:
        frozen = json.loads((root / state['manifest']['snapshot']).read_text(encoding='utf8'))
        if state['objects'] != frozen.get('objects'):
            raise ValueError('State hierarchy differs from the frozen manifest')
        actual = [(row['stage'], row['part']) for row in state['active']]
        if actual != steps(state)[:len(actual)]:
            raise ValueError('Active receipts are not an ordered prefix of the hierarchy')
    return state


def stale(root, state):
    if state['version'] == 2:
        manifest = state['manifest']
        for path in (Path(manifest['path']), root / manifest['snapshot']):
            if not path.is_file() or digest(path) != manifest['sha256']:
                return 0, 'Hierarchy manifest missing/changed; preserve this run and start a linked revision'
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
    ordered = steps(state)
    dirty = stale(root, state)
    index = dirty[0] if dirty else len(state['active'])
    done = index == len(ordered)
    result = {'status': 'stale' if dirty else ('receipts_complete' if done else 'incomplete'),
            'next': None if done else dict(zip(('stage', 'part'), ordered[index])),
            'reason': dirty[1] if dirty else None,
            'completed': len(state['active']), 'total': len(ordered),
            'evidence_profile': 'hierarchy-v2' if state['version'] == 2 else 'legacy-v1',
            'visual_quality': 'not_assessed', 'actual_viewing': 'requires_tool_trace_audit'}
    if state['version'] == 2 and not done:
        stage, part = ordered[index]
        result['required_coverage'] = coverage(state, stage, part)
        result['required_views'] = ['reference', 'overview', 'detail', 'native']
        result['required_comparisons'] = ['proportions', 'details']
    return result


def init(root, parts):
    if not parts or len(set(parts)) != len(parts) or any(
            not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', p) for p in parts):
        raise ValueError('Use unique lowercase part IDs, e.g. base lever')
    root.mkdir(parents=True, exist_ok=False)
    state = {'version': 1, 'parts': parts, 'active': [], 'history': []}
    save(root, state)
    return status(root, state)


def init_hierarchy(root, manifest):
    manifest = manifest.resolve(strict=True)
    if root == manifest or root in manifest.parents:
        raise ValueError('Keep the hierarchy manifest outside the receipt directory')
    data = json.loads(manifest.read_text(encoding='utf8'))
    if not isinstance(data, dict):
        raise ValueError('Manifest must be a JSON object')
    objects = data.get('objects')
    if not isinstance(objects, list) or not objects:
        raise ValueError('Manifest needs a nonempty objects list')
    identifiers = []
    for obj in objects:
        if not isinstance(obj, dict) or not isinstance(obj.get('parts'), list) or not obj['parts']:
            raise ValueError('Each object needs an id and a nonempty parts list')
        identifiers.extend([obj.get('id'), *obj['parts']])
    if any(not isinstance(item, str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', item)
           for item in identifiers) or len(set(identifiers)) != len(identifiers):
        raise ValueError('Object and local IDs must be distinct globally unique lowercase identifiers')
    root.mkdir(parents=True, exist_ok=False)
    (root / 'objects').mkdir()
    sha = digest(manifest)
    snapshot = 'objects/' + sha + '.json'
    shutil.copyfile(manifest, root / snapshot)
    state = {'version': 2, 'objects': objects, 'active': [], 'history': [],
             'manifest': {'path': str(manifest), 'sha256': sha, 'snapshot': snapshot}}
    save(root, state)
    return status(root, state)


def inspection_files(root, state, stage, part, source, report):
    """Check evidence shape, never infer visual correctness from declarations."""
    if report is None:
        raise ValueError('Hierarchy v2 requires --inspection at every stage')
    report = report.resolve(strict=True)
    if root == report or root in report.parents:
        raise ValueError('Keep inspection reports outside the receipt directory')
    data = json.loads(report.read_text(encoding='utf8'))
    if not isinstance(data, dict):
        raise ValueError('Inspection must be a JSON object')
    if data.get('stage') != stage or data.get('item') != part:
        raise ValueError('Inspection stage/item does not match the current gate')
    if data.get('source_sha256') != digest(source):
        raise ValueError('Inspection must identify the current source SHA256')
    if not isinstance(data.get('alignment'), str) or not data['alignment'].strip():
        raise ValueError('Explain reference alignment, scale and applicable view')
    if data.get('unresolved') != []:
        raise ValueError('Unresolved findings block advancement; preserve report and rework')
    expected = coverage(state, stage, part)
    covered = data.get('coverage')
    if not isinstance(covered, list) or sorted(covered) != sorted(expected):
        raise ValueError('Inspection coverage must exactly match: ' + ', '.join(expected))
    views = data.get('views')
    required = ('reference', 'overview', 'detail', 'native')
    if not isinstance(views, dict) or any(not isinstance(views.get(key), str) for key in required):
        raise ValueError('Supply reference, overview, detail and native PNG paths')
    images = [inspect_file(report.parent / views[key], 'image', stage) for key in required]
    if len({digest(path) for path in images}) != len(required):
        raise ValueError('A repeated image cannot stand in for distinct required views')
    for category in ('proportions', 'details'):
        rows = data.get(category)
        if not isinstance(rows, list) or not rows:
            raise ValueError('Record concrete ' + category + ' comparisons')
        found = set()
        for row in rows:
            if not isinstance(row, dict) or row.get('target') not in expected:
                raise ValueError('Comparison target must belong to this gate')
            if any(not isinstance(row.get(key), str) or not row[key].strip()
                   for key in ('reference', 'current', 'finding')):
                raise ValueError('Each comparison needs reference/current observations and a finding')
            if row.get('status') != 'pass':
                raise ValueError('Failed or unreviewed comparisons block advancement')
            found.add(row['target'])
        if found != set(expected):
            raise ValueError('Every covered item needs both proportion and detail comparisons')
    return images, report


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
    elif stage in ('basis', 'geometry', 'material', 'review'):
        tree = ET.fromstring(data)
        if tree.tag.split('}')[-1] != 'svg' or not tree.get('viewBox'):
            raise ValueError('Local source must be an SVG with a shared viewBox')
        if not any(e.tag.split('}')[-1] in {'path', 'rect', 'circle', 'ellipse',
                                          'line', 'polyline', 'polygon', 'text', 'use'}
                   for e in tree.iter()):
            raise ValueError('Local SVG has no drawable geometry')
    return path


def record(root, stage, part, source, images, note, inspection=None):
    state = load(root)
    current = status(root, state)
    if current['status'] == 'stale':
        raise ValueError('Rewind before continuing: ' + str(current))
    if current['next'] != {'stage': stage, 'part': part}:
        raise ValueError('Wrong step. Next actual action: ' + str(current['next']))
    source = inspect_file(source, 'source', stage)
    report = None
    if state['version'] == 2:
        images, report = inspection_files(root, state, stage, part, source, inspection)
    if not note.strip() or not images:
        raise ValueError('Provide a concrete observation and rendered/reference PNG evidence')
    images = [inspect_file(p, 'image', stage) for p in images]
    if any(root == p or root in p.parents for p in [source] + images):
        raise ValueError('Use working files outside the receipt directory')
    if stage in ('basis', 'geometry', 'material', 'review'):
        for row in state['active']:
            if row['part'] and row['part'] != part and row['files'][0]['path'] == str(source):
                raise ValueError('Different local parts require distinct independent SVG sources')
        if stage == 'material' and state['active'][-1]['files'][0]['path'] == str(source):
            raise ValueError('Keep the reviewed geometry source; write material to a separate SVG')
        if stage == 'review' and state['active'][-1]['files'][0]['path'] != str(source):
            raise ValueError('Review the current material source, not another revision')
        viewbox = ET.parse(source).getroot().get('viewBox').split()
        prior = next((r for r in state['active'] if r['stage'] in ('basis', 'geometry')), None)
        if prior and ET.parse(prior['files'][0]['path']).getroot().get('viewBox').split() != viewbox:
            raise ValueError('Independent parts must preserve the common viewBox/coordinates')
    if stage == 'assembly' and any(str(source) == r['files'][0]['path']
                                   for r in state['active']):
        raise ValueError('Assembly needs its own current whole-object source')
    if stage == 'compose' and any(str(source) == r['files'][0]['path']
                                  for r in state['active']):
        raise ValueError('Compose needs its own current scene source')
    if stage == 'whole' and state['active'][-1]['files'][0]['path'] != str(source):
        raise ValueError('Whole review must use the current assembly source')
    if stage == 'final' and state['active'][-1]['files'][0]['path'] != str(source):
        raise ValueError('Final scene review must use the current compose source')
    row = {'event': len(state['history']) + 1, 'stage': stage, 'part': part,
           'observation': note.strip(), 'files': []}
    files = [('source', source)] + [('image', p) for p in images]
    if report is not None:
        files.append(('inspection', report))
    for role, path in files:
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
    index = steps(state).index((stage, part))
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
            mode = cmd.add_mutually_exclusive_group(required=True)
            mode.add_argument('--manifest', type=Path, help='New hierarchical v2 run')
            mode.add_argument('--parts', nargs='+', help='Legacy v1 only; not current acceptance')
        if name in ('record', 'rewind'):
            cmd.add_argument('--stage', required=True,
                             choices=['plan', 'basis', 'geometry', 'material', 'review',
                                      'assembly', 'whole', 'compose', 'final'])
            cmd.add_argument('--part', '--item', dest='part')
        if name == 'record':
            cmd.add_argument('--source', type=Path, required=True)
            cmd.add_argument('--image', type=Path, action='append', default=[])
            cmd.add_argument('--inspection', type=Path)
            cmd.add_argument('--note', required=True)
        if name == 'rewind':
            cmd.add_argument('--reason', required=True)
        if name == 'check':
            cmd.add_argument('--require-profile', choices=['legacy-v1', 'hierarchy-v2'])
    args = parser.parse_args()
    root = args.journal.resolve()
    try:
        if args.command == 'init':
            result = init_hierarchy(root, args.manifest) if args.manifest else init(root, args.parts)
        elif args.command == 'record':
            result = record(root, args.stage, args.part, args.source, args.image, args.note, args.inspection)
        elif args.command == 'rewind':
            result = rewind(root, args.stage, args.part, args.reason)
        else:
            result = status(root, load(root))
            if args.command == 'check' and args.require_profile and result['evidence_profile'] != args.require_profile:
                raise ValueError('Journal profile does not meet required ' + args.require_profile)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.command == 'check' and result['status'] != 'receipts_complete' else 0
    except (ValueError, OSError, KeyError, TypeError, ET.ParseError) as error:
        print(json.dumps({'status': 'blocked', 'reason': str(error)}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    sys.exit(main())
