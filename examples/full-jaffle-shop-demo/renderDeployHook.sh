#!/bin/bash
set -e

# Idempotent dbt commands
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles

# Rollback all migrations and seed
pnpm --filter backend rollback-all-production
pnpm --filter backend migrate-production
pnpm --filter backend seed-production
