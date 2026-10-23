"""Adversarial mechanical checks; not a visual-quality or agent-behavior score."""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'skills/crafting-reference-based-svg-assets/scripts/workflow.py'
spec = importlib.util.spec_from_file_location('svg_workflow', SCRIPT)
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=')


class Receipts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.journal = self.root / 'workflow'
        self.image = self.root / 'render.png'
        self.image.write_bytes(PNG)
        self.plan = self.root / 'plan.md'
        self.plan.write_text('Two identified parts with common coordinates.', encoding='utf8')
        flow.init(self.journal, ['base', 'lever'])

    def tearDown(self):
        self.tmp.cleanup()

    def source(self, name, viewbox='0 0 100 100'):
        path = self.root / (name + '.svg')
        path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><path d="M0 0L10 10"/></svg>', encoding='utf8')
        return path

    def record(self, stage, part=None, source=None):
        return flow.record(self.journal, stage, part, source or self.plan,
                           [self.image], 'Concrete observation for a mechanical fixture only')

    def part(self, name):
        self.record('geometry', name, self.source(name + '-geometry'))
        material = self.source(name + '-material')
        self.record('material', name, material)
        self.record('review', name, material)
        return material

    def complete(self):
        self.record('plan')
        self.part('base')
        self.part('lever')
        whole = self.source('whole')
        self.record('assembly', source=whole)
        self.record('whole', source=whole)

    def test_original_shortcut_cannot_assemble_without_parts(self):
        self.record('plan')
        with self.assertRaisesRegex(ValueError, 'Wrong step'):
            self.record('assembly', source=self.source('whole'))
        self.assertEqual(len(flow.load(self.journal)['active']), 1)

    def test_second_part_cannot_precede_first_review(self):
        self.record('plan')
        with self.assertRaisesRegex(ValueError, 'Wrong step'):
            self.record('geometry', 'lever', self.source('lever-geometry'))

    def test_geometry_must_survive_material_work(self):
        self.record('plan')
        path = self.source('base')
        self.record('geometry', 'base', path)
        with self.assertRaisesRegex(ValueError, 'separate SVG'):
            self.record('material', 'base', path)

    def test_changed_current_source_invalidates_old_review(self):
        self.complete()
        path = self.root / 'base-material.svg'
        path.write_text(path.read_text() + '\n', encoding='utf8')
        result = flow.status(self.journal, flow.load(self.journal))
        self.assertEqual(result['status'], 'stale')
        self.assertEqual(result['next'], {'stage': 'material', 'part': 'base'})
        check = subprocess.run([sys.executable, str(SCRIPT), 'check', str(self.journal)], capture_output=True)
        self.assertEqual(check.returncode, 2)

    def test_rewind_preserves_failures_and_requires_reassembly(self):
        self.complete()
        previous = flow.load(self.journal)
        result = flow.rewind(self.journal, 'geometry', 'lever', 'Lever connection failed')
        current = flow.load(self.journal)
        self.assertEqual(result['next'], {'stage': 'geometry', 'part': 'lever'})
        self.assertEqual(len(current['history']), len(previous['history']) + 1)
        self.assertTrue(current['history'][-1]['invalidated_events'])
        for row in previous['active']:
            for item in row['files']:
                self.assertTrue((self.journal / item['snapshot']).is_file())

    def test_shared_whole_source_is_not_two_independent_parts(self):
        self.record('plan')
        material = self.part('base')
        with self.assertRaisesRegex(ValueError, 'distinct independent'):
            self.record('geometry', 'lever', material)

    def test_mismatched_local_coordinate_system_is_rejected(self):
        self.record('plan')
        self.part('base')
        with self.assertRaisesRegex(ValueError, 'common viewBox'):
            self.record('geometry', 'lever', self.source('lever', '0 0 10 10'))

    def test_missing_evidence_does_not_advance(self):
        with self.assertRaises(OSError):
            flow.record(self.journal, 'plan', None, self.plan, [self.root / 'missing.png'], 'Observed')
        self.assertEqual(flow.load(self.journal)['active'], [])

    def test_text_disguised_as_image_is_rejected(self):
        self.image.write_text('render succeeded', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'rendered PNG'):
            self.record('plan')

    def test_changed_snapshot_is_not_accepted(self):
        self.record('plan')
        state = flow.load(self.journal)
        (self.journal / state['active'][0]['files'][0]['snapshot']).write_text('changed')
        self.assertEqual(flow.status(self.journal, state)['status'], 'stale')

    def test_review_cannot_switch_to_different_source(self):
        self.record('plan')
        self.record('geometry', 'base', self.source('g'))
        self.record('material', 'base', self.source('m'))
        with self.assertRaisesRegex(ValueError, 'current material source'):
            self.record('review', 'base', self.source('other'))

    def test_complete_receipts_explicitly_do_not_award_visual_pass(self):
        self.complete()
        check = subprocess.run([sys.executable, str(SCRIPT), 'check', str(self.journal)], capture_output=True, text=True)
        self.assertEqual(check.returncode, 0)
        result = json.loads(check.stdout)
        self.assertEqual(result['visual_quality'], 'not_assessed')
        self.assertEqual(result['actual_viewing'], 'requires_tool_trace_audit')


if __name__ == '__main__':
    unittest.main()
