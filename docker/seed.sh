#!/bin/bash
set -e

# Setup dbt jaffle shop project
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles --full-refresh
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles

# Setup dev database
yarn workspace backend rollback-all
yarn workspace backend migrate
yarn workspace backend seed
