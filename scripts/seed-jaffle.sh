#!/bin/bash
set -e

dbt seed \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles \
  --full-refresh
dbt run \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles
