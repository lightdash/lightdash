#!/bin/bash
set -e

# delete public schema on db
psql -c 'drop schema public cascade; create schema public;'

# migrate
yarn workspace backend migrate
# seed
yarn workspace backend seed

echo "All done"