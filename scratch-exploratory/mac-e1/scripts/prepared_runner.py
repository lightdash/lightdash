import os
import sys
import contextlib
import json
from pathlib import Path

import fixtures
import adapters

ROOT = fixtures.ROOT
sys.path.insert(0, str(ROOT / 'examples/multi-repo-dbt-sim'))
import tooling

tooling.check_load = fixtures.resources
tooling.load_env = lambda checkout: {**os.environ, 'LIGHTDASH_API_KEY': os.environ.get('LOCAL_API_KEY', '')}

import prepared_explore
import run as simulation

prepared_explore.check_load = fixtures.resources
prepared_explore.load_env = tooling.load_env
prepared_explore.read_json_from_ldenv = lambda checkout, env: {'ports': {'api': 18981}}
prepared_explore.RELEASE_CLI = 'sfw npx --yes --prefix ' + str(fixtures.WORK / 'npm-cli') + ' --package @lightdash/cli@3.19.0 lightdash'
prepared_explore.OLD_CLI = prepared_explore.RELEASE_CLI
simulation.check_load = fixtures.resources
simulation.trust_local_git = adapters.trust_git
simulation.observe_cli_http = adapters.observe_http
prepared_explore.trust_local_git = adapters.trust_git
prepared_explore.observe_cli_http = adapters.observe_http
original_init = simulation.Runner.__init__
original_project = simulation.Runner.project


def initialize(self, *args, **kwargs):
    original_init(self, *args, **kwargs)
    self.log_paths = [fixtures.WORK / 'api.log', fixtures.WORK / 'worker.log']


simulation.Runner.__init__ = initialize


def project(self, *args, **kwargs):
    fixtures.resources()
    return original_project(self, *args, **kwargs)


simulation.Runner.project = project
original_params = prepared_explore.params


def parameters(self, cases):
    original_params(self, cases)
    def extra_only():
        project = self.project('parameters-extra-only', 'server')
        with contextlib.ExitStack() as stack:
            for item in self.sources:
                stack.enter_context(prepared_explore.config(self, item['name'],
                    json.dumps({'parameters': prepared_explore.REPLACEMENT}) if item['name'] == 'marketing' else None))
            self.api.call('PUT', f'/api/v2/projects/{project}/parameters', prepared_explore.PARAM)
            return {'refresh': self.refresh(project), 'after': self.snapshot(project)}
    cases.add('refresh-multi-extra-only-config', extra_only)


prepared_explore.params = parameters
prepared_explore.main()
