#!/bin/bash
set -e

dbt seed \
  --project-dir examples/compendio/dbt \
  --profiles-dir examples/compendio/profiles \
  --full-refresh
dbt run \
  --project-dir examples/compendio/dbt \
  --profiles-dir examples/compendio/profiles
