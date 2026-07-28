#!/bin/bash
# Runs inside the Okteto dev container (see okteto.dev.yaml). Installs
# dependencies, builds the packages the backend imports as dist, migrates the
# database, then starts the same watchers as local dev. node_modules and
# incremental build state live on the dev container's persistent volume, so
# only the first run pays the full cost.
set -euo pipefail
cd /usr/app

echo "--- Installing dependencies"
pnpm install --prefer-offline

echo "--- Building formula, common, warehouses (incremental)"
pnpm formula:build:fast
pnpm common-build:fast
pnpm warehouses-build:fast

echo "--- Running database migrations"
# The preview snapshot was migrated from compiled dist ('.js' filenames); dev
# runs migrations from src ('.ts'). Align the records or knex refuses to run.
# A blank database (no snapshot was ready at deploy time) has no
# knex_migrations table yet: skip the rename and warn — the app boots without
# demo data and users must register manually.
if [ "$(psql -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE" -tAc \
    "SELECT to_regclass('knex_migrations') IS NOT NULL")" = "t" ]; then
    psql -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE" \
        -c "UPDATE knex_migrations SET name = regexp_replace(name, '\.js$', '.ts') WHERE name LIKE '%.js';"
else
    echo "WARNING: blank database (no preview snapshot was available)."
    echo "WARNING: migrating from scratch; there will be no demo data or demo login."
fi
pnpm -F backend migrate

echo "--- Starting dev servers"
# dev:fast shares tsconfigs with the build:fast pre-build above; plain `dev`
# uses the full tsconfigs and would recompile everything in watch mode,
# restarting the backend on every emitted file
exec pnpm dev:fast
