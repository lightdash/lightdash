import signal
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(SystemExit(143)))
from harness import *

with serve_git(ROOT, port=GIT_PORT) as server, trust_local_git(server):
    h = Harness(server)
    try:
        h.add_model('payments', 'shared_old')
        h.add_model('merchants', 'shared_old')
        h.setup('upgrade-seeding', ['payments', 'merchants'])
        op = h.refresh()
        names = list(h.cache())
        (OUT / 'upgrade-baseline.json').write_text(json.dumps({'names': names, 'commit': command(['git', 'rev-parse', 'HEAD'], CHECKOUT, h.env, 10).stdout.strip()}))
        h.record('old-writer-upgrade-fixture', success=op['success'], names=names, warnings=h.warnings(op))
        migration = command(['git', 'show', 'origin/thunder/stable-explore-names:packages/backend/src/database/migrations/20261021160000_add_explore_name_allocations.ts'], CHECKOUT, h.env, 10).stdout
        (OUT / 'allocMigration.ts').write_text(migration)
        migration = command(['git', 'show', 'origin/thunder/stable-explore-names:packages/backend/src/database/migrations/20261021180000_add_explore_name_reservations.ts'], CHECKOUT, h.env, 10).stdout
        (OUT / 'reserveMigration.ts').write_text(migration)
        check_load()
        h.heavy_command(['pnpm', 'exec', 'tsx', str(SCRIPTS / 'alloc-migration.ts')])
        try:
            op = h.refresh()
            rows = h.sql('select count(*) from explore_name_allocations')[0][0]
            h.record('old-writer-new-empty-table', success=op['success'], allocation_rows=rows, names_unchanged=list(h.cache()) == names)
        finally:
            check_load()
            h.heavy_command(['pnpm', 'exec', 'tsx', str(SCRIPTS / 'alloc-migration.ts'), 'down'])
    finally:
        h.r.close()
        h.stop()
