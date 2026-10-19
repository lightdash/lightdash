#!/usr/bin/env python3
"""Exploratory scale test for mixed warehouse connections.

Drives a local Lightdash instance through the public API. See README.md.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import http.cookiejar
import uuid as uuidlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / 'examples' / 'mixed-warehouse-dev'
TRINO_FIXTURE = REPO / 'examples' / 'trino-dev' / 'dbt'
SNOWFLAKE_FIXTURE = REPO / 'examples' / 'mixed-warehouse-dev' / 'snowflake'
GITHUB_REPOSITORY = 'lightdash/lightdash'


class Api:
    def __init__(self, base, email, password):
        self.base = base.rstrip('/')
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.email = email
        self.password = password
        self.login()

    def login(self):
        self.call('POST', '/api/v1/login', {
            'email': self.email, 'password': self.password,
        })

    def call(self, method, path, body=None, timeout=600):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={'content-type': 'application/json'},
        )
        try:
            with self.opener.open(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            raw = error.read()
        try:
            return json.loads(raw) if raw else {'status': 'ok'}
        except json.JSONDecodeError:
            return {'status': 'error', 'error': {'message': clip(raw.decode(errors='replace'), 300)}}


def ok(response):
    return isinstance(response, dict) and response.get('status') == 'ok'


SENSITIVE_VALUES = set()


def register_sensitive(env):
    def load(name):
        try:
            return json.loads(env.get(name) or '{}')
        except ValueError:
            return {}

    bigquery = load('LIGHTDASH_TEST_BIGQUERY_CREDENTIALS')
    snowflake = load('LIGHTDASH_TEST_SNOWFLAKE_CREDENTIALS')
    athena = load('LIGHTDASH_TEST_ATHENA_CREDENTIALS')
    staging = os.environ.get('ATHENA_S3_STAGING_DIR', '')
    values = [
        bigquery.get('project_id'), bigquery.get('client_email'),
        bigquery.get('private_key_id'), os.environ.get('BIGQUERY_DATASET'),
        snowflake.get('account'), snowflake.get('username'),
        athena.get('accountId'), athena.get('accessKeyId'),
        athena.get('secretAccessKey'), *(athena.get('roles') or {}).values(),
        os.environ.get('ATHENA_WORKGROUP'), staging,
        staging.removeprefix('s3://').split('/')[0],
    ]
    SENSITIVE_VALUES.update(v for v in values if isinstance(v, str) and len(v) >= 4)
    for value in SENSITIVE_VALUES:
        text = f'error near "{value}" and {value.upper()}.'
        for cut in range(len(text) + 1):
            if value[:4].lower() in clip(text, cut).lower():
                raise SystemExit('redaction check failed for a registered credential value')


def redact(text):
    text = str(text)
    for value in sorted(SENSITIVE_VALUES, key=len, reverse=True):
        text = re.sub(re.escape(value), '<redacted>', text, flags=re.IGNORECASE)
    text = re.sub(r'arn:aws[\w-]*:[^\s"\']+', '<arn>', text)
    text = re.sub(r's3://[^\s"\']+', '<s3>', text)
    return re.sub(r'\b\d{12}\b', '<account>', text)


def clip(text, length):
    return redact(text)[:length]


def message(response):
    if not isinstance(response, dict):
        return clip(str(response), 300)
    return clip((response.get('error') or {}).get('message') or '', 400)


def read_env(path):
    env = {}
    for line in Path(path).read_text().splitlines():
        match = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line)
        if not match:
            continue
        value = match.group(2)
        if value[:1] in '\'"' and value[-1:] == value[:1]:
            value = value[1:-1]
        env[match.group(1)] = value
    return env


def load_manifest(name):
    path = FIXTURES / name / 'target' / 'manifest.json'
    if name == 'trino':
        path = TRINO_FIXTURE / 'target' / 'manifest.json'
    return path.read_text()


class Warehouses:
    """Connection settings and probe queries for each warehouse type."""

    def __init__(self, env, pg_database):
        self.env = env
        self.pg_database = pg_database
        self.types = ['postgres', 'trino', 'ducklake', 'bigquery',
                      'snowflake', 'clickhouse', 'redshift']
        if env.get('LIGHTDASH_TEST_ATHENA_CREDENTIALS') and os.environ.get('ATHENA_WORKGROUP'):
            self.types.append('athena')
        self.stand_ins = {'redshift'}

    def credentials(self, kind, variant=None):
        env = self.env
        if kind == 'postgres':
            return {
                'type': 'postgres', 'host': '127.0.0.1',
                'port': int(env['PGPORT']), 'user': env['PGUSER'],
                'password': env['PGPASSWORD'], 'dbname': self.pg_database,
                'schema': 'jaffle', 'sslmode': 'disable',
                'requireUserCredentials': False,
            }
        if kind == 'redshift':
            return {
                'type': 'redshift', 'host': '127.0.0.1',
                'port': int(env['PGPORT']), 'user': env['PGUSER'],
                'password': env['PGPASSWORD'], 'dbname': 'redshift_standin',
                'schema': 'public', 'sslmode': 'disable',
                'requireUserCredentials': False,
            }
        if kind == 'trino':
            return {
                'type': 'trino', 'host': 'localhost',
                'port': int(variant or 8080), 'user': 'lightdash',
                'password': '', 'dbname': 'memory', 'schema': 'tpch_dev',
                'http_scheme': 'http', 'requireUserCredentials': False,
            }
        if kind == 'ducklake':
            home = Path.home()
            return {
                'type': 'duckdb', 'connectionType': 'ducklake',
                'catalog': {'type': 'duckdb', 'path': str(home / '.lightdash/ducklake-dev/catalog.duckdb')},
                'dataPath': {'type': 'local', 'path': str(home / '.lightdash/ducklake-dev/data/')},
                'schema': 'main',
            }
        if kind == 'bigquery':
            key = json.loads(env['LIGHTDASH_TEST_BIGQUERY_CREDENTIALS'])
            return {
                'type': 'bigquery', 'project': key['project_id'],
                'dataset': variant or os.environ['BIGQUERY_DATASET'],
                'keyfileContents': key, 'timeoutSeconds': 300,
                'priority': 'interactive', 'retries': 3, 'location': 'US',
                'maximumBytesBilled': 200000000,
            }
        if kind == 'snowflake':
            key = json.loads(env['LIGHTDASH_TEST_SNOWFLAKE_CREDENTIALS'])
            warehouses = key.get('warehouses') or [key['warehouse']]
            return {
                'type': 'snowflake', 'account': key['account'],
                'user': key['username'], 'role': key['role'],
                'warehouse': warehouses[-1] if variant == 'second' else warehouses[0],
                'database': key['database'], 'schema': key['schema'],
                'authenticationType': 'private_key',
                'privateKey': key['privateKey'], 'timeoutSeconds': 60,
                **({'disableTimestampConversion': True} if variant == 'no-timestamp-conversion' else {}),
            }
        if kind == 'athena':
            key = json.loads(env['LIGHTDASH_TEST_ATHENA_CREDENTIALS'])
            region = os.environ.get('ATHENA_REGION', 'ap-southeast-1')
            return {
                'type': 'athena', 'region': region,
                'database': 'AwsDataCatalog', 'schema': 'athena_spike',
                's3StagingDir': os.environ.get('ATHENA_S3_STAGING_DIR', ''),
                'workGroup': os.environ['ATHENA_WORKGROUP'],
                'authenticationType': 'access_key',
                'accessKeyId': key['accessKeyId'],
                'secretAccessKey': variant or key['secretAccessKey'],
                'assumeRoleArn': key['roles'][region],
                'numRetries': 1,
            }
        if kind == 'clickhouse':
            return {
                'type': 'clickhouse', 'host': 'localhost',
                'port': int(env.get('CLICKHOUSE_HTTP_PORT', '18123')),
                'user': 'lightdash', 'password': variant or 'lightdash',
                'schema': 'analytics', 'secure': False,
                'requireUserCredentials': False,
            }
        raise ValueError(kind)

    PROBES = {
        'postgres': dict(explore='pg_orders', dim='pg_orders_status', metric='pg_orders_total_amount', date='pg_orders_order_date', native="upper(${pg_orders.status}) || '-' || to_char(${pg_orders.order_date}, 'YYYY')", sql='select status, count(*) as n from jaffle.orders group by 1 order by 1'),
        'trino': dict(explore='trino_orders', dim='trino_orders_order_status', metric='trino_orders_total_revenue', date='trino_orders_order_date', native="${trino_orders.order_status} || '-' || cast(year(${trino_orders.order_date}) as varchar)", sql='select order_status, count(*) as n from memory.tpch_dev.trino_orders group by 1 order by 1'),
        'ducklake': dict(explore='duck_events', dim='duck_events_event_type', metric='duck_events_total_amount', date='duck_events_event_date', native="strftime(${duck_events.event_date}, '%Y-%m') || ' ' || ${duck_events.event_type}", sql='select event_type, count(*) as n from ducklake.main.duck_events group by 1 order by 1'),
        'bigquery': dict(explore='bq_shakespeare', dim='bq_shakespeare_corpus', metric='bq_shakespeare_total_words', number=('bq_shakespeare_corpus_date', 1600), native="FORMAT('%s (%d)', ${bq_shakespeare.corpus}, ${bq_shakespeare.corpus_date})", sql='select corpus, sum(word_count) as w from `bigquery-public-data.samples.shakespeare` group by 1 order by 2 desc'),
        'snowflake': dict(explore='sf_customers', dim='sf_customers_segment', metric='sf_customers_total_balance', number=('sf_customers_balance', 0), native="IFF(${sf_customers.balance} > 5000, 'high', 'low')", sql='select segment, count(*) as n from AGENT_DEMO.PUBLIC.CUSTOMERS group by 1 order by 1'),
        'clickhouse': dict(explore='ch_sessions', dim='ch_sessions_platform', metric='ch_sessions_total_minutes', date='ch_sessions_session_date', native="concat(${ch_sessions.platform}, '-', toString(toYear(${ch_sessions.session_date})))", sql='select platform, count() as n from analytics.ch_sessions group by platform order by platform'),
        'athena': dict(explore='ath_fixture_types', dim='ath_fixture_types_label', metric='ath_fixture_types_total_amount', date='ath_fixture_types_day', native="coalesce(${ath_fixture_types.label} || '-' || cast(year(${ath_fixture_types.day}) as varchar), 'none')", sql='select label, count(*) as n from athena_spike.xp_fixture_types group by 1 limit 10'),
        'redshift': dict(explore='rs_orders', dim='rs_orders_region', metric='rs_orders_total_sales', date='rs_orders_order_date', native="upper(${rs_orders.region}) || '-' || to_char(${rs_orders.order_date}, 'YYYY')", sql='select region, count(*) as n from public.rs_orders group by 1 order by 1'),
    }

    LABELS = {
        'postgres': 'Postgres', 'trino': 'Trino', 'ducklake': 'DuckLake',
        'bigquery': 'BigQuery', 'snowflake': 'Snowflake',
        'clickhouse': 'ClickHouse', 'redshift': 'Redshift stand-in',
        'athena': 'Athena',
    }


class Recorder:
    notes = []

    def __init__(self, out_dir):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.scenarios = []
        self.current = None

    def start(self, name, project_kind):
        wait_for_load()
        self.current = {
            'name': name, 'kind': project_kind, 'steps': [],
            'started': time.time(), 'projectUuid': None,
        }
        self.scenarios.append(self.current)
        print(f'\n=== {name}', flush=True)

    def step(self, name, passed, detail='', seconds=0.0, expected=None):
        detail = redact(detail)
        entry = {
            'step': name, 'passed': bool(passed), 'detail': detail[:500],
            'seconds': round(seconds, 2),
        }
        if expected is not None:
            entry['expected'] = expected
        self.current['steps'].append(entry)
        mark = 'PASS' if passed else 'FAIL'
        print(f'  [{mark}] {name} ({seconds:.1f}s) {detail[:200]}', flush=True)
        return passed

    def finish(self):
        self.current['seconds'] = round(time.time() - self.current['started'], 1)
        self.current['passed'] = all(s['passed'] for s in self.current['steps'])
        self.save()

    def save(self):
        (self.out_dir / 'results.json').write_text(json.dumps(self.scenarios, indent=2))


def wait_for_load(limit=6.0):
    while os.getloadavg()[0] >= limit:
        print(f'  load {os.getloadavg()[0]:.1f} >= {limit}, waiting', flush=True)
        time.sleep(30)


def timed(fn, *args, **kwargs):
    start = time.time()
    result = fn(*args, **kwargs)
    return result, time.time() - start


class Runner:
    def __init__(self, api, warehouses, recorder, run_id):
        self.api = api
        self.w = warehouses
        self.rec = recorder
        self.run_id = run_id

    # Project and connection helpers

    def create_project(self, name, kind, dbt_version='v1.10', credentials_variant=None):
        warehouse = self.w.credentials(kind)
        if credentials_variant == 'require-user-credentials':
            warehouse = {**warehouse, 'requireUserCredentials': True}
        body = {
            'name': f'{name} [{self.run_id}]', 'type': 'DEFAULT',
            'warehouseConnection': warehouse,
            'dbtConnection': {'type': 'manifest', 'manifest': load_manifest(kind), 'hideRefreshButton': False},
            'dbtVersion': dbt_version,
        }
        response, seconds = timed(self.api.call, 'POST', '/api/v1/org/projects', body)
        project_uuid = None
        if ok(response):
            results = response['results']
            project_uuid = (results.get('project') or {}).get('projectUuid') or results.get('projectUuid')
        self.rec.step(f'create project ({kind} original)', project_uuid is not None, message(response), seconds)
        self.rec.current['projectUuid'] = project_uuid
        return project_uuid

    def connections(self, project):
        response = self.api.call('GET', f'/api/v1/projects/{project}/warehouse-connections')
        if not ok(response):
            return {}
        return {c['name']: c for c in response['results']['connections']}

    def switch(self, project, original_name, extra_name, extra_kind, expect_ok=True, expected_message=None):
        request = {
            'original': {'name': original_name, 'listAllDatabases': False, 'additionalDatabases': []},
            'connection': {'name': extra_name, 'warehouseConnection': self.w.credentials(extra_kind)},
        }
        preview, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/warehouse-connection-mode/preview', request)
        if not expect_ok:
            refused = not ok(preview) and (expected_message is None or expected_message in message(preview))
            return self.rec.step(f'switch with {extra_kind} extra is refused', refused, message(preview), seconds, expected=expected_message)
        if not ok(preview):
            return self.rec.step(f'switch preview with {extra_kind} extra', False, message(preview), seconds)
        executed, seconds2 = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/warehouse-connection-mode/switch', {
            **request, 'planHash': preview['results']['planHash'], 'idempotencyKey': str(uuidlib.uuid4()),
        })
        return self.rec.step(f'switch to multiple connections with {extra_kind} extra', ok(executed), message(executed), seconds + seconds2)

    def add_connection(self, project, name, kind, variant=None, expect_ok=True, expected_message=None, step_name=None):
        response, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/warehouse-connections', {
            'name': name, 'warehouseConnection': self.w.credentials(kind, variant),
        })
        label = step_name or f'add {kind} connection "{name}"'
        if expect_ok:
            self.rec.step(label, ok(response), message(response), seconds)
            return response['results']['warehouseConnectionUuid'] if ok(response) else None
        refused = not ok(response) and (expected_message is None or expected_message in message(response))
        self.rec.step(label, refused, message(response), seconds, expected=expected_message)
        return None

    def add_manifest_source(self, project, source_name, kind, connection_uuid, expect_ok=True, expected_message=None):
        response, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/dbt-sources', {
            'name': source_name,
            'dbtConnection': {'type': 'manifest', 'manifest': load_manifest(kind), 'hideRefreshButton': False},
        })
        if not expect_ok:
            refused = not ok(response) and (expected_message is None or expected_message in message(response))
            return self.rec.step(f'manifest source "{source_name}" is refused', refused, message(response), seconds, expected=expected_message)
        if not self.rec.step(f'add manifest source "{source_name}"', ok(response), message(response), seconds):
            return None
        source_uuid = response['results']['projectDbtSourceUuid']
        return self.bind(project, source_uuid, source_name, connection_uuid)

    def add_github_source(self, project, source_name, sub_path, connection_uuid, branch):
        response, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/dbt-sources', {
            'name': source_name,
            'dbtConnection': {
                'type': 'github', 'authorization_method': 'personal_access_token',
                'personal_access_token': '', 'repository': GITHUB_REPOSITORY,
                'branch': branch, 'project_sub_path': sub_path,
            },
        })
        if not self.rec.step(f'add GitHub source "{source_name}"', ok(response), message(response), seconds):
            return None
        source_uuid = response['results']['projectDbtSourceUuid']
        if connection_uuid is None:
            return source_uuid
        return self.bind(project, source_uuid, source_name, connection_uuid)

    def bind(self, project, source_uuid, source_name, connection_uuid):
        response, seconds = timed(self.api.call, 'PUT', f'/api/v1/projects/{project}/warehouse-connections/dbt-sources/{source_uuid}', {
            'warehouseConnectionUuid': connection_uuid,
        })
        self.rec.step(f'bind "{source_name}"', ok(response), message(response), seconds)
        return source_uuid if ok(response) else None

    def refresh(self, project, label='refresh and compile'):
        start = time.time()
        response = self.api.call('POST', f'/api/v1/projects/{project}/refresh')
        for _ in range(90):
            if ok(response) or 'already in progress' not in message(response):
                break
            time.sleep(2)
            response = self.api.call('POST', f'/api/v1/projects/{project}/refresh')
        if not ok(response):
            self.rec.step(label, False, message(response), time.time() - start)
            return None
        job = response['results']['jobUuid']
        result = {}
        for _ in range(240):
            result = self.api.call('GET', f'/api/v1/jobs/{job}').get('results') or {}
            if result.get('jobStatus') not in ('RUNNING', 'STARTED', 'PENDING', None):
                break
            time.sleep(2)
        errors = [s.get('stepError') for s in result.get('steps', []) if s.get('stepError')]
        passed = result.get('jobStatus') == 'DONE'
        detail = clip(json.dumps(result.get('jobResults')), 300) + (' ' + ' | '.join(errors) if errors else '')
        self.rec.step(label, passed, detail, time.time() - start)
        return result

    def explore(self, project, name):
        response = self.api.call('GET', f'/api/v1/projects/{project}/explores/{name}')
        return response.get('results') if ok(response) else None

    def run_query(self, project, query, label, extra=None, expect_rows=True):
        start = time.time()
        response = self.api.call('POST', f'/api/v2/projects/{project}/query/metric-query', {
            'query': query, 'context': 'exploreView', **(extra or {}),
        })
        if not ok(response):
            return self.rec.step(label, False, message(response), time.time() - start)
        query_uuid = response['results']['queryUuid']
        state = {}
        for _ in range(240):
            state = self.api.call('GET', f'/api/v2/projects/{project}/query/{query_uuid}?page=1&pageSize=10').get('results') or {}
            if state.get('status') not in ('pending', 'queued', 'executing'):
                break
            time.sleep(0.5)
        rows = state.get('rows') or []
        passed = state.get('status') == 'ready' and (len(rows) > 0 or not expect_rows)
        return self.rec.step(label, passed, f"{state.get('status')} rows={len(rows)} {state.get('error') or ''}", time.time() - start)

    def sql_runner(self, project, connection_uuid, sql, label):
        start = time.time()
        response = self.api.call('POST', f'/api/v2/projects/{project}/query/sql', {
            'sql': sql, 'limit': 10, 'context': 'sqlRunner', 'warehouseConnectionUuid': connection_uuid,
        })
        if not ok(response):
            return self.rec.step(label, False, message(response), time.time() - start)
        query_uuid = response['results']['queryUuid']
        state = {}
        for _ in range(240):
            state = self.api.call('GET', f'/api/v2/projects/{project}/query/{query_uuid}?page=1&pageSize=10').get('results') or {}
            if state.get('status') not in ('pending', 'queued', 'executing'):
                break
            time.sleep(0.5)
        rows = state.get('rows') or []
        return self.rec.step(label, state.get('status') == 'ready' and len(rows) > 0, f"{state.get('status')} rows={len(rows)} {state.get('error') or ''}", time.time() - start)

    # Probes

    def probe_kind(self, project, kind, connection_uuid, light=False):
        probe = Warehouses.PROBES[kind]
        explore = self.explore(project, probe['explore'])
        expected_type = 'duckdb' if kind == 'ducklake' else kind
        bound = (explore or {}).get('warehouseConnection') or {}
        self.rec.step(
            f'{kind}: explore bound to its connection with its dialect',
            explore is not None and bound.get('warehouseType') == expected_type
            and bound.get('warehouseConnectionUuid') == connection_uuid
            and not explore.get('errors'),
            clip(json.dumps({'targetDatabase': (explore or {}).get('targetDatabase'), 'warehouseConnection': bound, 'errors': (explore or {}).get('errors')}), 300),
        )
        base = {
            'exploreName': probe['explore'], 'dimensions': [probe['dim']],
            'metrics': [probe['metric']], 'filters': {}, 'sorts': [{'fieldId': probe['metric'], 'descending': True}],
            'limit': 5, 'tableCalculations': [], 'additionalMetrics': [], 'customDimensions': [],
        }
        self.run_query(project, base, f'{kind}: metric query')
        if light:
            return
        if 'date' in probe:
            flt = {'id': 'f1', 'target': {'fieldId': probe['date']}, 'operator': 'inThePast', 'values': [50], 'settings': {'unitOfTime': 'years', 'completed': False}}
        else:
            flt = {'id': 'f1', 'target': {'fieldId': probe['number'][0]}, 'operator': 'greaterThan', 'values': [probe['number'][1]]}
        table = probe['explore']
        metric_name = probe['metric'][len(table) + 1:]
        query = {
            **base, 'dimensions': ['native_sql'],
            'filters': {'dimensions': {'id': 'g', 'and': [flt]}},
            'customDimensions': [{'id': 'native_sql', 'name': 'native_sql', 'table': table, 'type': 'sql', 'sql': probe['native'], 'dimensionType': 'string'}],
            'tableCalculations': [
                {'name': 'double_it', 'displayName': 'double_it', 'sql': '${' + table + '.' + metric_name + '} * 2'},
                {'name': 'share', 'displayName': 'share', 'formula': f"={probe['metric']} / SUM({probe['metric']})"},
            ],
        }
        self.run_query(project, query, f'{kind}: filter, native SQL dimension, SQL and formula table calculations')
        self.sql_runner(project, connection_uuid, probe['sql'], f'{kind}: SQL runner on its connection')

    def dashboard(self, project, kinds, schedule=False):
        start = time.time()
        spaces = self.api.call('GET', f'/api/v1/projects/{project}/spaces')
        space = (spaces.get('results') or [None])[0] if ok(spaces) else None
        if space is None:
            created = self.api.call('POST', f'/api/v1/projects/{project}/spaces', {'name': 'Scale test'})
            space = created.get('results') if ok(created) else None
        if space is None:
            return self.rec.step('dashboard: create space', False, message(spaces), time.time() - start)
        tiles = []
        for index, kind in enumerate(kinds):
            probe = Warehouses.PROBES[kind]
            body = {
                'name': f'{Warehouses.LABELS[kind]} tile', 'tableName': probe['explore'], 'spaceUuid': space['uuid'],
                'metricQuery': {'exploreName': probe['explore'], 'dimensions': [probe['dim']], 'metrics': [probe['metric']], 'filters': {}, 'sorts': [{'fieldId': probe['metric'], 'descending': True}], 'limit': 50, 'tableCalculations': [], 'additionalMetrics': [], 'customDimensions': []},
                'tableConfig': {'columnOrder': [probe['dim'], probe['metric']]},
                'chartConfig': {'type': 'cartesian', 'config': {'layout': {'xField': probe['dim'], 'yField': [probe['metric']]}, 'eChartsConfig': {'series': [{'type': 'bar', 'encode': {'xRef': {'field': probe['dim']}, 'yRef': {'field': probe['metric']}}}]}}},
            }
            chart = self.api.call('POST', f'/api/v1/projects/{project}/saved', body)
            if not ok(chart):
                return self.rec.step('dashboard: create charts', False, f'{kind}: {message(chart)}', time.time() - start)
            tiles.append({'type': 'saved_chart', 'x': (index % 2) * 18, 'y': (index // 2) * 9, 'w': 18, 'h': 9, 'properties': {'savedChartUuid': chart['results']['uuid'], 'title': '', 'hideTitle': False}})
        dash = self.api.call('POST', f'/api/v1/projects/{project}/dashboards', {
            'name': f'Mixed dashboard [{self.run_id}]', 'spaceUuid': space['uuid'], 'tiles': tiles,
            'filters': {'dimensions': [], 'metrics': [], 'tableCalculations': []}, 'tabs': [],
        })
        if not self.rec.step('dashboard: mix charts from different connections', ok(dash), message(dash), time.time() - start):
            return None
        dashboard = dash['results']
        start = time.time()
        failures = []
        for tile in dashboard['tiles']:
            response = self.api.call('POST', f'/api/v2/projects/{project}/query/dashboard-chart', {
                'tileUuid': tile['uuid'], 'chartUuid': tile['properties']['savedChartUuid'],
                'dashboardUuid': dashboard['uuid'], 'dashboardFilters': {'dimensions': [], 'metrics': [], 'tableCalculations': []},
                'dashboardSorts': [], 'context': 'dashboardView', 'invalidateCache': True,
            })
            if not ok(response):
                failures.append(message(response))
                continue
            query_uuid = response['results']['queryUuid']
            state = {}
            for _ in range(240):
                state = self.api.call('GET', f'/api/v2/projects/{project}/query/{query_uuid}?page=1&pageSize=5').get('results') or {}
                if state.get('status') not in ('pending', 'queued', 'executing'):
                    break
                time.sleep(0.5)
            if state.get('status') != 'ready':
                failures.append(clip(str(state.get('error')), 200))
        self.rec.step(f'dashboard: {len(dashboard["tiles"])} tiles run on their own connections', not failures, ' | '.join(failures), time.time() - start)
        if schedule:
            self.scheduled_delivery(dashboard['uuid'])
        return dashboard

    def scheduled_delivery(self, dashboard_uuid):
        start = time.time()
        recipient = f'scale-{self.run_id}-{dashboard_uuid[:8]}@example.com'
        response = self.api.call('POST', '/api/v1/schedulers/send', {
            'name': f'Scale test delivery {self.run_id}', 'message': 'Mixed warehouses',
            'format': 'csv', 'cron': '0 9 * * 1', 'timezone': 'UTC', 'dashboardUuid': dashboard_uuid,
            'options': {'formatted': True, 'limit': 'table'}, 'targets': [{'recipient': recipient}], 'enabled': True,
        })
        if not ok(response):
            return self.rec.step('scheduled delivery: send now', False, message(response), time.time() - start)
        found = False
        for _ in range(90):
            search = urllib.request.urlopen(f'http://localhost:8025/api/v1/search?query=to:{recipient}', timeout=30)
            payload = json.loads(search.read())
            if payload.get('messages_count', 0) or payload.get('total', 0):
                found = True
                break
            time.sleep(2)
        return self.rec.step('scheduled delivery: CSV email for a mixed dashboard', found, recipient if found else 'no email arrived', time.time() - start)

    # Scenario building blocks

    def matrix_project(self, original, extras, schedule=False, light_kinds=frozenset()):
        self.rec.start(f'matrix: {original} original with {", ".join(extras)}', 'matrix')
        project = self.create_project(f'Mixed {original} + {len(extras)}', original)
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        original_name = f'{Warehouses.LABELS[original]} (original)'
        first = extras[0]
        if not self.switch(project, original_name, f'{Warehouses.LABELS[first]} extra', first):
            return self.rec.finish()
        conns = self.connections(project)
        uuids = {first: conns.get(f'{Warehouses.LABELS[first]} extra', {}).get('warehouseConnectionUuid')}
        for kind in extras[1:]:
            uuids[kind] = self.add_connection(project, f'{Warehouses.LABELS[kind]} extra', kind, variant='second' if kind == 'snowflake' and original == 'snowflake' else None)
        for kind in extras:
            if uuids.get(kind):
                self.add_manifest_source(project, f'{kind}_models', kind, uuids[kind])
        self.refresh(project)
        original_uuid = None
        self.probe_kind(project, original, original_uuid, light=original in light_kinds)
        for kind in extras:
            if uuids.get(kind):
                self.probe_kind(project, kind, uuids[kind], light=kind in light_kinds)
        self.dashboard(project, [original] + [k for k in extras if uuids.get(k)], schedule=schedule)
        self.rec.finish()
        return project

    def flag_on_refusals(self):
        self.rec.start('flag on: unsupported and unsafe connection changes', 'guards')
        project = self.create_project('Guards', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        self.switch(project, 'Postgres (original)', 'Trino extra', 'trino')
        trino_uuid = self.connections(project).get('Trino extra', {}).get('warehouseConnectionUuid')
        self.add_connection(project, 'Bad password', 'clickhouse', variant='wrong-password', expect_ok=False, step_name='bad credentials are refused by the connection test')
        self.add_connection(project, 'Unreachable Trino', 'trino', variant=1, expect_ok=False, step_name='unreachable warehouse is refused by the connection test')
        if 'athena' in self.w.types:
            self.add_connection(project, 'Bad Athena key', 'athena', variant='not-a-real-secret', expect_ok=False, step_name='bad Athena credentials are refused by the connection test')
        response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/warehouse-connections/{trino_uuid}', {
            'warehouseConnection': self.w.credentials('postgres'),
        })
        expected = "A connection's warehouse type cannot be changed. Add a new connection instead."
        self.rec.step('changing a connection type is refused', not ok(response) and expected in message(response), message(response), seconds, expected=expected)
        bq_uuid = self.add_connection(project, 'BigQuery extra', 'bigquery')
        if bq_uuid:
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/warehouse-connections/{bq_uuid}', {
                'warehouseConnection': {**self.w.credentials('bigquery'), 'timeoutSeconds': 120},
            })
            self.rec.step('edit a live connection (same type)', ok(response), message(response), seconds)
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/warehouse-connections/{bq_uuid}/name', {'name': 'BigQuery renamed'})
            self.rec.step('rename a live connection', ok(response), message(response), seconds)
            source = self.add_manifest_source(project, 'bigquery_models', 'bigquery', bq_uuid)
            self.refresh(project)
            self.probe_kind(project, 'bigquery', bq_uuid, light=True)
            response, seconds = timed(self.api.call, 'DELETE', f'/api/v1/projects/{project}/warehouse-connections/{bq_uuid}')
            self.rec.step('deleting a connection that explores use is refused', not ok(response), message(response), seconds)
            if source:
                self.api.call('DELETE', f'/api/v1/projects/{project}/dbt-sources/{source}')
            self.refresh(project, 'refresh after removing the source')
            response, seconds = timed(self.api.call, 'DELETE', f'/api/v1/projects/{project}/warehouse-connections/{bq_uuid}')
            self.rec.step('delete an unused connection', ok(response), message(response), seconds)
        response, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/warehouse-connections', {
            'name': 'Playground', 'warehouseConnection': {'type': 'duckdb', 'connectionType': 'embedded', 'dataset': 'jaffle'},
        })
        self.rec.step('backend-provisioned DuckDB is refused as an extra', not ok(response), message(response), seconds)
        self.rec.finish()

    def cross_source(self, branch):
        self.rec.start('cross-source refs: refs and joins inside and across connections', 'cross-source')
        project = self.create_project('Cross-source refs', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        self.switch(project, 'Postgres (original)', 'Trino extra', 'trino')
        trino_uuid = self.connections(project).get('Trino extra', {}).get('warehouseConnectionUuid')
        self.add_github_source(project, 'pg_shared', 'examples/mixed-warehouse-dev/xref/pg_shared', None, branch)
        self.add_github_source(project, 'trino_shared', 'examples/mixed-warehouse-dev/xref/trino_shared', trino_uuid, branch)
        self.add_github_source(project, 'trino_consumer', 'examples/mixed-warehouse-dev/xref/trino_consumer', trino_uuid, branch)
        result = self.refresh(project, 'compile with refs inside the Trino connection')
        explore = self.explore(project, 'trino_nation_regions')
        bound = (explore or {}).get('warehouseConnection') or {}
        self.rec.step('ref between two sources on the Trino connection resolves', explore is not None and bound.get('warehouseConnectionUuid') == trino_uuid, json.dumps(bound))
        warnings = json.dumps((explore or {}).get('warnings') or [])
        self.rec.step('join to a model on another connection is skipped with a warning naming both connections', 'Joins across connections are not supported' in warnings and 'Postgres (original)' in warnings, clip(warnings, 300))
        self.run_query(project, {'exploreName': 'trino_nation_regions', 'dimensions': ['trino_nation_regions_nation_name'], 'metrics': ['trino_nation_regions_nation_count'], 'filters': {}, 'sorts': [], 'limit': 5, 'tableCalculations': [], 'additionalMetrics': [], 'customDimensions': []}, 'query the explore built from a cross-source ref')
        self.rec.finish()

        self.rec.start('cross-source refs: ref across connections is refused clearly', 'cross-source')
        project = self.create_project('Cross-connection ref', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        self.switch(project, 'Postgres (original)', 'Trino extra', 'trino')
        trino_uuid = self.connections(project).get('Trino extra', {}).get('warehouseConnectionUuid')
        self.add_github_source(project, 'pg_shared', 'examples/mixed-warehouse-dev/xref/pg_shared', None, branch)
        self.add_github_source(project, 'trino_xconn', 'examples/mixed-warehouse-dev/xref/trino_xconn', trino_uuid, branch)
        result = self.refresh(project, 'compile with a ref across connections')
        warnings = json.dumps(((result or {}).get('jobResults') or {}).get('connectionWarnings') or [])
        expected = 'Refs across connections are not supported'
        self.rec.step('the Trino connection fails with a cross-connection ref warning', expected in warnings and 'pg_shared' in warnings, clip(warnings, 400), expected=expected)
        self.rec.step('the original connection still compiles', self.explore(project, 'pg_calendar') is not None)
        self.rec.finish()

    def preview_and_cli(self, source_project, cli_dir):
        self.rec.start('preview project and CLI deploy into an extra connection', 'preview-cli')
        start = time.time()
        response = self.api.call('POST', f'/api/v1/projects/{source_project}/createPreview', {'name': f'Mixed preview [{self.run_id}]', 'copyContent': True})
        preview = (response.get('results') or {}).get('projectUuid') if ok(response) else None
        self.rec.step('create a preview of a mixed project', preview is not None, message(response), time.time() - start)
        self.rec.current['projectUuid'] = preview
        if preview:
            source_conns = self.connections(source_project)
            preview_conns = self.connections(preview)
            self.rec.step('the preview copies every connection', sorted(source_conns) == sorted(preview_conns), f'{sorted(preview_conns)}')
            expected_explores = {Warehouses.PROBES[k]['explore'] for n in preview_conns for k, label in Warehouses.LABELS.items() if n.startswith(label)}
            start = time.time()
            names = set()
            for _ in range(120):
                listed = self.api.call('GET', f'/api/v1/projects/{preview}/explores')
                names = {e['name'] for e in (listed.get('results') or [])} if ok(listed) else set()
                if expected_explores <= names:
                    break
                time.sleep(3)
            self.rec.step('the preview compiles every connection', expected_explores <= names, f'missing: {sorted(expected_explores - names)}', time.time() - start)
            for name, connection in preview_conns.items():
                if connection['isOriginal']:
                    continue
                kind = next((k for k, label in Warehouses.LABELS.items() if name.startswith(label)), None)
                if kind:
                    self.probe_kind(preview, kind, connection['warehouseConnectionUuid'], light=True)
        project = source_project
        trino_uuid = next((c['warehouseConnectionUuid'] for n, c in self.connections(project).items() if n.startswith('Trino')), None)
        if trino_uuid is None:
            self.rec.step('CLI deploy: project has a Trino connection', False)
            return self.rec.finish()
        source = self.add_manifest_source(project, 'trino_cli', 'trino', trino_uuid)
        token = self.api.call('POST', '/api/v1/user/me/personal-access-tokens', {'description': f'scale test {self.run_id}', 'expiresAt': None, 'autoGenerated': True})
        if not ok(token) or not source:
            self.rec.step('CLI deploy: personal access token', False, message(token))
            return self.rec.finish()
        env = {
            **os.environ, 'LIGHTDASH_URL': self.api.base, 'LIGHTDASH_API_KEY': token['results']['token'],
            'LIGHTDASH_PROJECT': project, 'CI': 'true',
            'PATH': f"{Path.home() / '.lightdash/dev-venv-trino/bin'}:{os.environ['PATH']}",
        }
        start = time.time()
        completed = subprocess.run(
            ['node', str(REPO / 'packages/cli/dist/index.js'), 'deploy', '--source', 'trino_cli', '--project-dir', str(cli_dir), '--profiles-dir', str(cli_dir), '--skip-warehouse-catalog', '--assume-yes'],
            env=env, capture_output=True, text=True, timeout=900,
        )
        tail = redact(completed.stdout + completed.stderr)[-400:]
        self.rec.step('CLI deploy --source into the Trino connection', completed.returncode == 0, tail.replace('\n', ' '), time.time() - start)
        explore = self.explore(project, 'trino_orders')
        bound = (explore or {}).get('warehouseConnection') or {}
        self.rec.step('CLI-deployed explore is bound to the Trino connection', bound.get('warehouseConnectionUuid') == trino_uuid, json.dumps(bound))
        self.rec.finish()

    def cli_env(self, project, extra=None):
        token = self.api.call('POST', '/api/v1/user/me/personal-access-tokens', {'description': f'scale test {self.run_id}', 'expiresAt': None, 'autoGenerated': True})
        if not ok(token):
            return None
        return {
            **os.environ, 'LIGHTDASH_URL': self.api.base, 'LIGHTDASH_API_KEY': token['results']['token'],
            'LIGHTDASH_PROJECT': project, 'CI': 'true',
            'PATH': f"{Path.home() / '.lightdash/dev-venv-trino/bin'}:{os.environ['PATH']}",
            **(extra or {}),
        }

    def run_cli(self, env, args, timeout=900):
        completed = subprocess.run(
            ['node', str(REPO / 'packages/cli/dist/index.js'), *args],
            env=env, capture_output=True, text=True, timeout=timeout,
        )
        return completed.returncode, redact(completed.stdout + completed.stderr)

    def update_connection(self, project, connection_uuid, kind, variant=None):
        return timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/warehouse-connections/{connection_uuid}', {
            'warehouseConnection': self.w.credentials(kind, variant),
        })

    def merge_query(self, project, left, right, label):
        start = time.time()
        sources = []
        for kind in (left, right):
            probe = Warehouses.PROBES[kind]
            sources.append({'id': kind, 'metricQuery': {
                'exploreName': probe['explore'], 'dimensions': [probe['dim']], 'metrics': [probe['metric']],
                'filters': {}, 'sorts': [], 'limit': 100, 'tableCalculations': [], 'additionalMetrics': [], 'customDimensions': [],
            }})
        body = {'mergeQuery': {
            'sources': sources,
            'joinKey': [{'name': 'label', 'fieldIdBySourceId': {left: Warehouses.PROBES[left]['dim'], right: Warehouses.PROBES[right]['dim']}}],
            'joinType': 'full', 'tableCalculations': [], 'limit': 200,
        }, 'context': 'exploreView'}
        response = self.api.call('POST', f'/api/v2/projects/{project}/query/merge-query', body)
        results = response.get('results') or {}
        if not ok(response) or results.get('outcome') != 'started':
            return self.rec.step(label, False, message(response) or clip(json.dumps(results.get('errors')), 300), time.time() - start)
        query_uuid = results['query']['queryUuid']
        state = {}
        for _ in range(240):
            state = self.api.call('GET', f'/api/v2/projects/{project}/query/{query_uuid}?page=1&pageSize=200').get('results') or {}
            if state.get('status') not in ('pending', 'queued', 'executing'):
                break
            time.sleep(0.5)
        rows = state.get('rows') or []
        columns = set(rows[0].keys()) if rows else set()
        both = any(left in c for c in columns) and any(right in c for c in columns)
        return self.rec.step(label, state.get('status') == 'ready' and len(rows) > 0 and both, f"{state.get('status')} rows={len(rows)} columns={sorted(columns)[:6]} {state.get('error') or ''}", time.time() - start)

    def new_cases(self):
        self.rec.start('CLI --source into extras of another type, and a merge query across them', 'new-cases')
        project = self.create_project('New cases Postgres', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        if not self.switch(project, 'Postgres (original)', 'Trino extra', 'trino'):
            return self.rec.finish()
        trino_uuid = self.connections(project).get('Trino extra', {}).get('warehouseConnectionUuid')
        snowflake_uuid = self.add_connection(project, 'Snowflake extra', 'snowflake', variant='no-timestamp-conversion', step_name='add a Snowflake extra with timestamp conversion off')
        self.add_manifest_source(project, 'trino_models', 'trino', trino_uuid)
        snowflake_source = self.add_manifest_source(project, 'snowflake_cli', 'snowflake', snowflake_uuid) if snowflake_uuid else None
        self.refresh(project)
        self.merge_query(project, 'postgres', 'trino', 'merge query joins Postgres and Trino results')
        key = json.loads(self.w.env['LIGHTDASH_TEST_SNOWFLAKE_CREDENTIALS'])
        env = self.cli_env(project, {
            'SNOWFLAKE_ACCOUNT': key['account'], 'SNOWFLAKE_USER': key['username'],
            'SNOWFLAKE_ROLE': key['role'], 'SNOWFLAKE_WAREHOUSE': (key.get('warehouses') or [key['warehouse']])[0],
        })
        if env and snowflake_source:
            start = time.time()
            code, out = self.run_cli(env, ['deploy', '--source', 'snowflake_cli', '--verbose', '--project-dir', str(SNOWFLAKE_FIXTURE), '--profiles-dir', str(SNOWFLAKE_FIXTURE), '--skip-warehouse-catalog', '--assume-yes'])
            expected = 'disable-timestamp-conversion=true from connection "Snowflake extra"'
            self.rec.step('CLI deploy --source into the Snowflake extra uses its timestamp setting', code == 0 and expected in out, clip(out.replace('\n', ' ')[-400:], 400), time.time() - start, expected=expected)
            explore = self.explore(project, 'sf_customers')
            bound = (explore or {}).get('warehouseConnection') or {}
            self.rec.step('CLI-deployed Snowflake explore is bound to the Snowflake extra', bound.get('warehouseConnectionUuid') == snowflake_uuid, json.dumps(bound))
        if env and trino_uuid:
            self.add_manifest_source(project, 'trino_cli', 'trino', trino_uuid)
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/warehouse-connections/{trino_uuid}', {
                'warehouseConnection': {**self.w.credentials('trino'), 'startOfWeek': 2},
            })
            self.rec.step('set a Wednesday week start on the upstream Trino extra', ok(response), message(response), seconds)
            before = (self.api.call('GET', f'/api/v1/projects/{project}').get('results') or {}).get('warehouseConnection')
            name = f'CLI preview [{self.run_id}]'
            profiles = Path(tempfile.mkdtemp(prefix='mixed-cli-profiles-'))
            (profiles / 'profiles.yml').write_text(
                'trino_dev:\n  target: dev\n  outputs:\n    dev:\n      type: trino\n      method: ldap\n'
                '      user: lightdash\n      password: ""\n      host: localhost\n      port: 8080\n'
                '      http_scheme: http\n      database: memory\n      schema: tpch_dev\n      threads: 2\n'
            )
            start = time.time()
            code, out = self.run_cli(env, ['start-preview', '--name', name, '--source', 'trino_cli', '--project-dir', str(TRINO_FIXTURE), '--profiles-dir', str(profiles), '--skip-warehouse-catalog'])
            self.rec.step('CLI start-preview --source into the Trino extra', code == 0, clip(out.replace('\n', ' ')[-400:], 400), time.time() - start)
            projects = self.api.call('GET', '/api/v1/org/projects').get('results') or []
            preview = next((p['projectUuid'] for p in projects if p['name'] == name), None)
            if preview:
                after = (self.api.call('GET', f'/api/v1/projects/{preview}').get('results') or {}).get('warehouseConnection')
                keys = ('type', 'host', 'port', 'dbname', 'schema')
                same = before is not None and after is not None and all(before.get(k) == after.get(k) for k in keys)
                self.rec.step("the preview's primary connection is unchanged", same, json.dumps({k: (after or {}).get(k) for k in ('type', 'schema')}))
                conns = self.connections(preview)
                self.rec.step('the preview keeps its Trino extra', 'Trino extra' in conns, f'{sorted(conns)}')
                preview_trino = (conns.get('Trino extra') or {}).get('warehouseConnectionUuid')

                def preview_week_start():
                    details = self.api.call('GET', f'/api/v1/projects/{preview}/warehouse-connections/{preview_trino}').get('results') or {}
                    return (details.get('warehouseConnection') or {}).get('startOfWeek')

                week_start = preview_week_start()
                self.rec.step('refreshing the Trino extra keeps its week start', week_start == 2, f'startOfWeek={week_start}')
                updated_before = {n: c.get('updatedAt') for n, c in self.connections(preview).items()}
                time.sleep(1)
                start = time.time()
                code, out = self.run_cli(env, ['start-preview', '--name', name, '--source', 'trino_cli', '--project-dir', str(TRINO_FIXTURE), '--profiles-dir', str(profiles), '--skip-warehouse-catalog'])
                updated_after = {n: c.get('updatedAt') for n, c in self.connections(preview).items()}
                refreshed = updated_after.get('Trino extra') != updated_before.get('Trino extra')
                primary_untouched = updated_after.get('Postgres (original)') == updated_before.get('Postgres (original)')
                week_start = preview_week_start()
                self.rec.step('rerunning start-preview refreshes only the Trino extra and keeps its week start', code == 0 and refreshed and primary_untouched and week_start == 2, f'extra refreshed={refreshed} primary untouched={primary_untouched} startOfWeek={week_start}', time.time() - start)
                after = (self.api.call('GET', f'/api/v1/projects/{preview}').get('results') or {}).get('warehouseConnection')
                self.rec.step("the preview's primary is still unchanged after the rerun", before is not None and after is not None and all(before.get(k) == after.get(k) for k in keys), json.dumps({k: (after or {}).get(k) for k in ('type', 'schema')}))
                self.run_cli(env, ['stop-preview', '--name', name], timeout=300)
            else:
                self.rec.step('CLI preview project found', False)
        self.rec.finish()

        self.rec.start('dbt source location check on extras of another type', 'new-cases')
        self.rec.current['projectUuid'] = project
        clickhouse_uuid = self.add_connection(project, 'ClickHouse extra', 'clickhouse')
        clickhouse_source = self.add_manifest_source(project, 'clickhouse_models', 'clickhouse', clickhouse_uuid) if clickhouse_uuid else None
        if clickhouse_source:
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/dbt-sources/{clickhouse_source}', {'warehouseLocation': {'database': 'other', 'schema': 'analytics'}})
            self.rec.step('a database override on a ClickHouse-bound source is refused', not ok(response) and 'not qualified by a database' in message(response), message(response), seconds)
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/dbt-sources/{clickhouse_source}', {'warehouseLocation': {'database': None, 'schema': 'analytics'}})
            self.rec.step('a schema override on a ClickHouse-bound source is accepted', ok(response), message(response), seconds)
        if snowflake_source:
            response, seconds = timed(self.api.call, 'PATCH', f'/api/v1/projects/{project}/dbt-sources/{snowflake_source}', {'warehouseLocation': {'database': 'AGENT_DEMO', 'schema': 'PUBLIC'}})
            self.rec.step('a database override on a Snowflake-bound source under a Postgres primary is accepted', ok(response), message(response), seconds)
        self.rec.finish()

        self.rec.start('primary requires user credentials, with extras', 'new-cases')
        project = self.create_project('Personal credentials Postgres', 'postgres', credentials_variant='require-user-credentials')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        if self.switch(project, 'Postgres (original)', 'Trino extra', 'trino'):
            conns = self.connections(project)
            trino_uuid = conns.get('Trino extra', {}).get('warehouseConnectionUuid')
            details = self.api.call('GET', f'/api/v1/projects/{project}/warehouse-connections/{trino_uuid}').get('results') or {}
            self.rec.step('a Trino extra keeps its own credential setting', (details.get('warehouseConnection') or {}).get('requireUserCredentials') is False, json.dumps({'requireUserCredentials': (details.get('warehouseConnection') or {}).get('requireUserCredentials')}))
            replica_uuid = self.add_connection(project, 'Postgres replica', 'postgres')
            if replica_uuid:
                details = self.api.call('GET', f'/api/v1/projects/{project}/warehouse-connections/{replica_uuid}').get('results') or {}
                self.rec.step('a Postgres extra follows the primary setting', (details.get('warehouseConnection') or {}).get('requireUserCredentials') is True, json.dumps({'requireUserCredentials': (details.get('warehouseConnection') or {}).get('requireUserCredentials')}))
            self.add_manifest_source(project, 'trino_models', 'trino', trino_uuid)
            self.refresh(project)
            probe = Warehouses.PROBES['trino']
            self.run_query(project, {'exploreName': probe['explore'], 'dimensions': [probe['dim']], 'metrics': [probe['metric']], 'filters': {}, 'sorts': [], 'limit': 10, 'tableCalculations': []}, 'the Trino extra runs with its shared credentials')
            probe = Warehouses.PROBES['postgres']
            start = time.time()
            response = self.api.call('POST', f'/api/v2/projects/{project}/query/metric-query', {'context': 'exploreView', 'query': {'exploreName': probe['explore'], 'dimensions': [probe['dim']], 'metrics': [probe['metric']], 'filters': {}, 'sorts': [], 'limit': 10, 'tableCalculations': []}})
            state = response.get('results') or {}
            if ok(response):
                for _ in range(120):
                    state = self.api.call('GET', f"/api/v2/projects/{project}/query/{response['results']['queryUuid']}?page=1&pageSize=5").get('results') or {}
                    if state.get('status') not in ('pending', 'queued', 'executing'):
                        break
                    time.sleep(0.5)
            text = message(response) if not ok(response) else str(state.get('error') or '')
            self.rec.step('the primary asks for personal credentials', 'credential' in text.lower(), clip(text, 300), time.time() - start)
        self.rec.finish()

    def ai_generate(self, project, kind, explore, field, prompt):
        start = time.time()
        context = [{'name': field, 'label': field.replace('_', ' '), 'description': '', 'type': 'date', 'table': explore}]
        if kind == 'table-calculation':
            body = {'prompt': prompt, 'tableName': explore, 'exploreName': explore, 'fieldsContext': [{**c, 'fieldType': 'dimension'} for c in context]}
        else:
            body = {'prompt': prompt, 'tableName': explore, 'exploreName': explore, 'fieldsContext': [{**c, 'id': f'{explore}_{field}'} for c in context]}
        response = self.api.call('POST', f'/api/v1/ai/{project}/{kind}/generate', body)
        return (response.get('results') or {}).get('sql') if ok(response) else None, message(response), time.time() - start

    def ai_generators(self):
        env = self.w.env
        has_key = bool(env.get('OPENAI_API_KEY') or env.get('ANTHROPIC_API_KEY'))
        if not has_key or env.get('AI_COPILOT_ENABLED') != 'true':
            note = 'AI generators on an extra connection: no AI provider key or AI Copilot is off on this instance.'
            self.rec.notes.append(note)
            print(f'\n=== SKIPPED: {note}', flush=True)
            return
        self.rec.start('AI generators on an extra of another type', 'ai')
        project = self.create_project('AI generators Postgres', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        if not self.switch(project, 'Postgres (original)', 'Trino extra', 'trino'):
            return self.rec.finish()
        trino_uuid = self.connections(project).get('Trino extra', {}).get('warehouseConnectionUuid')
        self.add_manifest_source(project, 'trino_models', 'trino', trino_uuid)
        self.refresh(project)
        postgres_only = ('to_char',)
        trino_markers = ('date_format', 'format_datetime', 'varchar', 'year(', 'month(', 'lpad(')
        cases = [
            ('table-calculation', 'Week start of the order date as text in YYYY-MM-DD format', 'order_date_week'),
            ('custom-dimension', 'Order year and month as text in YYYY-MM format', 'order_date'),
        ]
        for kind, prompt, field in cases:
            sql, detail, seconds = self.ai_generate(project, kind, 'trino_orders', field, prompt)
            lowered = (sql or '').lower()
            trino_dialect = bool(sql) and not any(m in lowered for m in postgres_only) and any(m in lowered for m in trino_markers)
            self.rec.step(f'AI {kind} on the Trino extra uses Trino SQL', trino_dialect, clip(sql or detail, 300), seconds)
            if not sql:
                continue
            probe = Warehouses.PROBES['trino']
            base = {'exploreName': 'trino_orders', 'metrics': [probe['metric']], 'filters': {}, 'sorts': [], 'limit': 10, 'additionalMetrics': []}
            if kind == 'table-calculation':
                query = {**base, 'dimensions': ['trino_orders_order_date_week'], 'tableCalculations': [{'name': 'ai_calc', 'displayName': 'AI calc', 'sql': sql}]}
            else:
                query = {**base, 'dimensions': ['ai_dim'], 'tableCalculations': [], 'customDimensions': [{'id': 'ai_dim', 'name': 'ai_dim', 'table': 'trino_orders', 'type': 'sql', 'sql': sql, 'dimensionType': 'string'}]}
            self.run_query(project, query, f'the AI {kind} runs on the Trino extra')
        sql, detail, seconds = self.ai_generate(project, 'custom-dimension', 'pg_orders', 'order_date', 'Order year and month as text in YYYY-MM format')
        self.rec.step('control: the same custom dimension prompt on the Postgres primary uses Postgres SQL', bool(sql) and 'date_format' not in (sql or '').lower(), clip(sql or detail, 300), seconds)
        self.rec.finish()

    def flag_off_cross_source(self, branch):
        self.rec.start('flag off: same-type ref across connections keeps the existing message', 'flag-off')
        project = self.create_project('Flag off cross-source', 'postgres')
        if not project:
            return self.rec.finish()
        self.refresh(project, 'initial compile of the original')
        if not self.switch(project, 'Postgres (original)', 'Postgres replica', 'postgres'):
            return self.rec.finish()
        replica = self.connections(project).get('Postgres replica', {}).get('warehouseConnectionUuid')
        self.add_github_source(project, 'pg_shared', 'examples/mixed-warehouse-dev/xref/pg_shared', None, branch)
        self.add_github_source(project, 'pg_xconn', 'examples/mixed-warehouse-dev/xref/pg_xconn', replica, branch)
        result = self.refresh(project, 'compile with a ref across two Postgres connections')
        warnings = json.dumps(((result or {}).get('jobResults') or {}).get('connectionWarnings') or [])
        self.rec.step('the replica fails with the existing message and no cross-connection explanation', 'pg_shared' in warnings and 'Refs across connections' not in warnings, clip(warnings, 400))
        self.rec.finish()

    def flag_off(self, state):
        self.rec.start('flag off: same-type extras only, as on main', 'flag-off')
        project = self.create_project('Flag off Postgres', 'postgres')
        if project:
            self.refresh(project, 'initial compile of the original')
            self.switch(project, 'Postgres (original)', 'Trino extra', 'trino', expect_ok=False, expected_message='An extra connection must use the same warehouse type as the original connection.')
            self.switch(project, 'Postgres (original)', 'Postgres replica', 'postgres')
            replica = self.connections(project).get('Postgres replica', {}).get('warehouseConnectionUuid')
            self.add_connection(project, 'Trino extra', 'trino', expect_ok=False, expected_message='An extra connection must use the same warehouse type as the original connection.', step_name='adding a Trino extra is refused')
            if replica:
                self.add_manifest_source(project, 'postgres_models', 'postgres', replica, expect_ok=False, expected_message='Additional dbt sources currently support GitHub connections only')
                response, seconds = self.update_connection(project, replica, 'trino')
                expected = 'An extra connection must use the same warehouse type as the original connection.'
                self.rec.step("changing an extra's type gives main's same-type message", not ok(response) and expected in message(response), message(response), seconds, expected=expected)
        self.rec.finish()

        self.rec.start('flag off: Snowflake same-type extra', 'flag-off')
        project = self.create_project('Flag off Snowflake', 'snowflake')
        if project:
            self.refresh(project, 'initial compile of the original')
            if self.switch(project, 'Snowflake (original)', 'Snowflake second warehouse', 'snowflake'):
                self.rec.step('Snowflake second-warehouse extra listed', 'Snowflake second warehouse' in self.connections(project))
                oauth = {**self.w.credentials('snowflake', 'second'), 'authenticationType': 'oauth_authorization_code'}
                oauth.pop('privateKey', None)
                response, seconds = timed(self.api.call, 'POST', f'/api/v1/projects/{project}/warehouse-connections', {'name': 'Snowflake OAuth', 'warehouseConnection': oauth})
                self.rec.step("a Snowflake OAuth authorization code extra is not refused as external browser, as on main", 'External browser authentication' not in message(response), message(response), seconds)
        self.rec.finish()

        for kind in ('trino', 'bigquery', 'clickhouse'):
            self.rec.start(f'flag off: {kind} project cannot switch', 'flag-off')
            project = self.create_project(f'Flag off {kind}', kind)
            if project:
                self.refresh(project, 'initial compile of the original')
                mode = self.api.call('GET', f'/api/v1/projects/{project}/warehouse-connection-mode')
                can_switch = (mode.get('results') or {}).get('canSwitch')
                self.rec.step(f'{kind} project reports it cannot switch', can_switch is False, clip(json.dumps(mode.get('results')), 300))
                self.switch(project, f'{kind} (original)', f'{kind} replica', kind, expect_ok=False)
            self.rec.finish()

        for project, kinds in state.get('mixedProjects', []):
            self.rec.start(f'flag off: existing mixed project keeps working ({", ".join(kinds)})', 'flag-off')
            self.rec.current['projectUuid'] = project
            conns = self.connections(project)
            for name, connection in conns.items():
                kind = next((k for k, label in Warehouses.LABELS.items() if name.startswith(label)), None)
                if kind and kind != 'snowflake':
                    self.probe_kind(project, kind, None if connection['isOriginal'] else connection['warehouseConnectionUuid'], light=True)
            original_kind = kinds[0]
            expected = (
                'An extra connection must use the same warehouse type as the original connection.'
                if original_kind in ('postgres', 'snowflake', 'athena')
                else 'Multiple connections are supported for Postgres, Athena, and Snowflake projects only.'
            )
            self.add_connection(project, 'Another ClickHouse', 'clickhouse', expect_ok=False, expected_message=expected, step_name="adding a mixed extra is refused with main's message when the flag is off")
            self.rec.finish()


def prepare_physical_fixtures(env, pg_database):
    psql = ['docker', 'exec', '-i', 'ldenv-pg', 'psql', '-U', env['PGUSER'], '-d', pg_database, '-v', 'ON_ERROR_STOP=1']
    subprocess.run(psql, input=(
        'create schema if not exists xref;\n'
        'create or replace view xref.pg_calendar as select d::date as calendar_date, extract(isodow from d)::int as day_of_week '
        "from generate_series(date '2024-01-01', date '2024-12-31', interval '1 day') d;\n"
    ), text=True, check=True, capture_output=True)
    subprocess.run(
        [str(Path.home() / '.lightdash/dev-venv-trino/bin/dbt'), 'run', '--profiles-dir', '.'],
        cwd=TRINO_FIXTURE, check=True, capture_output=True,
    )
    trino = ['docker', 'exec', '-i', 'ld-trino-dev', 'trino']
    statements = [
        'CREATE SCHEMA IF NOT EXISTS memory.xref',
        'CREATE TABLE IF NOT EXISTS memory.xref.trino_nations AS SELECT nationkey AS nation_id, name AS nation_name, regionkey AS region_id FROM tpch.tiny.nation',
        "CREATE TABLE IF NOT EXISTS memory.xref.trino_nation_regions AS SELECT nation_id, nation_name, region_id, DATE '2024-03-01' AS joined_on FROM memory.xref.trino_nations",
    ]
    for statement in statements:
        subprocess.run(trino + ['--execute', statement], check=True, capture_output=True)
    clickhouse = f"http://localhost:{env.get('CLICKHOUSE_HTTP_PORT', '18123')}/?user=lightdash&password=lightdash"
    for statement in [
        'CREATE DATABASE IF NOT EXISTS analytics',
        'CREATE TABLE IF NOT EXISTS analytics.ch_sessions (session_id UInt32, user_id UInt32, platform String, session_date Date, duration_minutes Float64) ENGINE = MergeTree ORDER BY session_id',
        "INSERT INTO analytics.ch_sessions SELECT number + 1, number % 40, ['web', 'ios', 'android'][number % 3 + 1], toDate('2024-01-01') + number % 365, round((number % 90) * 1.5, 1) FROM numbers(2000) WHERE (SELECT count() FROM analytics.ch_sessions) = 0",
    ]:
        urllib.request.urlopen(urllib.request.Request(clickhouse, data=statement.encode(), method='POST'), timeout=60).read()


def write_summary(recorder):
    lines = ['| Scenario | Project | Steps passed | Seconds | Result |', '| --- | --- | --- | --- | --- |']
    for s in recorder.scenarios:
        passed = sum(1 for step in s['steps'] if step['passed'])
        lines.append(f"| {s['name']} | {(s.get('projectUuid') or '-')[:8]} | {passed}/{len(s['steps'])} | {s.get('seconds', '-')} | {'pass' if s.get('passed') else 'FAIL'} |")
    failures = [f"- **{s['name']}**: {step['step']}: {step['detail']}" for s in recorder.scenarios for step in s['steps'] if not step['passed']]
    text = '\n'.join(lines) + '\n\n' + ('### Failures\n\n' + '\n'.join(failures) if failures else 'No failures.') + '\n'
    if recorder.notes:
        text += '\n### Skipped\n\n' + '\n'.join(f'- {note}' for note in recorder.notes) + '\n'
    (recorder.out_dir / 'summary.md').write_text(text)
    print('\n' + text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://localhost:8080')
    parser.add_argument('--env-file', default=str(REPO / '.env.development.local'))
    parser.add_argument('--pg-database', required=True)
    parser.add_argument('--branch', required=True, help='Git branch the GitHub dbt sources clone')
    parser.add_argument('--mode', choices=['flag-on', 'flag-off'], required=True)
    parser.add_argument('--out', default=str(Path(tempfile.gettempdir()) / 'mixed-warehouse-scale-test'))
    parser.add_argument('--only', default='', help='Comma-separated scenario groups to run')
    parser.add_argument('--originals', default='', help='Comma-separated original warehouse types for the matrix group')
    args = parser.parse_args()

    env = read_env(args.env_file)
    register_sensitive(env)
    api = Api(args.url, os.environ.get('LIGHTDASH_EMAIL', 'demo@lightdash.com'), os.environ.get('LIGHTDASH_PASSWORD', 'demo_password!'))
    out = Path(args.out) / args.mode
    recorder = Recorder(out)
    run_id = time.strftime('%m%d-%H%M')
    runner = Runner(api, Warehouses(env, args.pg_database), recorder, run_id)
    state_file = Path(args.out) / 'state.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    only = set(filter(None, args.only.split(',')))

    def wanted(group):
        return not only or group in only

    if args.mode == 'flag-on':
        prepare_physical_fixtures(env, args.pg_database)
        types = runner.w.types
        mixed = []
        if wanted('matrix'):
            originals = [k for k in types if not args.originals or k in args.originals.split(',')]
            for index, original in enumerate(originals):
                extras = [k for k in types if k != original]
                project = runner.matrix_project(original, extras, schedule=index < 3, light_kinds=frozenset({'snowflake'}) if original != 'snowflake' else frozenset())
                if project:
                    mixed.append([project, [original] + extras])
        if wanted('pairs'):
            pairs = [('snowflake', 'clickhouse'), ('ducklake', 'bigquery'), ('clickhouse', 'redshift'), ('redshift', 'trino'), ('bigquery', 'snowflake'), ('trino', 'postgres')]
            if 'athena' in types:
                pairs += [('athena', 'snowflake'), ('postgres', 'athena')]
            for original, extra in pairs:
                project = runner.matrix_project(original, [extra], light_kinds=frozenset({'snowflake'}))
                if project:
                    mixed.append([project, [original, extra]])
        if wanted('guards'):
            runner.flag_on_refusals()
        if wanted('cross-source'):
            runner.cross_source(args.branch)
        if wanted('preview-cli') and mixed:
            runner.preview_and_cli(mixed[0][0], TRINO_FIXTURE)
        if wanted('new-cases'):
            runner.new_cases()
        if wanted('ai'):
            runner.ai_generators()
        state['mixedProjects'] = (state.get('mixedProjects') or []) + mixed[:3]
        state_file.write_text(json.dumps(state, indent=2))
    else:
        runner.flag_off(state)
        runner.flag_off_cross_source(args.branch)

    recorder.save()
    write_summary(recorder)
    return 0 if all(s.get('passed') for s in recorder.scenarios) else 1


if __name__ == '__main__':
    sys.exit(main())
