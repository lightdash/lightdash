Start the Lightdash development environment. Automatically detects current state and runs setup/migrations as needed.

## Arguments

- **No arguments**: Auto-detect state and run what's needed (fresh setup, migrations, or just start)
- **`reset`**: Force reset database and rebuild dbt models

## State Detection

Before taking action, check the current environment state. Run these checks in order:

### Check 1: Docker Services Running?

```bash
docker compose -f docker/docker-compose.dev.mini.yml ps --format json 2>/dev/null | grep -q '"State":"running"'
```

If no services running → Need to start Docker services

### Check 2: Environment File Exists?

```bash
test -f .env.development.local
```

If missing → Need to create `.env.development.local`

### Check 3: Dependencies Installed?

```bash
test -d node_modules && test -d packages/common/dist
```

If missing → Need to run `pnpm install` and build packages

### Check 4: Python/dbt Environment Ready?

```bash
test -f venv/bin/dbt && test -f venv/bin/dbt1.7
```

If missing → Need to set up Python venv and install dbt

### Check 5: Database Migrated?

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres psql -c "SELECT 1 FROM sessions LIMIT 1" 2>/dev/null
```

If fails → Need to run migrations

### Check 6: Database Seeded?

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres psql -c "SELECT 1 FROM users WHERE email='demo@lightdash.com' LIMIT 1" 2>/dev/null
```

If fails → Need to seed database

### Check 7: dbt Models Built?

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres psql -c "SELECT 1 FROM jaffle.orders LIMIT 1" 2>/dev/null
```

If fails → Need to build dbt models

## Setup Steps (Run as Needed)

### Prerequisites (macOS)

If `pnpm install` fails with canvas errors:
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

### Start Docker Services

```bash
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d
```

Wait a few seconds for PostgreSQL to be ready.

### Create Environment File

Create `.env.development.local` with localhost overrides:
```bash
cat > .env.development.local << 'EOF'
# Local development overrides
PGHOST=localhost
S3_ENDPOINT=http://localhost:9000
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=3001
INTERNAL_LIGHTDASH_HOST=http://localhost:3000
EOF
```

Then add the DBT_DEMO_DIR with the actual path:
```bash
echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
```

### Install Dependencies

```bash
pnpm install
pnpm -F common build && pnpm -F warehouses build
```

### Set Up Python/dbt

```bash
python3 -m venv venv
source venv/bin/activate
pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
ln -sf venv/bin/dbt venv/bin/dbt1.7
```

### Run Migrations

```bash
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
```

### Seed Database

```bash
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend seed
```

### Build dbt Models

```bash
cd examples/full-jaffle-shop-demo/dbt
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt seed --profiles-dir ../profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt run --profiles-dir ../profiles
cd ../../..
```

## Reset Steps (When `reset` Argument Provided)

If the user passes `reset` as an argument, force a full database reset regardless of current state:

```bash
# Ensure Docker is running first
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d

# Set up environment
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

# Reset database, run migrations, and seed
PGHOST=localhost pnpx dotenv-cli -e .env.development -- ./scripts/reset-db.sh

# Rebuild dbt models
cd examples/full-jaffle-shop-demo/dbt
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt seed --profiles-dir ../profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt run --profiles-dir ../profiles
cd ../../..
```

## Start Development Server

Once all checks pass or setup is complete:

```bash
export PGHOST=localhost S3_ENDPOINT=http://localhost:9000 HEADLESS_BROWSER_HOST=localhost HEADLESS_BROWSER_PORT=3001
pnpx dotenv-cli -e .env.development -- pnpm dev
```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Demo login**: `demo@lightdash.com` / `demo_password!`

## Service Ports Reference

| Service           | Port      | Description                   |
| ----------------- | --------- | ----------------------------- |
| Frontend (Vite)   | 3000      | React development server      |
| Backend (Express) | 8080      | API server                    |
| PostgreSQL        | 5432      | Database                      |
| MinIO             | 9000/9001 | S3-compatible storage/console |
| Headless Browser  | 3001      | PDF/image generation          |

## Troubleshooting

### Canvas Installation Fails (macOS)

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
rm -rf node_modules
pnpm install
```

### PostgreSQL Connection Refused

Wait for Docker services to fully start:
```bash
docker compose -f docker/docker-compose.dev.mini.yml ps
```

All services should show "running" state.

### "relation does not exist" Errors

- **`sessions`**: Migrations not run → This command will detect and run them
- **`jaffle.orders`**: dbt models not built → This command will detect and build them

### Redirected to /register Instead of Login

Database not seeded → This command will detect and seed it

### dbt Command Not Found

Python venv not set up → This command will detect and set it up
