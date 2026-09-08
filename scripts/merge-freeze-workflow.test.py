import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/merge-freeze.yml'
SLACK_OWNER = 'T0163M87MB9:U0123456789'
SLACK_OTHER = 'T0163M87MB9:U9876543210'


def script_for(marker):
    section = WORKFLOW.read_text().split(marker, 1)[1].split('        run: |\n', 1)[1]
    lines = []
    for line in section.splitlines():
        if line and not line.startswith('          '):
            break
        lines.append(line[10:])
    return '\n'.join(lines) + '\n'


def fake_command(kind, args):
    path = Path(os.environ['MOCK_STATE'])
    state = json.loads(path.read_text())
    state['calls'].append([kind, *args])
    path.write_text(json.dumps(state))
    if kind == 'curl':
        state['announcements'].append(json.loads(args[args.index('--data') + 1]))
        path.write_text(json.dumps(state))
        return
    result = None
    if args[:2] == ['variable', 'set']:
        name = args[2]
        if state.get('fail_write') == name:
            sys.exit(1)
        if state.get('noop_write') != name:
            state['variables'][name] = args[args.index('--body') + 1]
    elif args[:2] == ['variable', 'delete']:
        state['variables'].pop(args[2], None)
    elif args[:2] == ['pr', 'list']:
        result = [
            {'number': 1, 'headRefOid': 'head-main', 'baseRefName': 'main'},
            {'number': 2, 'headRefOid': 'head-stack', 'baseRefName': 'parent'},
        ]
    elif args[0] == 'api':
        endpoint = next(a for a in args if a.startswith('repos/'))
        method = args[args.index('--method') + 1] if '--method' in args else 'GET'
        if endpoint.endswith('/actions/variables'):
            assert '--paginate' in args and '--slurp' in args
            state['variable_reads'] += 1
            if state.get('fail_read') in (True, state['variable_reads']):
                sys.exit(1)
            items = [{'name': k, 'value': v} for k, v in state['variables'].items()]
            result = [{'variables': []}, {'variables': items}]
            if 'variable_response' in state:
                result = state['variable_response']
        elif endpoint.endswith('/rulesets/7'):
            if method == 'PUT':
                if state.get('fail_put'):
                    sys.exit(1)
                state['ruleset'] = json.load(sys.stdin)
            result = state['ruleset']
        elif endpoint.endswith('/rulesets'):
            result = [{'id': 7, 'target': 'branch', 'source_type': 'Repository', 'enforcement': 'active'}]
        elif '/statuses/' in endpoint:
            assert method == 'POST'
            state['statuses'].append({args[i + 1].split('=', 1)[0]: args[i + 1].split('=', 1)[1]
                                      for i, value in enumerate(args) if value == '-f'})
        elif endpoint == 'repos/example/test':
            result = {'default_branch': 'main'}
        else:
            raise AssertionError(f'Unexpected API call: {args}')
    else:
        raise AssertionError(f'Unexpected command: {args}')
    path.write_text(json.dumps(state))
    if result is not None:
        payload = json.dumps(result)
        if '--jq' in args:
            checked = subprocess.run(['jq', '-r', args[args.index('--jq') + 1]], input=payload,
                                     text=True, capture_output=True, check=True)
            print(checked.stdout, end='')
        else:
            print(payload)


class MergeFreezeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='merge-freeze-mock-')
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        for command in ['jq', 'tr']:
            (self.bin / command).symlink_to(shutil.which(command))
        for command in ['gh', 'curl']:
            executable = self.bin / command
            executable.write_text(f'#!{sys.executable}\nimport runpy, sys\nsys.argv = [{str(Path(__file__).resolve())!r}, "--fake", {command!r}, *sys.argv[1:]]\nrunpy.run_path(sys.argv[0], run_name="__main__")\n')
            executable.chmod(0o755)
        self.state_path = self.directory / 'state.json'
        self.state = {
            'variables': {'MERGE_FREEZE_SLACK_DISPATCHER': 'cloudy[bot]'},
            'ruleset': {
                'name': 'main', 'target': 'branch', 'enforcement': 'active',
                'conditions': {'ref_name': {'include': ['~DEFAULT_BRANCH'], 'exclude': []}},
                'bypass_actors': [{'actor_id': 4, 'actor_type': 'Integration', 'bypass_mode': 'always'}],
                'rules': [{'type': 'deletion'}, {'type': 'required_status_checks', 'parameters': {
                    'strict_required_status_checks_policy': True,
                    'do_not_enforce_on_create': True,
                    'required_status_checks': [{'context': 'ci', 'integration_id': 3}],
                }}],
            },
            'calls': [], 'statuses': [], 'announcements': [], 'variable_reads': 0,
        }

    def frozen(self, owner=SLACK_OWNER):
        if owner is not None:
            self.state['variables']['MERGE_FREEZE_ACTOR'] = owner
        self.state['ruleset']['rules'][1]['parameters']['required_status_checks'].append({'context': 'merge-freeze'})

    def run_toggle(self, action='freeze', actor='cloudy[bot]', slack=SLACK_OWNER, success=True):
        return self.run_script(script_for('        id: toggle'), {
            'ACTION': action, 'ACTOR_LOGIN': actor, 'SLACK_ACTOR': slack,
            'FREEZE_ACTOR': actor,
        }, success)

    def run_script(self, script, extra, success=True):
        self.state_path.write_text(json.dumps(self.state))
        output = self.directory / 'output'
        summary = self.directory / 'summary'
        output.write_text('')
        summary.write_text('')
        env = {
            'PATH': str(self.bin), 'MOCK_STATE': str(self.state_path),
            'GH_TOKEN': 'fake-no-credentials', 'REPO': 'example/test',
            'CONTEXT': 'merge-freeze', 'RUN_URL': 'https://example.invalid/run',
            'GITHUB_OUTPUT': str(output), 'GITHUB_STEP_SUMMARY': str(summary), **extra,
        }
        result = subprocess.run(['/bin/bash', '-e', '-o', 'pipefail', '-c', script],
                                env=env, text=True, capture_output=True, timeout=15)
        self.state = json.loads(self.state_path.read_text())
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return output.read_text(), summary.read_text(), result.stdout + result.stderr

    def mutations(self):
        return [c for c in self.state['calls'] if c[1] in ('variable', 'curl') or '--method' in c]

    def test_trusted_freeze_persists_owner_before_enforcement(self):
        original = copy.deepcopy(self.state['ruleset'])
        output, summary, _ = self.run_toggle(actor='CLOUDY[BOT]')
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], SLACK_OWNER)
        self.assertIn('changed=true', output)
        self.assertIn(SLACK_OWNER, summary)
        calls = self.state['calls']
        write = next(i for i, c in enumerate(calls) if c[1:4] == ['variable', 'set', 'MERGE_FREEZE_ACTOR'])
        put = next(i for i, c in enumerate(calls) if 'PUT' in c)
        self.assertLess(write, put)
        self.assertTrue(any('/actions/variables' in ' '.join(c) for c in calls[write + 1:put]))
        expected = copy.deepcopy(original)
        expected['rules'][1]['parameters']['required_status_checks'].append({'context': 'merge-freeze'})
        self.assertEqual(self.state['ruleset'], expected)
        self.assertEqual(len(self.state['statuses']), 1)
        self.assertIn(SLACK_OWNER, self.state['statuses'][0]['description'])

    def test_repeated_freeze_keeps_original_slack_owner(self):
        self.frozen()
        output, summary, _ = self.run_toggle(slack=SLACK_OTHER)
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], SLACK_OWNER)
        self.assertIn('changed=false', output)
        self.assertIn(f'Only **{SLACK_OWNER}**', summary)
        self.assertIn(SLACK_OWNER, self.state['statuses'][0]['description'])
        self.assertFalse(any('PUT' in c for c in self.state['calls']))
        self.assertFalse(any(c[1:4] == ['variable', 'set', 'MERGE_FREEZE_ACTOR'] for c in self.state['calls']))

    def test_repeated_slack_freeze_keeps_github_owner(self):
        self.frozen('alice')
        self.run_toggle()
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], 'alice')
        self.assertIn('alice', self.state['statuses'][0]['description'])

    def test_spoofed_or_unconfigured_dispatcher_rejected(self):
        for actor, dispatcher in [('mallory', 'cloudy[bot]'), ('cloudy[bot]', '')]:
            with self.subTest(actor=actor, dispatcher=dispatcher):
                self.state['variables']['MERGE_FREEZE_SLACK_DISPATCHER'] = dispatcher
                self.run_toggle(actor=actor, success=False)
                self.assertEqual(self.mutations(), [])

    def test_dispatcher_without_identity_rejected(self):
        self.frozen('cloudy[bot]')
        self.run_toggle(action='unfreeze', slack='', success=False)
        self.assertEqual(self.mutations(), [])

    def test_invalid_slack_inputs_rejected_without_echo(self):
        for slack in ['U0123456789', 'TOTHER12345:U0123456789', 'T0163M87MB9:W0123456789',
                      'T0163M87MB9:Uabc123456', 'T0163M87MB9:U123', SLACK_OWNER + '\n',
                      ' ' + SLACK_OWNER, SLACK_OWNER + ':x', SLACK_OWNER + '; touch /tmp/nope',
                      'T0163M87MB9:U' + '1' * 32]:
            with self.subTest(slack=slack):
                _, _, log = self.run_toggle(slack=slack, success=False)
                self.assertNotIn(slack, log)
                self.assertEqual(self.mutations(), [])

    def test_other_slack_user_cannot_unfreeze(self):
        self.frozen()
        self.run_toggle(action='unfreeze', slack=SLACK_OTHER, success=False)
        self.assertEqual(self.mutations(), [])

    def test_github_user_cannot_unfreeze_slack_owner(self):
        self.frozen()
        self.run_toggle(action='unfreeze', actor='alice', slack='', success=False)
        self.assertEqual(self.mutations(), [])

    def test_slack_cannot_unfreeze_github_or_unknown_owner(self):
        for owner in ['alice', 'cloudy[bot]', None]:
            with self.subTest(owner=owner):
                self.state['variables'].pop('MERGE_FREEZE_ACTOR', None)
                self.state['ruleset']['rules'][1]['parameters']['required_status_checks'] = [{'context': 'ci'}]
                self.frozen(owner)
                self.run_toggle(action='unfreeze', success=False)
                self.assertEqual(self.mutations(), [])

    def test_owner_unfreezes_and_preserves_ruleset(self):
        original = copy.deepcopy(self.state['ruleset'])
        self.frozen()
        output, _, _ = self.run_toggle(action='unfreeze')
        self.assertEqual(self.state['ruleset'], original)
        self.assertNotIn('MERGE_FREEZE_ACTOR', self.state['variables'])
        self.assertEqual(self.state['variables']['MERGE_FREEZE'], 'false')
        self.assertIn('changed=true', output)

    def test_direct_github_freeze_and_case_insensitive_unfreeze(self):
        self.run_toggle(actor='Alice', slack='')
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], 'Alice')
        self.run_toggle(action='unfreeze', actor='ALICE', slack='')
        self.assertNotIn('MERGE_FREEZE_ACTOR', self.state['variables'])

    def test_direct_unknown_owner_escape_hatch(self):
        self.frozen(None)
        self.run_toggle(action='unfreeze', actor='alice', slack='')
        self.assertEqual(self.state['variables']['MERGE_FREEZE'], 'false')

    def test_direct_github_without_dispatcher_configuration(self):
        self.state['variables'].clear()
        self.run_toggle(actor='alice', slack='')
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], 'alice')

    def test_other_github_user_cannot_unfreeze(self):
        self.frozen('alice')
        self.run_toggle(action='unfreeze', actor='bob', slack='', success=False)
        self.assertEqual(self.mutations(), [])

    def test_repeat_unknown_freeze_does_not_claim_owner(self):
        self.frozen(None)
        _, summary, _ = self.run_toggle()
        self.assertNotIn('MERGE_FREEZE_ACTOR', self.state['variables'])
        self.assertIn('No owner is recorded', summary)
        self.assertIn('unknown owner', self.state['statuses'][0]['description'])

    def test_open_unfreeze_only_cleans_up(self):
        self.state['variables']['MERGE_FREEZE_ACTOR'] = SLACK_OTHER
        output, _, _ = self.run_toggle(action='unfreeze')
        self.assertIn('changed=false', output)
        self.assertNotIn('MERGE_FREEZE_ACTOR', self.state['variables'])
        self.assertFalse(any('PUT' in c for c in self.state['calls']))

    def test_new_status_rule_can_be_added_and_removed(self):
        self.state['ruleset']['rules'] = [{'type': 'deletion'}]
        original = copy.deepcopy(self.state['ruleset'])
        self.run_toggle()
        self.run_toggle(action='unfreeze')
        self.assertEqual(self.state['ruleset'], original)

    def test_live_owner_lookup_failure_never_mutates(self):
        self.frozen()
        self.state['fail_read'] = True
        self.run_toggle(action='unfreeze', actor='alice', slack='', success=False)
        self.assertEqual(self.mutations(), [])

    def test_failed_or_noop_owner_write_never_freezes(self):
        for mode in ['fail_write', 'noop_write']:
            with self.subTest(mode=mode):
                self.state[mode] = 'MERGE_FREEZE_ACTOR'
                self.run_toggle(success=False)
                self.assertFalse(any('PUT' in c for c in self.state['calls']))
                self.state.pop(mode)

    def test_failed_owner_readback_never_freezes(self):
        self.state['fail_read'] = 2
        self.run_toggle(success=False)
        self.assertFalse(any('PUT' in c for c in self.state['calls']))

    def test_invalid_variable_response_never_mutates(self):
        for response in [None, {}, [], [{}], [{'variables': [{'name': 'MERGE_FREEZE_ACTOR', 'value': None}]}]]:
            with self.subTest(response=response):
                self.state['variable_response'] = response
                self.run_toggle(success=False)
                self.assertEqual(self.mutations(), [])

    def test_invalid_recorded_owner_never_mutates(self):
        self.frozen(SLACK_OWNER + '\n')
        self.run_toggle(action='unfreeze', success=False)
        self.assertEqual(self.mutations(), [])

    def test_duplicate_owner_never_mutates(self):
        self.state['variable_response'] = [{'variables': [
            {'name': 'MERGE_FREEZE_ACTOR', 'value': SLACK_OWNER},
            {'name': 'MERGE_FREEZE_ACTOR', 'value': SLACK_OTHER},
        ]}]
        self.run_toggle(success=False)
        self.assertEqual(self.mutations(), [])

    def test_invalid_action_never_mutates(self):
        self.run_toggle(action='release', success=False)
        self.assertEqual(self.mutations(), [])

    def test_serialized_requests_use_live_owner(self):
        self.run_toggle()
        self.run_toggle(slack=SLACK_OTHER)
        self.run_toggle(action='unfreeze', slack=SLACK_OTHER, success=False)
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], SLACK_OWNER)
        self.run_toggle(action='unfreeze')
        self.run_toggle(slack=SLACK_OTHER)
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], SLACK_OTHER)

    def test_failed_ruleset_write_can_be_retried(self):
        self.state['fail_put'] = True
        self.run_toggle(success=False)
        self.state.pop('fail_put')
        self.run_toggle(slack=SLACK_OTHER)
        self.assertEqual(self.state['variables']['MERGE_FREEZE_ACTOR'], SLACK_OTHER)

    def test_announcement_mentions_authenticated_slack_user(self):
        self.run_script(script_for('      - name: Announce in #engineering'), {
            'ACTION': 'freeze', 'ACTOR_LOGIN': SLACK_OWNER,
            'WEBHOOK': 'https://example.invalid/webhook', 'WORKFLOW_URL': 'https://example.invalid/workflow',
        })
        self.assertIn('<@U0123456789>', self.state['announcements'][0]['text'])
        self.assertNotIn('cloudy', self.state['announcements'][0]['text'])

    def test_workflow_contract(self):
        workflow = WORKFLOW.read_text()
        inputs = workflow.split('    inputs:\n', 1)[1].split('\npermissions:', 1)[0]
        self.assertEqual(re.findall(r'^      (\w+):', inputs, re.M), ['action', 'slack_actor'])
        self.assertIn('group: merge-freeze-${{ github.repository }}\n  cancel-in-progress: false', workflow)
        self.assertIn("if: steps.toggle.outputs.changed == 'true'", workflow)
        self.assertIn('SLACK_ACTOR: ${{ inputs.slack_actor }}', workflow)
        self.assertNotIn('vars.MERGE_FREEZE_ACTOR', workflow)
        self.assertNotIn('${{ inputs.', script_for('        id: toggle'))


if __name__ == '__main__':
    if sys.argv[1:2] == ['--fake']:
        fake_command(sys.argv[2], sys.argv[3:])
    else:
        unittest.main()
