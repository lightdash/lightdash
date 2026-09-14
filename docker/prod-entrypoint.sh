#!/bin/bash
set -e

# Migrate db
export LIGHTDASH_MIGRATION_EXECUTION_MODE="${LIGHTDASH_MIGRATION_EXECUTION_MODE:-boot-winner}"
pnpm -F backend migrate-production up

# Run prod
exec "$@"
