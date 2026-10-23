"""Unrun v2 regressions; synthetic evidence checks, never a visual quality test."""
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/crafting-reference-based-svg-assets/scripts/workflow.py'
spec = importlib.util.spec_from_file_location('svg_hierarchy', SCRIPT)
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)


def png(color):
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\0' + bytes(color) * 2) * 2)) + chunk(b'IEND', b''))


class Hierarchy(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.journal = self.root / 'journal'
        self.manifest = self.root / 'hierarchy.json'
        self.manifest.write_text(json.dumps({'objects': [
            {'id': 'sign', 'parts': ['sign-base', 'sign-face']},
            {'id': 'stand', 'parts': ['stand-leg']}]}), encoding='utf8')
        flow.init_hierarchy(self.journal, self.manifest)
        self.views = {}
        for index, key in enumerate(('reference', 'overview', 'detail', 'native')):
            path = self.root / (key + '.png')
            path.write_bytes(png((index * 60, 20, 30)))
            self.views[key] = path.name
        self.serial = 0

    def source(self, name):
        path = self.root / (name + '.svg')
        path.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
                        '<path d="M0 0L10 10"/></svg>', encoding='utf8')
        return path

    def report(self, stage, item, source):
        self.serial += 1
        targets = flow.coverage(flow.load(self.journal), stage, item)
        rows = [{'target': target, 'reference': 'Synthetic fixture reference',
                 'current': 'Synthetic fixture current', 'finding': 'Mechanical fixture only',
                 'status': 'pass'} for target in targets]
        data = {'stage': stage, 'item': item, 'source_sha256': flow.digest(source),
                'alignment': 'Synthetic fixture; no real visual judgment', 'unresolved': [],
                'coverage': targets, 'views': dict(self.views), 'proportions': rows, 'details': rows}
        path = self.root / f'inspection-{self.serial}.json'
        path.write_text(json.dumps(data), encoding='utf8')
        return path, data

    def record(self, stage, item=None, source=None):
        source = source or self.source(f'source-{stage}-{item}')
        report, _ = self.report(stage, item, source)
        return flow.record(self.journal, stage, item, source, [], 'Synthetic evidence only', report)

    def test_whole_object_id_cannot_also_be_local_id(self):
        self.manifest.write_text('{"objects":[{"id":"sign","parts":["sign"]}]}', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'distinct'):
            flow.init_hierarchy(self.root / 'invalid', self.manifest)

    def test_local_cannot_skip_object_basis(self):
        self.record('plan')
        with self.assertRaisesRegex(ValueError, 'Wrong step'):
            self.record('geometry', 'sign-base')
        self.assertEqual(flow.status(self.journal, flow.load(self.journal))['next'],
                         {'stage': 'basis', 'part': 'sign'})

    def test_every_stage_requires_inspection(self):
        with self.assertRaisesRegex(ValueError, 'requires --inspection'):
            flow.record(self.journal, 'plan', None, self.source('plan'), [], 'A claim alone')

    def test_thumbnail_missing_proportions_and_open_defects_block(self):
        source = self.source('plan')
        changes = [lambda d: d['views'].pop('detail'),
                   lambda d: d['views'].update(detail=d['views']['overview']),
                   lambda d: d.update(proportions=[]),
                   lambda d: d.update(unresolved=['Wrong relative height']),
                   lambda d: d['details'].pop(),
                   lambda d: d.update(source_sha256='0' * 64)]
        for change in changes:
            report, data = self.report('plan', None, source)
            change(data)
            report.write_text(json.dumps(data), encoding='utf8')
            with self.assertRaises(ValueError):
                flow.record(self.journal, 'plan', None, source, [], 'Fixture', report)
            self.assertEqual(flow.load(self.journal)['active'], [])

    def test_next_object_and_scene_cannot_skip_first_object(self):
        self.record('plan')
        self.record('basis', 'sign')
        for stage, item in [('basis', 'stand'), ('compose', None)]:
            with self.assertRaisesRegex(ValueError, 'Wrong step'):
                self.record(stage, item)

    def test_edited_report_invalidates_receipt(self):
        self.record('plan')
        row = flow.load(self.journal)['active'][0]
        report = Path(next(file['path'] for file in row['files'] if file['role'] == 'inspection'))
        report.write_text(report.read_text(encoding='utf8') + '\n', encoding='utf8')
        self.assertEqual(flow.status(self.journal, flow.load(self.journal))['status'], 'stale')

    def test_hierarchy_change_invalidates_run(self):
        self.record('plan')
        self.manifest.write_text(self.manifest.read_text(encoding='utf8') + '\n', encoding='utf8')
        self.assertEqual(flow.status(self.journal, flow.load(self.journal))['status'], 'stale')

    def test_complete_receipts_do_not_assert_visual_quality(self):
        current_source = None
        for stage, item in flow.steps(flow.load(self.journal)):
            if stage not in ('review', 'whole', 'final'):
                current_source = self.source(f'{stage}-{item}')
            self.record(stage, item, current_source)
        result = flow.status(self.journal, flow.load(self.journal))
        self.assertEqual(result['status'], 'receipts_complete')
        self.assertEqual(result['visual_quality'], 'not_assessed')
        self.assertEqual(result['evidence_profile'], 'hierarchy-v2')


if __name__ == '__main__':
    unittest.main()
