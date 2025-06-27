#!/bin/bash
set -e

dbt1.7 deps \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles

dbt1.7 seed \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles \
  --full-refresh
dbt1.7 run \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles \
  --full-refresh \
  --exclude fanouts_sales_targets # TODO: remove once we fix SQL in package
