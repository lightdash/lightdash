#!/bin/bash
set -e

# Migrate db, invoking knex directly: production boot must not depend on
# package-manager runtime semantics (pnpm 11's verifyDepsBeforeRun default
# turned `pnpm -F backend migrate-production` into a full reinstall at boot)
cd /usr/app/packages/backend
./node_modules/.bin/knex migrate:latest --knexfile dist/knexfile.js

# Run prod
exec "$@"
