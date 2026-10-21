import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace
import psycopg2

from runtime import CHECKOUT, FIXTURE, ROOT, OUT, SCRIPTS, REAL_DBT, LDENV, GIT_PORT, locked, api_url
sys.path.insert(0, str(CHECKOUT / 'examples/multi-repo-dbt-sim'))
from run import Runner, sanitise, trust_local_git, ApiError
from tooling import serve_git, load_env, check_load, command, CommandError
from generate import model_schema


class Harness:
    def __init__(self, server):
        self.env = load_env(CHECKOUT)
        if self.env.get('PGHOST') not in ('localhost', '127.0.0.1', '::1'):
            raise RuntimeError('The exploratory warehouse must use loopback Postgres')
        self.env['NODE_OPTIONS'] = '--max-old-space-size=4096'
        self.args = SimpleNamespace(url=api_url(), target='current', cli=f'node {CHECKOUT}/packages/cli/dist/index.js', dbt=str(REAL_DBT), dbt19=None, timeout=300, server_project=None, cli_project=None, scale='small', scenarios=['exploratory'])
        self.r = Runner(self.args, self.env, ROOT, server)
        self.api = self.r.api
        evidence = OUT / ('evidence-' + os.environ.get('EXPLORE_BATCH', '31358') + '.json')
        self.records = json.loads(evidence.read_text()) if evidence.exists() else []
        self.server = server
        self.project = None

    def db(self):
        return psycopg2.connect(host=self.env['PGHOST'], port=self.env['PGPORT'], dbname=self.env.get('PGDATABASE_APP', self.env['PGDATABASE']), user=self.env['PGUSER'], password=self.env['PGPASSWORD'])

    def sql(self, query, params=()):
        with self.db() as db, db.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall() if cursor.description else None

    def setup(self, name, sources=None, mode='server'):
        self.project = self.operation('setup', name, mode, json.dumps(sources or ['payments', 'merchants', 'finance']))
        self.r.state = json.loads(self.r.state_path.read_text())
        return self.project

    def sources(self):
        return self.api.call('GET', f'/api/v1/projects/{self.project}/dbt-sources')

    def source(self, name):
        return next(s for s in self.sources() if s['name'] == name)

    def patch_source(self, name, config=None, new_name=None):
        source = self.source(name)
        return self.api.call('PATCH', f"/api/v1/projects/{self.project}/dbt-sources/{source['projectDbtSourceUuid']}", {'name': new_name or name, 'dbtConnection': config or self.r.source_config(name)})

    def add_source(self, name):
        return self.api.call('POST', f'/api/v1/projects/{self.project}/dbt-sources', {'name': name, 'dbtConnection': self.r.source_config(name)})

    def delete_source(self, name):
        s = self.source(name)
        return self.api.call('DELETE', f"/api/v1/projects/{self.project}/dbt-sources/{s['projectDbtSourceUuid']}")

    def refresh(self):
        before = self.server.clone_count
        op = self.operation('refresh')
        op['git_discovery_requests'] = self.server.clone_count - before
        return op

    def operation(self, name, *args):
        env = {**self.r.env, 'EXPLORATORY_PROJECT': self.project or ''}
        result = command(locked([sys.executable, SCRIPTS / 'guard.py', sys.executable, SCRIPTS / 'operation.py', name, *args]), CHECKOUT, env, 1800)
        return json.loads(result.stdout.rsplit('__EXPLORATORY_RESULT__', 1)[1])

    def deploy(self, source):
        return self.operation('deploy', source)

    def heavy_command(self, args, env=None, timeout=1800):
        return command(locked([sys.executable, SCRIPTS / 'guard.py', *args]), CHECKOUT, env or self.env, timeout)

    def report(self, op):
        job = op['status']['jobUuid']
        for _ in range(20):
            rows = self.sql('select report from project_compile_log where job_uuid = %s order by created_at desc limit 1', (job,))
            if rows:
                value = rows[0][0]
                return json.loads(value) if isinstance(value, str) else value
            time.sleep(.25)
        return None

    def cache(self):
        return {name: row for name, row in self.sql('select name, row_to_json(c) from cached_explore c where project_uuid = %s order by name', (self.project,))}

    def digest(self, value):
        return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()

    def warnings(self, op):
        report = self.report(op) if op['success'] else None
        return {'job': [line['info']['msg'] for step in op['status'].get('steps', []) for line in step.get('stepDbtLogs') or [] if line.get('info', {}).get('level') in ['warn', 'warning']], 'jobResults': (op['status'].get('jobResults') or {}).get('connectionWarnings', []), 'report': (report or {}).get('connectionWarnings', []), 'report_keys': list((report or {}).keys())}

    def record(self, name, **data):
        item = sanitise({'scenario': name, 'commit': command(['git', 'rev-parse', 'HEAD'], CHECKOUT, self.env, 10).stdout.strip(), **data}, self.r.env)
        self.records.append(item)
        (OUT / ('evidence-' + os.environ.get('EXPLORE_BATCH', '31358') + '.json')).write_text(json.dumps(self.records, indent=2, default=str))
        print(json.dumps(item, default=str), flush=True)

    def publish(self, name):
        self.r.republish(name)

    def schemas(self, name):
        p = ROOT / 'repos' / name / 'models/schema.yml'
        return json.loads(p.read_text())

    def set_schemas(self, name, schema):
        (ROOT / 'repos' / name / 'models/schema.yml').write_text(json.dumps(schema, indent=2))

    def add_model(self, source, model, sql=None):
        (ROOT / 'repos' / source / 'models' / (model + '.sql')).write_text(sql or "select * from {{ ref('" + source + "_seed') }}\n")
        schema = self.schemas(source)
        if not any(m['name'] == model for m in schema['models']):
            schema['models'].append(model_schema(model))
        self.set_schemas(source, schema)
        self.publish(source)

    def remove_model(self, source, model):
        (ROOT / 'repos' / source / 'models' / (model + '.sql')).unlink()
        schema = self.schemas(source)
        schema['models'] = [m for m in schema['models'] if m['name'] != model]
        self.set_schemas(source, schema)
        self.publish(source)

    def materialize(self, source, model=None):
        args = [str(REAL_DBT), 'run', '--project-dir', str(ROOT / 'repos' / source), '--profiles-dir', str(ROOT / 'profiles'), '--profile', 'multi_repo_sim', '--threads', '1']
        if model:
            args += ['--select', model]
        self.heavy_command(args)

    def detail(self, model):
        return self.api.call('GET', f'/api/v1/projects/{self.project}/explores/{model}')

    def restart(self, extra_env=None):
        self.stop()
        env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=4096', **(extra_env or {})}
        result = self.heavy_command([LDENV, 'start', '--no-wait', '--backend', 'bundle'], env)
        self.enable_wrapper()

    def enable_wrapper(self):
        env = {**self.env, 'PATH': str(SCRIPTS / 'bin') + os.pathsep + self.env['PATH']}
        self.heavy_command(['pnpm', 'exec', 'pm2', 'restart', self.env['LD_INSTANCE_ID'] + '-api', '--update-env'], env)
        for _ in range(90):
            try:
                self.api.call('GET', '/api/v1/health')
                return
            except Exception:
                time.sleep(1)
        raise RuntimeError('Own instance did not restart')

    def stop(self):
        command([LDENV, 'stop'], CHECKOUT, self.env, 60)
