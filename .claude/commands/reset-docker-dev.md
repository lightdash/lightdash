Reset the Lightdash development database and rebuild dbt models.

Use this when you need a clean slate or when demo data is missing/corrupted.

## What This Does

1. Drops and recreates the Lightdash database schema
2. Runs all migrations
3. Seeds the database with demo user and project metadata
4. Rebuilds dbt models (jaffle shop demo data)

## Prerequisites

Make sure Docker services are running:
```bash
docker compose -f docker/docker-compose.dev.mini.yml ps
```

If not running:
```bash
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d
```

## Step 1: Reset Database Schema and Seed

```bash
# Set up environment (required for dbt commands)
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

# Reset Lightdash schema, run migrations, and seed
PGHOST=localhost pnpx dotenv-cli -e .env.development -- ./scripts/reset-db.sh
```

## Step 2: Build dbt Models

**Important**: This step is required for charts to work. Without it, you'll get errors like `relation "jaffle.orders" does not exist`.

```bash
cd examples/full-jaffle-shop-demo/dbt
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt seed --profiles-dir ../profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt run --profiles-dir ../profiles
cd ../../..
```

## Verification

After reset, you should be able to:
- Access http://localhost:3000 (if dev server is running)
- Log in with `demo@lightdash.com` / `demo_password!`
