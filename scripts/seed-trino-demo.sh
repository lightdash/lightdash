#!/bin/bash
set -e

dbt seed \
  --project-dir examples/trino-demo/dbt \
  --profiles-dir examples/trino-demo/profiles \
  --full-refresh
dbt run \
  --project-dir examples/trino-demo/dbt \
  --profiles-dir examples/trino-demo/profiles
