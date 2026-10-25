import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('discovery_gate_runner', Path(__file__).with_name('run.py'))
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class ArtifactEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='discovery-gate-oracle-')
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.source = b'{"generation":"original","values":[17,23]}\n'
        (self.work / 'input.json').write_bytes(self.source)
        self.frozen = {'input.json': hashlib.sha256(self.source).hexdigest()}

    def output(self, value):
        (self.work / 'output.json').write_text(json.dumps(value), encoding='utf8')

    def test_correct_output_is_checked_against_original_bytes(self):
        self.output({'generation': 'original', 'total': 40, 'input_sha256': hashlib.sha256(self.source).hexdigest()})
        result = RUNNER.assess_files(self.work, self.frozen, self.source)
        self.assertTrue(result['artifact_semantics'])
        self.assertTrue(result['protected_inputs_intact'])

    def test_modified_input_and_matching_output_cannot_change_the_oracle(self):
        changed = b'{"generation":"tampered","values":[0]}\n'
        (self.work / 'input.json').write_bytes(changed)
        self.output({'generation': 'tampered', 'total': 0, 'input_sha256': hashlib.sha256(changed).hexdigest()})
        result = RUNNER.assess_files(self.work, self.frozen, self.source)
        self.assertFalse(result['artifact_semantics'])
        self.assertFalse(result['protected_inputs_intact'])
        self.assertIn('input.json', result['changed_inputs'])

    def test_non_object_json_and_malformed_outputs_are_explicit_failures(self):
        for value in [[], None, 'text', 40, {'generation': 'original'}]:
            with self.subTest(value=value):
                self.output(value)
                result = RUNNER.assess_files(self.work, self.frozen, self.source)
                self.assertFalse(result['artifact_semantics'])

    def test_missing_artifact_is_unfinished_not_a_pass(self):
        result = RUNNER.assess_files(self.work, self.frozen, self.source)
        self.assertFalse(result['artifact_exists'])
        self.assertIsNone(result['artifact_semantics'])


if __name__ == '__main__':
    unittest.main()
