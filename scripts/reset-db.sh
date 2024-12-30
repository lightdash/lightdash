#!/bin/bash
set -e

# delete public schema on db
psql -c 'drop schema public cascade; create schema public;'

# migrate
pnpm -F backend migrate
# seed
pnpm -F backend seed

echo "All done"
