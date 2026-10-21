import signal
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(143)))
from harness import *

def allocations(h):
    return [{'name': r[0], 'reserved': r[1], 'source': r[2], 'package': r[3]} for r in h.sql('select name, is_reserved, source_name, package_name from explore_name_allocations where project_uuid = %s order by name', (h.project,))]

def snapshot(h):
    return {'names': list(h.cache()), 'allocations': allocations(h)}

with serve_git(ROOT, port=GIT_PORT) as server, trust_local_git(server):
    h = Harness(server)
    try:
        h.project = h.r.state['projects']['server-upgrade-seeding']
        expected = json.loads((OUT / 'upgrade-baseline.json').read_text())['names']
        op = h.refresh()
        h.record('upgrade-seeding-refresh', success=op['success'], names_unchanged=list(h.cache()) == expected, expected_names=expected, actual=snapshot(h), warnings=h.warnings(op))
        h.sql('delete from explore_name_allocations where project_uuid = %s', (h.project,))
        op = h.deploy('merchants')
        h.record('upgrade-seeding-cli', success=op['success'], names_unchanged=list(h.cache()) == expected, actual=snapshot(h), output=op['output'])
        h.setup('first-owner-stable', ['payments', 'merchants'])
        op = h.refresh()
        h.record('first-owner-baseline', success=op['success'], actual=snapshot(h))
        chart = h.r.chart(h.project, 'ledger')
        dashboard = h.api.call('POST', f'/api/v1/projects/{h.project}/dashboards', {'name': 'Synthetic ownership dashboard', 'tabs': [], 'tiles': [{'type': 'saved_chart', 'x': 0, 'y': 0, 'w': 12, 'h': 8, 'tabUuid': None, 'properties': {'savedChartUuid': chart['chart']}}]})
        dashboard_id = dashboard['uuid']
        h.add_model('merchants', 'ledger')
        h.materialize('merchants', 'ledger')
        op = h.refresh()
        dashboard_after = h.api.call('GET', f'/api/v1/dashboards/{dashboard_id}')
        h.record('first-owner-newcomer-refresh', success=op['success'], original_retained='ledger' in h.cache(), newcomer_qualified='merchants__ledger' in h.cache(), saved_chart=h.r.saved_chart_query(h.project, chart), dashboard_chart_reference=any(t.get('properties', {}).get('savedChartUuid') == chart['chart'] for t in dashboard_after['tiles']), actual=snapshot(h), warnings=h.warnings(op), newcomer_query=h.r.query(h.project, 'merchants__ledger'))
        op = h.deploy('merchants')
        h.record('first-owner-newcomer-cli', success=op['success'], actual=snapshot(h), saved_chart=h.r.saved_chart_query(h.project, chart), output=op['output'])
        h.patch_source('merchants', new_name='renamed_merchants')
        op = h.refresh()
        h.record('source-rename', success=op['success'], qualified_name_unchanged='merchants__ledger' in h.cache(), no_new_namespace='renamed_merchants__ledger' not in h.cache(), actual=snapshot(h), saved_chart=h.r.saved_chart_query(h.project, chart))
        h.patch_source('renamed_merchants', h.r.source_config('merchants'), new_name='merchants')
        h.remove_model('payments', 'ledger')
        op = h.refresh()
        h.record('owner-removes-model', success=op['success'], plain_released=not any(a['name'] == 'ledger' for a in allocations(h)), newcomer_stays_qualified='merchants__ledger' in h.cache(), actual=snapshot(h))
        h.add_model('payments', 'ledger')
        op = h.refresh()
        h.record('owner-readds-model', success=op['success'], owner_plain='ledger' in h.cache(), newcomer_stays_qualified='merchants__ledger' in h.cache(), actual=snapshot(h), saved_chart=h.r.saved_chart_query(h.project, chart))
        h.remove_model('merchants', 'ledger')
        op = h.refresh()
        h.record('newcomer-removes-model', success=op['success'], newcomer_gone='merchants__ledger' not in h.cache(), original_remains='ledger' in h.cache(), saved_chart=h.r.saved_chart_query(h.project, chart), actual=snapshot(h))
        h.add_model('marketing', 'merchants__ledger')
        h.materialize('marketing', 'merchants__ledger')
        h.setup('qualified-name-taken', ['payments', 'merchants', 'marketing'])
        op = h.refresh()
        h.record('qualified-name-taken-baseline', success=op['success'], actual=snapshot(h), occupied_owner_query=h.r.query(h.project, 'merchants__ledger'))
        h.add_model('merchants', 'ledger')
        h.materialize('merchants', 'ledger')
        op = h.refresh()
        summaries = h.api.call('GET', f'/api/v1/projects/{h.project}/explores')
        h.record('qualified-name-taken-refresh', success=op['success'], summaries=summaries, actual=snapshot(h), warnings=h.warnings(op), original_query=h.r.query(h.project, 'ledger'), occupied_owner_query=h.r.query(h.project, 'merchants__ledger'))
        before = h.cache()
        deploy = h.deploy('merchants')
        h.record('qualified-name-taken-cli', success=deploy['success'], http_409=deploy['http_409'], unchanged=h.cache() == before, output=deploy['output'], errors=deploy['http_errors'])
        h.remove_model('merchants', 'ledger')
    finally:
        h.r.close()
        h.stop()
