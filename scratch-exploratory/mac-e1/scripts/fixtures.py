import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / 'scratch-exploratory/e1'
FIXTURES = WORK / 'fixtures'


def resources():
    subprocess.run(['df', '-h', str(ROOT)], check=True)
    subprocess.run(['uptime'], check=True)
    if os.statvfs(ROOT).f_bavail * os.statvfs(ROOT).f_frsize < 15 * 1024**3:
        raise RuntimeError('STOP: less than 15 GiB free')
    while os.getloadavg()[0] > 10:
        print(f'Waiting for load: {os.getloadavg()[0]:.2f}', flush=True)
        time.sleep(30)


def project(case, package, models, versions=None, flags=None):
    directory = FIXTURES / case / package
    (directory / 'models').mkdir(parents=True, exist_ok=True)
    config = {'name': package, 'version': '1.0.0', 'config-version': 2,
              'profile': 'exploratory', 'models': {package: {'+materialized': 'table', '+access': 'public', '+schema': package}}}
    if flags:
        config['flags'] = flags
    (directory / 'dbt_project.yml').write_text(json.dumps(config))
    metadata = []
    for name, sql in models.items():
        (directory / 'models' / f'{name}.sql').write_text(sql + '\n')
        metadata.append({'name': name, 'meta': {'primary_key': 'id'},
                         'columns': [{'name': 'id', 'description': 'Synthetic key',
                                      'meta': {'metrics': {'rows': {'type': 'count'}}}}]})
    if versions:
        metadata = versions
    (directory / 'models/schema.yml').write_text(json.dumps({'version': 2, 'models': metadata}))
    profile = {'exploratory': {'target': 'dev', 'outputs': {'dev': {'type': 'postgres',
        'host': '127.0.0.1', 'port': 15981, 'user': 'postgres', 'password': "{{ env_var('PGPASSWORD') }}",
        'dbname': 'warehouse', 'schema': 'public', 'threads': 1}}}}
    (directory / 'profiles.yml').write_text(json.dumps(profile))
    return directory


def connection(directory, selector=None, environment=None):
    value = {'type': 'dbt', 'project_dir': str(directory), 'profiles_dir': str(directory)}
    if selector:
        value['selector'] = selector
    if environment:
        value['environment'] = [{'key': key, 'value': val} for key, val in environment.items()]
    return value


def source(name, directory, **kwargs):
    return {'name': name, 'connection': connection(directory, **kwargs)}


def basic(case='base'):
    return [source(name, project(case, name, {model: f'select {index + 1}::integer as id'}))
            for index, (name, model) in enumerate([('payments', 'ledger'), ('merchants', 'merchant_list'), ('marketing', 'campaigns')])]


def refs(case, explicit=True, primary=False, third=False, version=None):
    config = [{'name': 'm', 'latest_version': 2, 'versions': [{'v': 1}, {'v': 2}],
               'columns': [{'name': 'id'}]}] if version else None
    models = {'m_v1': 'select 1::integer as id', 'm_v2': 'select 2::integer as id'} if version else {'m': 'select 1::integer as id'}
    packages = ['merchants', 'risk'] + (['finance'] if third else [])
    sources = [source(name, project(case, name, models, config)) for name in packages]
    target = 'merchants'
    suffix = f', {version}=1' if version else ''
    consumer = {'uses_one': "select * from {{ ref('m'" + suffix + ') }}'}
    if explicit:
        consumer['uses_two'] = "select * from {{ ref('" + target + "', 'm'" + suffix + ') }}'
    sources.append(source('payments', project(case, 'payments', consumer)))
    return sources if primary else [sources[-1], *sources[:-1]]


def ring(case='ring', cycle=False):
    if cycle:
        a = {'model_a': "select * from {{ ref('merchants', 'model_b') }}"}
        b = {'model_b': "select * from {{ ref('payments', 'model_a') }}"}
    else:
        a = {'base_a': 'select 1::integer as id', 'uses_b': "select * from {{ ref('merchants', 'base_b') }}"}
        b = {'base_b': 'select 2::integer as id', 'uses_a': "select * from {{ ref('payments', 'base_a') }}"}
    return [source('payments', project(case, 'payments', a)), source('merchants', project(case, 'merchants', b))]


def materialize(sources):
    for item in sources:
        resources()
        directory = Path(item['connection']['project_dir'])
        original = {path: path.read_text() for path in (directory / 'models').glob('*.sql')}
        try:
            for path in original:
                path.write_text('select 1::integer as id\n')
            log = WORK / f"build-{directory.parent.name}-{directory.name}.log"
            with log.open('w') as output:
                subprocess.run([str(ROOT / '.venv-dbt/bin/dbt'), '--no-use-colors', 'run', '--project-dir', str(directory),
                                '--profiles-dir', str(directory), '--threads', '1'], stdout=output, stderr=subprocess.STDOUT, check=True)
            print(f'Materialized {directory.parent.name}/{directory.name}', flush=True)
        finally:
            for path, text in original.items():
                path.write_text(text)


if __name__ == '__main__':
    materialize(basic())
