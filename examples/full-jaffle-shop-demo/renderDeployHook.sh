#!/bin/bash
set -e

# Idempotent dbt commands
dbt1.7 deps --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
dbt1.7 seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt1.7 run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh

# Rollback all migrations and seed
pnpm -F backend rollback-all-production
pnpm -F backend migrate-production
pnpm -F backend seed-production

exec "$@"