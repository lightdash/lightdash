import signal
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(143)))
from harness import *

def allocation_state(h):
    return [{'name': r[0], 'reserved': r[1], 'source': r[2]} for r in h.sql('select name,is_reserved,source_name from explore_name_allocations where project_uuid = %s and (name = %s or model_name = %s) order by name', (h.project, 'shared_new', 'shared_new'))]

def state(h):
    names = [n for n in h.cache() if n.endswith('shared_new')]
    rows = allocation_state(h)
    return {'names': names, 'plain_absent': 'shared_new' not in names, 'plain_reserved': any(r['name'] == 'shared_new' and r['reserved'] for r in rows), 'allocations': rows}

with serve_git(ROOT, port=GIT_PORT) as server, trust_local_git(server):
    h = Harness(server)
    try:
        h.setup('newcomer-reservations', ['payments', 'merchants', 'finance'])
        op = h.refresh()
        h.record('reservation-baseline', success=op['success'], state=state(h))
        for name in ['merchants', 'finance']:
            h.add_model(name, 'shared_new')
            h.materialize(name, 'shared_new')
        op = h.refresh()
        h.record('two-newcomers', success=op['success'], state=state(h), warnings=h.warnings(op))
        op = h.refresh()
        h.record('reservation-repeat', success=op['success'], state=state(h), warnings=h.warnings(op))
        h.add_model('marketing', 'shared_new')
        h.materialize('marketing', 'shared_new')
        h.add_source('marketing')
        deployed = h.deploy('marketing')
        h.record('third-newcomer-cli-first', success=deployed['success'], state=state(h), output=deployed['output'])
        op = h.refresh()
        h.record('third-newcomer-later', success=op['success'], state=state(h), warnings=h.warnings(op))
        op = h.deploy('merchants')
        h.record('reservation-cli-deploy', success=op['success'], state=state(h), output=op['output'])
        h.restart()
        op = h.refresh()
        h.record('reservation-instance-restart', success=op['success'], state=state(h), warnings=h.warnings(op))
        h.delete_source('finance')
        h.delete_source('marketing')
        op = h.refresh()
        h.record('one-colliding-source-left', success=op['success'], state=state(h), warnings=h.warnings(op), query=h.r.query(h.project, 'merchants__shared_new'))
        h.remove_model('merchants', 'shared_new')
        op = h.refresh()
        h.record('no-colliding-models-left', success=op['success'], state=state(h))
        h.add_model('merchants', 'shared_new')
        op = h.refresh()
        h.record('reserved-name-reintroduced', success=op['success'], state=state(h), warnings=h.warnings(op))
        h.delete_source('merchants')
        op = h.refresh()
        h.record('reservation-with-no-extra-sources', success=op['success'], state=state(h))
        h.add_source('merchants')
        op = h.refresh()
        h.record('reservation-source-returns', success=op['success'], state=state(h), query=h.r.query(h.project, 'merchants__shared_new'))
        h.setup('single-source-package-collision', ['payments', 'merchants'])
        op = h.refresh()
        h.record('package-collision-baseline', success=op['success'], names=list(h.cache()))
        vendor = ROOT / 'repos/merchants/vendor/synthetic_vendor'
        (vendor / 'models').mkdir(parents=True, exist_ok=True)
        (vendor / 'dbt_project.yml').write_text(json.dumps({'name': 'synthetic_vendor', 'version': '1.0.0', 'config-version': 2, 'model-paths': ['models']}))
        (vendor / 'models/settlement.sql').write_text("select 1::integer as id, 'synthetic_vendor_sample'::text as label, 9::numeric as amount, true as active, date '2026-01-01' as event_date\n")
        (vendor / 'models/schema.yml').write_text(json.dumps({'version': 2, 'models': [model_schema('settlement')]}))
        (ROOT / 'repos/merchants/packages.yml').write_text('packages:\n  - local: vendor/synthetic_vendor\n')
        h.publish('merchants')
        h.heavy_command([str(REAL_DBT), 'deps', '--project-dir', str(ROOT / 'repos/merchants'), '--profiles-dir', str(ROOT / 'profiles'), '--profile', 'multi_repo_sim'])
        h.materialize('merchants')
        op = h.refresh()
        h.record('single-source-two-packages', success=op['success'], names=list(h.cache()), summaries=h.api.call('GET', f'/api/v1/projects/{h.project}/explores'), warnings=h.warnings(op), original_query=h.r.query(h.project, 'settlement'), package_query=h.r.query(h.project, 'merchants__settlement'))
        deploy = h.deploy('merchants')
        h.record('single-source-two-packages-cli', success=deploy['success'], names=list(h.cache()), output=deploy['output'], original_query=h.r.query(h.project, 'settlement'))
    finally:
        h.r.close()
        h.stop()
