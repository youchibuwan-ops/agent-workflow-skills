import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('experiment', Path(__file__).with_name('run.py'))
experiment = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(experiment)


class IsolationTests(unittest.TestCase):
    def test_refuse_existing_output_and_repository_descendant(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                experiment.fresh_root(Path(temporary))
        with self.assertRaises(ValueError):
            experiment.fresh_root(Path(__file__).parent / 'actor-output')

    def test_environment_does_not_inherit_credentials_or_codex_settings(self):
        with tempfile.TemporaryDirectory() as temporary:
            env = experiment.isolated_env(Path(temporary), {'PATH': '/bin', 'OPENAI_API_KEY': 'fake', 'CODEX_HOME': 'wrong', 'CODEX_CONFIG': 'wrong'})
            self.assertNotIn('OPENAI_API_KEY', env)
            self.assertNotIn('CODEX_CONFIG', env)
            self.assertNotEqual(env['CODEX_HOME'], 'wrong')
            self.assertEqual(env['HOME'], env['USERPROFILE'])

    def test_catalog_rejects_global_skill_and_target_in_control_arm(self):
        system = {'name': 'skill-creator', 'scope': 'system', 'enabled': True}
        target = {'name': 'proactive-skill-discovery', 'scope': 'repo', 'enabled': True}
        experiment.check_catalog([system], 'A', target['name'])
        experiment.check_catalog([system, target], 'B', target['name'])
        for skills, arm in [([system, target], 'A'), ([system], 'B'), ([system, {'name': 'private', 'scope': 'user', 'enabled': True}], 'A')]:
            with self.assertRaises(ValueError):
                experiment.check_catalog(skills, arm, target['name'])

    def test_no_name_or_explicit_skill_hint_in_implicit_prompts(self):
        for task in ['discovery', 'svg', 'control']:
            text = (Path(__file__).parent / 'tasks' / task / 'prompt.txt').read_text(encoding='utf8')
            self.assertNotIn('$', text)
            self.assertNotIn('proactive-skill-discovery', text)
            self.assertNotIn('crafting-reference-based-svg-assets', text)
            self.assertNotIn('search for skills', text.lower())

    def test_failed_tool_or_a_filename_mention_does_not_prove_loading(self):
        self.assertFalse(experiment.successful_read({'type': 'command_execution', 'command': 'rg --files', 'exit_code': 0, 'aggregated_output': 'SKILL.md'}, 'proactive-skill-discovery'))
        self.assertFalse(experiment.successful_read({'type': 'command_execution', 'command': 'cat proactive-skill-discovery/SKILL.md', 'exit_code': 1}, 'proactive-skill-discovery'))
        self.assertTrue(experiment.successful_read({'type': 'command_execution', 'command': 'cat proactive-skill-discovery/SKILL.md', 'exit_code': 0}, 'proactive-skill-discovery'))

    def test_fixture_change_is_rejected_before_model_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'workspace').mkdir()
            (root / 'workspace/input.txt').write_text('original', encoding='utf8')
            preparation = {'input_sha256': experiment.hashes(root / 'workspace'), 'package_sha256': experiment.package_hashes()}
            experiment.check_frozen(root, preparation)
            (root / 'workspace/input.txt').write_text('contaminated', encoding='utf8')
            with self.assertRaises(ValueError):
                experiment.check_frozen(root, preparation)


if __name__ == '__main__':
    unittest.main()
