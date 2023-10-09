#!/bin/bash

# Skip puppeteer download
export PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies & build common package
yarn install
yarn common-build
yarn warehouses-build
yarn cli-build

# Setup dbt
dbt seed \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles \
  --full-refresh
dbt run \
  --project-dir examples/full-jaffle-shop-demo/dbt \
  --profiles-dir examples/full-jaffle-shop-demo/profiles


# Setup the database
yarn workspace backend migrate

yarn workspace backend seed

# Optional: Run Lightdash frontend and backend in dev mode
yarn dev
