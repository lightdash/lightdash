#!/bin/bash
set -e
dbt seed --project-dir ${DBT_PROJECT_DIR} --profiles-dir ${DBT_PROFILES_DIR}
dbt run --project-dir ${DBT_PROJECT_DIR} --profiles-dir ${DBT_PROFILES_DIR}
exec "$@"
