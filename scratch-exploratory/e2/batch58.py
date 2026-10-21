import contextlib
import json
import os
import time
import signal
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(143)))
from pathlib import Path
from harness import *

def probe(h, label, op, before, chart=None, expected_success=True, carried=('merchant', 'settlement'), healthy_marker=None):
    after = h.cache()
    warnings = h.warnings(op)
    carried_equal = {name: before.get(name) == after.get(name) and name in after for name in carried}
    query = h.r.saved_chart_query(h.project, chart) if chart else None
    healthy_updated = None
    if healthy_marker:
        healthy_updated = healthy_marker in json.dumps(h.detail('ledger'))
    safe = not any(s in json.dumps(warnings) for s in ['fixture-marker', '/private/fixture-only', 'https://fixture-user:'])
    h.record(label, success=op['success'], expected_success=expected_success, carried_equal=carried_equal, healthy_updated=healthy_updated, cache_count=len(after), warnings=warnings, warning_safety=safe, chart_query=query, steps=[{'type': s.get('stepType'), 'status': s.get('stepStatus'), 'error': s.get('stepError')} for s in op['status'].get('steps', [])])
    return after

def set_marker(h, marker):
    schema = h.schemas('payments')
    schema['models'][0]['description'] = marker
    h.set_schemas('payments', schema)
    h.publish('payments')

def change_env(key, value):
    p = CHECKOUT / '.env.development.local'
    lines = [line for line in p.read_text().splitlines() if not line.startswith(key + '=')]
    if value is not None:
        lines.append(key + '=' + value)
    p.write_text('\n'.join(lines) + '\n')

def main():
    with serve_git(ROOT, port=GIT_PORT) as server, trust_local_git(server):
        h = Harness(server)
        try:
            h.enable_wrapper()
            resuming = os.environ.get('RESUME_58') == 'deps'
            if resuming:
                h.project = h.r.state['projects']['server-failure-isolation']
                chart_id = h.sql('select saved_query_uuid from saved_queries where project_uuid=%s order by created_at desc limit 1', (h.project,))[0][0]
                chart = {'created': True, 'chart': chart_id}
                op = h.refresh()
                h.record('bad-branch-recovery', success=op['success'], recovered_definition='recovered after bad-branch' in json.dumps(h.detail('merchant')), warnings=h.warnings(op), chart_query=h.r.saved_chart_query(h.project, chart))
            else:
                h.setup('failure-isolation')
                op = h.refresh()
                h.record('baseline', success=op['success'], names=list(h.cache()), merchant_query=h.r.query(h.project, 'merchant'), warnings=h.warnings(op))
                if not op['success']:
                    h.record('baseline-failed', status=op['status'])
                    return
                chart = h.r.chart(h.project, 'merchant')
                h.record('saved-chart-baseline', created=chart['created'], query=h.r.saved_chart_query(h.project, chart))
            merchant_repo = ROOT / 'repos/merchants'
            base_sql = (merchant_repo / 'models/merchant.sql').read_text()
            base_project = (merchant_repo / 'dbt_project.yml').read_text()
            for fault in (['deps', 'parse', 'ls', 'manifest'] if resuming else (['bad-branch', 'deps', 'parse', 'ls', 'manifest'] if os.environ.get('E2_SKIP_COMPLETED') == '1' else ['unreadable', 'bad-branch', 'deps', 'parse', 'ls', 'manifest'])):
                before = h.cache()
                marker = 'healthy update during ' + fault
                set_marker(h, marker)
                config = h.r.source_config('merchants')
                if fault == 'unreadable':
                    server.unreadable.add('merchants')
                elif fault == 'bad-branch':
                    config['branch'] = 'missing-synthetic-branch'
                    h.patch_source('merchants', config)
                elif fault == 'deps':
                    (merchant_repo / 'packages.yml').write_text('packages:\n  - local: /private/fixture-only/fixture-marker\n')
                    h.publish('merchants')
                elif fault == 'parse':
                    (merchant_repo / 'models/merchant.sql').write_text("select {{ invalid_synthetic_function('fixture-only-invalid-argument') }}\n")
                    h.publish('merchants')
                elif fault == 'ls':
                    config['environment'] = [{'key': 'EXPLORATORY_FAULT', 'value': 'ls'}]
                    h.patch_source('merchants', config)
                elif fault == 'manifest':
                    config['environment'] = [{'key': 'EXPLORATORY_FAULT', 'value': 'manifest'}]
                    h.patch_source('merchants', config)
                op = h.refresh()
                after = probe(h, fault, op, before, chart, healthy_marker=marker)
                if fault == 'unreadable':
                    op2 = h.refresh()
                    probe(h, 'unreadable-repeat', op2, after, chart, healthy_marker=marker)
                server.unreadable.clear()
                if (merchant_repo / 'packages.yml').exists():
                    (merchant_repo / 'packages.yml').unlink()
                (merchant_repo / 'models/merchant.sql').write_text(base_sql)
                (merchant_repo / 'dbt_project.yml').write_text(base_project)
                schema = h.schemas('merchants')
                schema['models'][0]['description'] = 'recovered after ' + fault
                h.set_schemas('merchants', schema)
                h.publish('merchants')
                h.patch_source('merchants')
                op = h.refresh()
                h.record(fault + '-recovery', success=op['success'], recovered_definition=('recovered after ' + fault) in json.dumps(h.detail('merchant')), warnings=h.warnings(op), chart_query=h.r.saved_chart_query(h.project, chart))
            before = h.cache()
            server.unreadable.add('marketing')
            h.add_source('marketing')
            op = h.refresh()
            h.record('never-compiled', success=op['success'], warnings=h.warnings(op), names=list(h.cache()), no_marketing='marketing_base' not in h.cache())
            server.unreadable.clear()
            h.delete_source('marketing')
            p = ROOT / 'repos/finance/models/finance_base.sql'
            finance_sql = p.read_text()
            p.write_text("select * from {{ ref('merchants', 'merchant') }}\n")
            h.publish('finance')
            good = h.refresh()
            h.record('dependent-baseline', success=good['success'])
            before = h.cache()
            server.unreadable.add('merchants')
            op = h.refresh()
            probe(h, 'dependent-source-carried', op, before, chart, carried=('merchant', 'settlement', 'finance_base'))
            server.unreadable.clear()
            p.write_text(finance_sql)
            h.publish('finance')
            h.refresh()
            primary_model = ROOT / 'repos/payments/models/ledger.sql'
            primary_sql = primary_model.read_text()
            primary_model.write_text("select * from {{ ref('merchants', 'merchant') }}\n")
            h.publish('payments')
            good = h.refresh()
            h.record('primary-consumer-baseline', success=good['success'])
            before = h.cache()
            server.unreadable.add('merchants')
            op = h.refresh()
            probe(h, 'primary-consumer-fails', op, before, chart, expected_success=False, carried=tuple(before))
            server.unreadable.clear()
            primary_model.write_text(primary_sql)
            h.publish('payments')
            h.refresh()
            before = h.cache()
            server.unreadable.update(['merchants', 'finance'])
            set_marker(h, 'healthy update all secondary fail')
            op = h.refresh()
            probe(h, 'all-secondary-fail', op, before, chart, carried=('merchant', 'settlement', 'finance_base'), healthy_marker='healthy update all secondary fail')
            server.unreadable.clear()
            server.unreadable.add('payments')
            before = h.cache()
            op = h.refresh()
            probe(h, 'primary-fail', op, before, chart, expected_success=False, carried=tuple(before))
            server.unreadable.clear()
            h.refresh()
            config = h.r.source_config('merchants', 'tag:missing_synthetic_tag')
            h.patch_source('merchants', config)
            op = h.refresh()
            h.record('empty-selection', success=op['success'], no_failed_source_warning=not any('failed:' in w for w in h.warnings(op)['report']), merchant_removed='merchant' not in h.cache(), names=list(h.cache()), warnings=h.warnings(op))
            h.patch_source('merchants')
            h.refresh()
            schema = h.schemas('merchants')
            schema['models'][0]['description'] = 'CLI-only last good definition'
            remote_args = ['git', '--git-dir', str(ROOT / 'remotes/sim/merchants.git'), 'rev-parse', 'main']
            remote_before = command(remote_args, ROOT, h.env, 10).stdout.strip()
            h.set_schemas('merchants', schema)
            deploy = h.deploy('merchants')
            remote_after = command(remote_args, ROOT, h.env, 10).stdout.strip()
            h.record('cli-deploy', success=deploy['success'], output=deploy['output'], names=list(h.cache()), remote_head_unchanged=remote_before == remote_after, cli_definition_visible='CLI-only last good definition' in json.dumps(h.detail('merchant')) if deploy['success'] else None)
            if deploy['success']:
                before = h.cache()
                server.unreadable.add('merchants')
                op = h.refresh()
                probe(h, 'cli-deployed-source-fails', op, before, chart)
                server.unreadable.clear()
            config = h.r.source_config('merchants')
            config['environment'] = [{'key': 'EXPLORATORY_FAULT', 'value': 'sleep'}]
            h.patch_source('merchants', config)
            before = h.cache()
            change_env('DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS', '15000')
            h.restart()
            timeout_started = time.time()
            op = h.refresh()
            probe(h, 'whole-resolution-timeout', op, before, chart, expected_success=False, carried=tuple(before))
            events = OUT / 'fault-events.log'
            secondary_started = events.exists() and any(json.loads(line).get('fault') == 'sleep' and json.loads(line)['at'] >= timeout_started for line in events.read_text().splitlines())
            h.record('whole-resolution-timeout-detail', status=op['status'], unchanged=h.cache() == before, secondary_sleep_was_active=secondary_started)
            change_env('DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS', None)
            h.restart()
            cancelled = h.operation('cancel-refresh')
            h.restart()
            status = h.api.call('GET', f"/api/v1/jobs/{cancelled['job']}")
            h.record('cancel-via-instance-stop', status=status, unchanged=h.cache() == before, secondary_sleep_was_active=cancelled['secondary_sleep_was_active'], status_before_stop=cancelled['status_before_stop'])
            h.patch_source('merchants')
        finally:
            server.unreadable.clear()
            change_env('DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS', None)
            h.r.close()
            h.stop()

if __name__ == '__main__':
    main()
