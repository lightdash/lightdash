#!/bin/bash
set -e

# Setup symlink for github codespaces mount
ln -s /workspaces/lightdash /usr/app

# Setup dbt jaffle shop project
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles

# Install dependencies
yarn install
yarn common-build

# Setup dev database
yarn workspace backend rollback-all
yarn workspace backend migrate
yarn workspace backend seed

# Run dev enviroment
yarn dev &

# Keep container live
exec sleep infinity
