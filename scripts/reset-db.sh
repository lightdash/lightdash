#!/bin/bash
set -e

# delete public schema on db
psql -c 'drop schema public cascade; create schema public;'

# migrate
pnpm --filter backend migrate
# seed
pnpm --filter backend seed

echo "All done"
