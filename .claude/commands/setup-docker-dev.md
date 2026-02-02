Set up Lightdash local development environment from scratch.

This command guides through the full setup process. It runs the app outside Docker while using Docker for supporting services (PostgreSQL, MinIO, headless browser).

## Prerequisites Check

Before starting, verify these are installed:
- **pnpm** v9.15.5+ (`pnpm --version`)
- **Docker** and Docker Compose (`docker --version`)
- **Node.js** v20+ (`node --version`)
- **Python 3** (`python3 --version`)

If pnpm is missing: `corepack enable && corepack prepare pnpm@9.15.5 --activate`

## Step 1: Install Native Dependencies (macOS)

The `canvas` package requires native libraries:
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

## Step 2: Install Node Dependencies

```bash
pnpm install
```

## Step 3: Start Docker Services

Start PostgreSQL, MinIO (S3-compatible storage), and headless browser:
```bash
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d
```

Wait a few seconds for services to be ready, especially PostgreSQL.

## Step 4: Create Local Environment File

Create `.env.development.local` with localhost overrides (the base `.env.development` uses Docker container hostnames):
```bash
cat > .env.development.local << 'EOF'
# Local development overrides
PGHOST=localhost
S3_ENDPOINT=http://localhost:9000
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=3001
INTERNAL_LIGHTDASH_HOST=http://localhost:3000
DBT_DEMO_DIR=/path/to/lightdash/examples/full-jaffle-shop-demo
EOF
```

**Important**: Update `DBT_DEMO_DIR` in the file to the actual absolute path (e.g., `/Users/username/projects/lightdash/examples/full-jaffle-shop-demo`).

## Step 5: Build Dependency Packages

The common and warehouses packages must be built before running the backend:
```bash
pnpm -F common build && pnpm -F warehouses build
```

## Step 6: Set Up Python/dbt Environment

dbt is required for seeding demo data:
```bash
# Create virtual environment
python3 -m venv venv

# Install dbt with compatible protobuf version
source venv/bin/activate
pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'

# Create versioned symlink (Lightdash uses dbt1.7 command)
ln -sf venv/bin/dbt venv/bin/dbt1.7
```

## Step 7: Run Database Migrations

```bash
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
```

## Step 8: Seed Demo Data

**Important**: This step is required for the app to function. Without it, you'll be redirected to `/register` instead of seeing the login page.

```bash
# Add venv to PATH for dbt access
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

# Seed Lightdash database (creates demo user, org, project metadata)
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend seed

# Load raw data and build dbt models
cd examples/full-jaffle-shop-demo/dbt
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt seed --profiles-dir ../profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  dbt run --profiles-dir ../profiles
cd ../../..
```

## Step 9: Start Development Server

```bash
export PGHOST=localhost S3_ENDPOINT=http://localhost:9000 HEADLESS_BROWSER_HOST=localhost HEADLESS_BROWSER_PORT=3001
pnpx dotenv-cli -e .env.development -- pnpm dev
```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Demo login**: `demo@lightdash.com` / `demo_password!`

## Service Ports Reference

| Service          | Port      | Description                   |
| ---------------- | --------- | ----------------------------- |
| Frontend (Vite)  | 3000      | React development server      |
| Backend (Express)| 8080      | API server                    |
| PostgreSQL       | 5432      | Database                      |
| MinIO            | 9000/9001 | S3-compatible storage/console |
| Headless Browser | 3001      | PDF/image generation          |
