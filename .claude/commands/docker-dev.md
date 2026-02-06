Manage Docker dev environment. Args: (none) = start, `reset` = reset db, `stop` = stop services.

## Arguments

- **No arguments**: Auto-detect state and run what's needed (fresh setup, migrations, or just start)
- **`reset`**: Force reset database and rebuild dbt models
- **`stop`**: Stop Docker services (preserves data volumes)

## State Detection

Before taking action, check the current environment state. **Run these checks in parallel** to quickly determine what needs to be done:

### All Checks (run in parallel)

```bash
# Check 1: All Docker services running (db, minio, headless-browser, mailpit)
RUNNING_COUNT=$(docker compose -f docker/docker-compose.dev.mini.yml ps --format json 2>/dev/null | grep -c '"State":"running"' || true)
[ "$RUNNING_COUNT" -ge 4 ] && echo "OK: All Docker services running ($RUNNING_COUNT)" || echo "NEED: Start Docker services (only $RUNNING_COUNT/4 running)"

# Check 2: Environment file exists
test -f .env.development.local && echo "OK: Env file exists" || echo "NEED: Create .env.development.local"

# Check 3: CLAUDE.local.md has local dev instructions
grep -q "## Starting Development Services" CLAUDE.local.md 2>/dev/null && echo "OK: CLAUDE.local.md has local dev instructions" || echo "NEED: Add local dev instructions to CLAUDE.local.md"

# Check 4: Dependencies installed
test -d node_modules && test -d packages/common/dist && echo "OK: Dependencies installed" || echo "NEED: Run pnpm install and build"

# Check 5: Python/dbt environment ready
test -f venv/bin/dbt && test -f venv/bin/dbt1.7 && echo "OK: Python/dbt ready" || echo "NEED: Set up Python venv"

# Check 6: Database migrated (requires Docker running)
docker exec docker-db-dev-1 psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN 'migrated' ELSE 'not_migrated' END" 2>&1 | grep -q "^migrated" && echo "OK: Database migrated" || echo "NEED: Run migrations"

# Check 7: Database seeded (requires Docker running)
docker exec docker-db-dev-1 psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM emails WHERE email='demo@lightdash.com') THEN 'seeded' ELSE 'not_seeded' END" 2>&1 | grep -q "^seeded" && echo "OK: Database seeded" || echo "NEED: Seed database"

# Check 8: dbt models built (requires Docker running)
docker exec docker-db-dev-1 psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders') THEN 'built' ELSE 'not_built' END" 2>&1 | grep -q "^built" && echo "OK: dbt models built" || echo "NEED: Build dbt models"
```

**How to interpret the output:**
- Lines starting with `NEED:` indicate setup steps that must be run
- Lines starting with `OK:` indicate that component is ready
- If all lines show `OK:`, the environment is ready - just start the dev server
- Database checks (6-8) use `docker exec` to run psql inside the PostgreSQL container
- Run checks 1-5 in parallel first, then checks 6-8 in parallel (they depend on Docker running)

### Why Use `docker exec` for Database Checks?

PostgreSQL runs inside a Docker container, so we use `docker exec docker-db-dev-1 psql` instead of a local `psql` client. This:
- Works without requiring psql installed locally
- Uses the exact same connection the app uses
- Fails clearly if Docker isn't running (which is the first thing to fix anyway)

### Database Check Details

**Why `information_schema` instead of direct queries?**
- Checking `SELECT 1 FROM tablename` can fail with "relation does not exist" errors
- Using `information_schema.tables` always succeeds and returns a clean result
- The `CASE WHEN EXISTS(...)` pattern returns deterministic strings for easy parsing

**Why check `emails` table for seeded status?**
- The demo user's email (`demo@lightdash.com`) is in the `emails` table, not `users`
- The `users` table doesn't have an `email` column (Lightdash separates user identity from emails)
- There's also a `jaffle.users` dbt model that would cause ambiguity

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

# Email - Mailpit (view emails at http://localhost:8025)
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USE_AUTH=false
EMAIL_SMTP_ALLOW_INVALID_CERT=true
EMAIL_SMTP_SENDER_NAME=Lightdash
EMAIL_SMTP_SENDER_EMAIL=noreply@lightdash.local
EOF
```

Then add the DBT_DEMO_DIR with the actual path:
```bash
echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
```

### Add Local Dev Instructions to CLAUDE.local.md

**IMPORTANT: You MUST ask the user for permission before modifying CLAUDE.local.md.** Use AskUserQuestion to confirm:

> "The docker-dev setup can add PM2 commands and debugging instructions to CLAUDE.local.md. This includes PM2 start/stop/restart commands and guidance on using the /debug skill with Spotlight. May I add these instructions?"

**Only proceed with this step after the user confirms.** If declined, skip this step and continue with the remaining setup.

Once permission is granted, append local development instructions to `CLAUDE.local.md` (creates file if it doesn't exist, appends if it does):
```bash
cat >> CLAUDE.local.md << 'EOF'
# Local Development Environment

## Starting Development Services

### Prerequisites: Docker Services

Start the Docker services (PostgreSQL, MinIO, headless browser, Mailpit) before running the dev server:

```bash
/docker-dev
```

### PM2 (Recommended for LLM Development)

PM2 provides process isolation, individual service restarts, and monitoring:

```bash
pnpm pm2:start          # Start all services
pnpm pm2:logs           # Stream all logs
pnpm pm2:logs:api --lines 50 --nostream  # View last 50 lines without streaming
pnpm pm2:status         # Check process status
pnpm pm2:restart:api    # Restart only the API server
pnpm pm2:monit          # Interactive monitoring dashboard
pnpm pm2:stop           # Stop all services
```

## Debugging

**When facing problems, the first step is always to use the `/debug` skill** to understand what's happening. This skill provides a comprehensive debugging workflow.

Use the `/debug` skill for comprehensive debugging workflows combining:

-   **PM2 logs**: `pnpm pm2:logs:api` to view API server logs with trace IDs
-   **Spotlight MCP**: Query traces and errors programmatically via `mcp__spotlight__search_traces`, `mcp__spotlight__get_traces`, `mcp__spotlight__search_errors`
-   **Browser automation**: Use Chrome DevTools MCP (`mcp__chrome-devtools__*`) for UI debugging

Spotlight UI is available at http://localhost:8969 when running `pnpm pm2:start`.
EOF
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

**Important**: Use the full path to `dbt` from the venv to avoid "command not found" errors:

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
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
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

## Stop Steps (When `stop` Argument Provided)

If the user passes `stop` as an argument, stop both the Lightdash app and Docker services:

```bash
# Stop PM2 processes first
pnpm pm2:stop

# Then stop Docker services
docker compose -f docker/docker-compose.dev.mini.yml down
```

This stops PM2 processes (keeps them registered for quick restart) and removes Docker containers but **preserves the data volumes** (database data, MinIO files).

To verify everything is stopped:
```bash
pnpm pm2:status
docker compose -f docker/docker-compose.dev.mini.yml ps
```

**Note**: When `stop` is passed, do not proceed to "Start Development Server" - just stop services and report the status.

## Start Development Server

Once all checks pass or setup is complete, start the dev server using PM2:

```bash
pnpm pm2:start
```

PM2 provides process isolation, individual service restarts, and monitoring - ideal for LLM-driven development.

**Useful PM2 commands:**

| Command                      | Description                        |
| ---------------------------- | ---------------------------------- |
| `pnpm pm2:logs`              | Stream all process logs            |
| `pnpm pm2:status`            | Show process status table          |
| `pnpm pm2:restart:api`       | Restart only the API server        |
| `pnpm pm2:restart:scheduler` | Restart only the scheduler         |
| `pnpm pm2:restart:frontend`  | Restart only the frontend          |
| `pnpm pm2:monit`             | Interactive monitoring dashboard   |
| `pnpm pm2:stop`              | Stop all processes                 |
| `pnpm pm2:delete`            | Stop and remove all processes      |

### Alternative: Traditional Dev Server

If the user specifically requests `pnpm dev`, use the traditional single-terminal approach:

```bash
export PGHOST=localhost S3_ENDPOINT=http://localhost:9000 HEADLESS_BROWSER_HOST=localhost HEADLESS_BROWSER_PORT=3001
pnpx dotenv-cli -e .env.development -- pnpm dev
```

**Why PM2 is preferred:**

| Feature                    | `pnpm dev`          | `pnpm pm2:start`               |
| -------------------------- | ------------------- | ------------------------------ |
| Process visibility         | Interleaved output  | Individual status/logs         |
| Restart individual service | Not possible        | `pnpm pm2:restart:api`         |
| Memory/CPU monitoring      | Not available       | `pnpm pm2:monit`               |
| Log management             | Terminal only       | Persistent log files           |
| Background running         | No                  | Yes (processes persist)        |
| Best for                   | Quick terminal dev  | LLM control, debugging         |

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Demo login**: `demo@lightdash.com` / `demo_password!`

## Service Ports Reference

| Service           | Port      | Description                       |
| ----------------- | --------- | --------------------------------- |
| Frontend (Vite)   | 3000      | React development server          |
| Backend (Express) | 8080      | API server                        |
| Scheduler         | 8081      | Background job processor          |
| PostgreSQL        | 5432      | Database                          |
| MinIO             | 9000/9001 | S3-compatible storage/console     |
| Headless Browser  | 3001      | PDF/image generation              |
| Mailpit           | 8025/1025 | Email testing Web UI/SMTP server  |

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

### MinIO Connection Refused / Query Results Error

If queries fail with `ECONNREFUSED` when uploading results, MinIO isn't running:
```bash
# Check if MinIO is running
docker compose -f docker/docker-compose.dev.mini.yml ps | grep minio

# If not running, start all services
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d
```

MinIO is required for storing async query results. The app will fail to load query results without it.

### "relation does not exist" Errors

- **`sessions`**: Migrations not run → This command will detect and run them
- **`jaffle.orders`**: dbt models not built → This command will detect and build them

### Redirected to /register Instead of Login

Database not seeded → This command will detect and seed it

### dbt Command Not Found

Python venv not set up → This command will detect and set it up
