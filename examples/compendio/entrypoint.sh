#!/bin/bash
set -e

# Idempotent dbt commands
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles

# Rollback all migrations and seed
yarn workspace backend rollback-all-production
yarn workspace backend migrate-production
yarn workspace backend seed-production
exec "$@"
