#!/bin/bash
# Runs inside the Okteto dev container (see okteto.dev.yaml). Installs
# dependencies, builds the packages the backend imports as dist, migrates the
# database, then starts the same watchers as local dev. The warm image provides
# node_modules and incremental build state; each pod restart starts from it.
set -euo pipefail
cd /usr/app

# Snapshotted project settings use the paths from the preview image.
if [ ! -e /usr/app/dbt ] && [ ! -L /usr/app/dbt ]; then
    ln -s /usr/app/examples/full-jaffle-shop-demo/dbt /usr/app/dbt
fi
if [ ! -e /usr/app/profiles ] && [ ! -L /usr/app/profiles ]; then
    ln -s /usr/app/examples/full-jaffle-shop-demo/profiles /usr/app/profiles
fi

echo "--- Installing dependencies"
pnpm --filter . --filter backend... --filter @lightdash/frontend... \
    install --prefer-offline

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
# The snapshot can contain migrations added to main after this branch diverged.
ALLOW_MISSING_MIGRATIONS=true pnpm -F backend migrate

echo "--- Starting dev servers"
# dev:fast shares tsconfigs with the build:fast pre-build above; plain `dev`
# uses the full tsconfigs and would recompile everything in watch mode,
# restarting the backend on every emitted file
exec pnpm dev:fast
