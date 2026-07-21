#!/bin/bash
set -euo pipefail

# Seed guard for golden-DB restores (and PVC reuse on PR redeploy).
# When the DB already has the demo org + jaffle tables, skip the expensive
# dbt full-refresh + knex seed and only apply pending migrations.
# Always falls back to the full path on a blank (or partial) database.

db_has() {
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc \
        "SELECT CASE WHEN EXISTS($1) THEN 'yes' ELSE 'no' END" 2>/dev/null \
        || echo "no"
}

echo "Waiting for Postgres at ${PGHOST}:${PGPORT}..."
for _ in $(seq 1 60); do
    if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; then
        break
    fi
    sleep 2
done
if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; then
    echo "Postgres not ready after 120s" >&2
    exit 1
fi

FORCE_FULL="${FORCE_FULL_DB_SETUP:-false}"
SEEDED="$(db_has "SELECT 1 FROM emails WHERE email='demo@lightdash.com'")"
DBT_BUILT="$(db_has "SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders'")"
MIGRATED="$(db_has "SELECT 1 FROM information_schema.tables WHERE table_name='sessions'")"

if [ "$FORCE_FULL" != "true" ] && [ "$SEEDED" = "yes" ] && [ "$DBT_BUILT" = "yes" ]; then
    echo "DB already seeded (golden restore or reused PVC) — skipping dbt + seed"
    pnpm -F backend migrate-production
    exec "$@"
fi

echo "Running full dbt + migrate + seed (blank or partial DB)"
dbt1.7 deps --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
dbt1.7 seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt1.7 run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh

# Rollback only when schema exists but seed is missing (corrupt/partial state).
# Never rollback a golden-restored DB — that path is handled above.
if [ "$MIGRATED" = "yes" ] && [ "$SEEDED" != "yes" ]; then
    echo "Partial schema detected without seed — rolling back before migrate+seed"
    pnpm -F backend rollback-all-production
fi

pnpm -F backend migrate-production
pnpm -F backend seed-production

exec "$@"
