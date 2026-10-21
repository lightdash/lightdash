import json
import os
import sys

import fixtures

sys.path.insert(0, str(fixtures.ROOT / 'examples/multi-repo-dbt-sim'))
import tooling

tooling.check_load = fixtures.resources
env = dict(os.environ)
env['PGDATABASE'] = 'warehouse'
env['DBT_DATABASE'] = 'warehouse'
root = fixtures.ROOT / 'examples/multi-repo-dbt-sim/.work/small'
result = tooling.build(root, str(fixtures.ROOT / '.venv-dbt/bin/dbt'),
                       str(fixtures.ROOT / '.venv-dbt19/bin/dbt'), env=env)
(fixtures.WORK / 'simulation-build.json').write_text(tooling._safe_output(json.dumps(result), env))
print('Simulation build exit:', result['exit_code'], 'projects:', result['projects_built'], flush=True)
if result['exit_code']:
    print(tooling._safe_output(json.dumps(result['errors']), env), flush=True)
raise SystemExit(result['exit_code'])
