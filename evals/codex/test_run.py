import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

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

    def test_runtime_policy_rejection_and_mcp_cannot_pass_on_turn_completed(self):
        self.assertEqual(experiment.runtime_status('completed_needs_review', 'exec_command rejected: blocked by policy', False), 'environment_blocked')
        self.assertEqual(experiment.runtime_status('completed_needs_review', '', True), 'invalid_contamination')
        self.assertEqual(experiment.runtime_status('budget_exhausted', '', False), 'budget_exhausted')

    def test_target_and_system_payload_mutations_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / 'workspace/.agents/skills/target'
            system = root / 'state/skills/.system/skill-creator'
            target.mkdir(parents=True)
            system.mkdir(parents=True)
            (target / 'SKILL.md').write_text('original', encoding='utf8')
            (target / 'reference.md').write_text('reference', encoding='utf8')
            (system / 'SKILL.md').write_text('system', encoding='utf8')
            skills = [{'name': 'skill-creator', 'scope': 'system', 'path': str(system / 'SKILL.md')}]
            preparation = {'arm': 'B', 'target': 'target', 'system_sha256': {'skill-creator': experiment.hashes(system)}}
            with patch.object(experiment, 'expected_payload', return_value=experiment.hashes(target)):
                experiment.check_payloads(root, preparation, skills)
                for path in [target / 'reference.md', target / 'SKILL.md', system / 'SKILL.md']:
                    original = path.read_bytes()
                    path.write_text('mutated', encoding='utf8')
                    with self.assertRaises(ValueError):
                        experiment.check_payloads(root, preparation, skills)
                    path.write_bytes(original)
            preparation['arm'] = 'A'
            with self.assertRaises(ValueError):
                experiment.check_payloads(root, preparation, skills)

    def test_temporary_auth_is_removed_when_chmod_or_body_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, destination = root / 'fake-source', root / 'fake-destination'
            source.write_text('FAKE TEST CREDENTIAL', encoding='utf8')
            with patch.object(Path, 'chmod', side_effect=PermissionError('synthetic')):
                with self.assertRaises(PermissionError):
                    with experiment.temporary_auth(source, destination):
                        self.fail('body must not run')
            self.assertFalse(destination.exists())
            with self.assertRaises(RuntimeError):
                with experiment.temporary_auth(source, destination):
                    raise RuntimeError('synthetic process cleanup error')
            self.assertFalse(destination.exists())
            self.assertTrue(source.exists())
            destination.write_text('existing', encoding='utf8')
            with self.assertRaises(ValueError):
                with experiment.temporary_auth(source, destination):
                    self.fail('existing credentials must not be replaced')
            self.assertEqual(destination.read_text(encoding='utf8'), 'existing')

    def test_posix_cleanup_attempts_group_even_after_parent_exit(self):
        from unittest.mock import Mock
        process = Mock(pid=12345)
        process.poll.return_value = 0
        with patch.object(experiment.os, 'name', 'posix'), patch.object(experiment.os, 'killpg', create=True) as kill, patch.object(experiment.signal, 'SIGKILL', 9, create=True):
            experiment.stop(process)
            kill.assert_called_once_with(12345, experiment.signal.SIGKILL)

    def test_full_access_requires_external_boundary(self):
        with self.assertRaises(ValueError):
            experiment.check_boundary('native-pilot', None, 'danger-full-access')
        with self.assertRaises(ValueError):
            experiment.check_boundary('disposable-vm', None, 'workspace-write')
        self.assertFalse(experiment.check_boundary('native-pilot', None, 'workspace-write')['study_eligible_boundary'])
        self.assertTrue(experiment.check_boundary('disposable-vm', 'fresh-vm-001', 'workspace-write')['study_eligible_boundary'])


if __name__ == '__main__':
    unittest.main()
