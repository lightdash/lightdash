#!/usr/bin/env bash
# Creates and seeds 'lightdash_template', a PostgreSQL template database.
# Used as a fast-copy source for branch-based databases via:
#   CREATE DATABASE <branch_db> TEMPLATE lightdash_template
#
# Usage: ./scripts/setup-template-db.sh
set -e

TEMPLATE_DB="lightdash_template"

echo "Creating '$TEMPLATE_DB' database if it doesn't exist..."
psql -c "SELECT 1 FROM pg_database WHERE datname = '$TEMPLATE_DB'" \
  | grep -q 1 || psql -c "CREATE DATABASE $TEMPLATE_DB"

echo "Resetting schema..."
psql -d "$TEMPLATE_DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

echo "Running migrations..."
PGDATABASE="$TEMPLATE_DB" pnpm -F backend migrate

echo "Seeding Lightdash..."
PGDATABASE="$TEMPLATE_DB" pnpm -F backend seed

echo "Seeding Jaffle Shop..."
PGDATABASE="$TEMPLATE_DB" ./scripts/seed-jaffle.sh

echo "Marking '$TEMPLATE_DB' as a PostgreSQL template..."
psql -c "UPDATE pg_database SET datistemplate = true WHERE datname = '$TEMPLATE_DB'"

echo "Done — '$TEMPLATE_DB' is ready."
