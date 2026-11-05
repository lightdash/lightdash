import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--json', required=True)
parser.add_argument('--markdown', required=True)
parser.add_argument('--compare', help='Previous clean run JSON; assert matching statement and row counts')
parser.add_argument('--stored-only', action='store_true', help='Measure only stored refresh reads, without creating tokens')
args = parser.parse_args()
root = Path(__file__).resolve().parents[7]
backend = root / 'packages/backend'
folder = Path(__file__).resolve().parent
env = dict(os.environ)
if env.get('CI'):
    raise SystemExit('This manual measurement harness must not run in CI.')
env.update(PNPM_CONFIG_VIRTUAL_STORE_TYPE='global', LIGHTDASH_SECRET=secrets.token_hex(32),
           SITE_URL='https://instance.example', S3_ENDPOINT='http://localhost:9000',
           S3_BUCKET='measurement', S3_REGION='us-east-1', S3_ACCESS_KEY='measurement',
           S3_SECRET_KEY='measurement', NODE_ENV='test', TZ='UTC', EXPERIMENTAL_CACHE='true')
if not env.get('PGHOST'):
    inspected = json.loads(subprocess.check_output(['docker', 'inspect', 'ldenv-pg']))
    password = next(v.split('=', 1)[1] for v in inspected[0]['Config']['Env'] if v.startswith('POSTGRES_PASSWORD='))
    env.update(PGHOST='127.0.0.1', PGPORT='15432', PGUSER='postgres', PGPASSWORD=password, PGDATABASE='postgres')
output = Path(args.json).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
Path(args.markdown).resolve().parent.mkdir(parents=True, exist_ok=True)
env.update(MEASUREMENT_JSON=str(output), MEASUREMENT_MARKDOWN=str(Path(args.markdown).resolve()))
if args.stored_only:
    env.update(MEASURE_STORED_ONLY='true', MEASURE_PROJECT_SIZES='', MEASURE_COMPILE_SIZES='')
command = ['pnpm', 'exec', 'vitest', 'run', '--config', str(folder / 'measurement.config.ts'), 'src/database/migrations/__tests__/launch-measurements/launch.measurement.ts', '--maxWorkers=2']
start = time.monotonic()
for count in filter(None, env.get('MEASURE_COMPILE_SIZES', '100,500,2000').split(',')):
    for mode in ['streaming', 'buffered']:
        subprocess.run(command, cwd=backend, env={**env, 'MEASURE_MEMORY': mode, 'MEASURE_MEMORY_SIZE': count}, check=True)
subprocess.run(command, cwd=backend, env=env, check=True)
print(f'Completed in {time.monotonic() - start:.1f}s; JSON: {output}')

if args.compare:
    previous = json.loads(Path(args.compare).read_text())
    current = json.loads(output.read_text())

    def counts(value):
        if isinstance(value, list):
            return [counts(item) for item in value]
        if isinstance(value, dict):
            if 'statements' in value and 'sql' in value:
                return {key: value[key] for key in ['statements', 'reads', 'rows']} | {
                    'sql': {sql: {key: group[key] for key in ['count', 'rows']} for sql, group in value['sql'].items()}
                }
            return {key: counts(item) for key, item in value.items()
                    if key not in ['environment', 'D', 'grantBytes', 'pendingBytes', 'heapGrowth', 'aboveLimit', 'explain']}
        return value

    if counts(previous) != counts(current):
        raise SystemExit('Clean-run SQL counts differ; inspect the two JSON files.')
    current['repeatability'] = {'previousRun': str(Path(args.compare).resolve()), 'statementAndRowCountsIdentical': True}
    output.write_text(json.dumps(current, indent=2))
    with Path(args.markdown).open('a') as report:
        report.write('\n## Repeatability\n\nTwo full runs each used a new temporary database. All SQL statement counts, returned-row counts and per-statement counts matched across A, B and C. Times, response dates, nonce values, PostgreSQL compressed datum sizes and heap/RSS samples can differ. The first raw run is retained beside the final results.\n')
    print('Both clean runs have identical SQL statement and returned-row counts.')

print(Path(args.markdown).read_text())
