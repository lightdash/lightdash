import os
import sys

import fixtures
import adapters

sys.path.insert(0, str(fixtures.ROOT / 'examples/multi-repo-dbt-sim'))
import tooling

tooling.check_load = fixtures.resources
tooling.load_env = lambda checkout: {**os.environ, 'LIGHTDASH_API_KEY': os.environ.get('LOCAL_API_KEY', '')}
import run

run.check_load = fixtures.resources
run.load_env = tooling.load_env
run.trust_local_git = adapters.trust_git
run.observe_cli_http = adapters.observe_http
original_init = run.Runner.__init__
original_project = run.Runner.project


def initialize(self, *args, **kwargs):
    original_init(self, *args, **kwargs)
    self.log_paths = [fixtures.WORK / 'api.log', fixtures.WORK / 'worker.log']


run.Runner.__init__ = initialize


def project(self, *args, **kwargs):
    fixtures.resources()
    if args and args[0] == 'ambiguity' and os.environ.get('FRESH_AMBIGUITY_REPRO'):
        args = (f'ambiguity-fresh-{os.getpid()}', *args[1:])
    return original_project(self, *args, **kwargs)


run.Runner.project = project
run.main()
