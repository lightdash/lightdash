#!/bin/bash
set -e
dbt seed --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
dbt run --project-dir /usr/app/dbt --profiles-dir /usr/app/profiles
yarn install
yarn common-build
exec yarn dev
