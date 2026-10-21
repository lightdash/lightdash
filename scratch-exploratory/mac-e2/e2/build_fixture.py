import json
import sys
from pathlib import Path

from runtime import CHECKOUT as checkout, REAL_DBT, SCRIPTS, locked
sys.path.insert(0, str(checkout / 'examples/multi-repo-dbt-sim'))
from tooling import check_load, command, load_env, CommandError

env = load_env(checkout)
if env.get('PGHOST') not in ('localhost', '127.0.0.1', '::1'):
    raise RuntimeError('The exploratory warehouse must use loopback Postgres')
env['NODE_OPTIONS'] = '--max-old-space-size=4096'
root = checkout / 'examples/multi-repo-dbt-sim/.work/exploratory'
for source in json.loads((root / 'registry.json').read_text())['sources']:
    for action in ['seed', 'run']:
        check_load()
        try:
            command(locked([sys.executable, SCRIPTS / 'guard.py', str(REAL_DBT), action, '--project-dir', str(root / 'repos' / source['name']), '--profiles-dir', str(root / 'profiles'), '--profile', 'multi_repo_sim', '--threads', '1', '--full-refresh']), root, env, 1800)
        except CommandError as e:
            from run import sanitise
            print(sanitise(e.stdout + e.stderr, env))
            raise
        print(source['name'], action, 'PASS', flush=True)
