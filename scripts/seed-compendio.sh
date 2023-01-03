#!/bin/bash
set -e
dbt deps \
  --project-dir examples/schemas/compendio \
  --profiles-dir examples/schemas/profiles
dbt seed \
  --project-dir examples/schemas/compendio \
  --profiles-dir examples/schemas/profiles \
  --full-refresh
dbt run \
  --project-dir examples/schemas/compendio \
  --profiles-dir examples/schemas/profiles
