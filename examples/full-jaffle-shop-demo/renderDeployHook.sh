#!/bin/bash
set -e

# Idempotent dbt commands
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles

# Rollback all migrations and seed
pnpm -F backend rollback-all-production
pnpm -F backend migrate-production
pnpm -F backend seed-production

exec "$@"