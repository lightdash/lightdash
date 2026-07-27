#!/bin/bash
set -e

# A database diverted from a pre-seeded snapshot (see okteto.preview.yaml)
# already contains the dbt demo data and the Lightdash seed; it only needs
# the branch's unapplied migrations. Any error in the check (blank database,
# database not up yet) falls through to the full path.
is_seeded() {
    [ "$(psql -tAc "SELECT to_regclass('jaffle.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM emails WHERE email = 'demo@lightdash.com')" 2>/dev/null)" = "t" ]
}

# Wait for the database before deciding which path to take, otherwise a
# diverted database that is still starting up would be mistaken for blank
for _ in $(seq 1 60); do
    psql -tAc "SELECT 1" >/dev/null 2>&1 && break
    sleep 2
done

if is_seeded; then
    echo "Database diverted from snapshot: applying delta migrations only"
    pnpm -F backend migrate-production
else
    echo "Database not pre-seeded: running full dbt + migrate + seed"

    # Idempotent dbt commands
    dbt1.7 deps --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
    dbt1.7 seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
    dbt1.7 run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh

    # Rollback all migrations and seed
    pnpm -F backend rollback-all-production
    pnpm -F backend migrate-production
    pnpm -F backend seed-production
fi

exec "$@"
