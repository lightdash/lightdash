Manage Docker dev environment. Args: (none) = start, `reset` = reset db from snapshot, `hard-reset` = full rebuild, `stop` = stop services, `snapshot [name]` = save named snapshot (auto-names if omitted), `list-snapshots` = list saved snapshots, `use-snapshot <name>` = restore a named snapshot.

**NEVER use `scripts/reset-db.sh`** — it requires a local `psql` client which is not available. Instead, use `docker exec docker-db-dev-1 psql` to run SQL commands inside the container, then run migrate/seed via pnpm.

## Arguments

- **No arguments**: Auto-detect state and run what's needed (fresh setup, migrations, or just start). Automatically snapshots the db volume after initial setup.
- **`reset`**: Restore database from volume snapshot (fast, ~3 seconds). Fails if no snapshot exists — run initial setup or `hard-reset` first.
- **`hard-reset`**: Purge the snapshot volume, then do a full database reset (drop schema, migrate, seed, dbt). Automatically takes a new snapshot when done.
- **`stop`**: Stop Docker services (preserves data volumes)
- **`snapshot [name]`**: Save a named snapshot of the current database state. Name is optional — if omitted, auto-generate a descriptive name based on what the user is currently working on (e.g., `pre-migration-auth-refactor`, `after-seed-with-test-orgs`). The name must be alphanumeric with hyphens/underscores only. Creates a Docker volume named `docker_postgres_data_snapshot_<name>`.
- **`list-snapshots`**: List all named snapshots with their creation dates and sizes.
- **`use-snapshot <name>`**: Restore the database from a named snapshot. Does NOT overwrite the default snapshot used by `reset`.

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

# Check 9: Volume snapshot exists (for fast resets)
docker volume inspect docker_postgres_data_snapshot >/dev/null 2>&1 && echo "OK: Volume snapshot exists" || echo "NEED: No volume snapshot (will be created after setup completes)"
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

If `pnpm install` fails with canvas errors - read this guide: https://github.com/Automattic/node-canvas?tab=readme-ov-file#installation

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

# Dev API access (auto-provisioned PAT from seed data)
# Not used by the app — only for agent/skill convenience (e.g. debug-local curl commands)
LIGHTDASH_API_URL=http://localhost:8080
LDPAT=ldpat_deadbeefdeadbeefdeadbeefdeadbeef
EOF
```

Then add the DBT_DEMO_DIR with the actual path:

```bash
echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
```

### Add Local Dev Instructions to CLAUDE.local.md

**IMPORTANT: You MUST ask the user for permission before modifying CLAUDE.local.md.** Use AskUserQuestion to confirm:

> "The docker-dev setup can add PM2 commands and debugging instructions to CLAUDE.local.md. This includes PM2 start/stop/restart commands and guidance on using the /debug-local skill with Spotlight. May I add these instructions?"

**Only proceed with this step after the user confirms.** If declined, skip this step and continue with the remaining setup.

Once permission is granted, append local development instructions to `CLAUDE.local.md` (creates file if it doesn't exist, appends if it does):

````bash
cat >> CLAUDE.local.md << 'EOF'
# Local Development Environment

## Starting Development Services

### Prerequisites: Docker Services

Start the Docker services (PostgreSQL, MinIO, headless browser, Mailpit) before running the dev server:

```bash
/docker-dev
````

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

**When facing problems, the first step is always to use the `/debug-local` skill** to understand what's happening. This skill provides a comprehensive debugging workflow.

Use the `/debug-local` skill for comprehensive debugging workflows combining:

- **PM2 logs**: `pnpm pm2:logs:api` to view API server logs with trace IDs
- **Spotlight MCP**: Query traces and errors programmatically via `mcp__spotlight__search_traces`, `mcp__spotlight__get_traces`, `mcp__spotlight__search_errors`
- **Browser automation**: Use Chrome DevTools MCP (`mcp__chrome-devtools__*`) for UI debugging

Spotlight UI is available at http://localhost:8969 when running `pnpm pm2:start`.

## Database Snapshots

Snapshots let you save and restore the exact state of the local PostgreSQL database. Use them to:

- **Preserve a bug reproduction**: After reproducing a bug, snapshot the db so you can return to that exact state later.
- **Safeguard before mutations**: Before running migrations, seed changes, or manual SQL that alters data, take a snapshot so you can revert instantly.

### Quick Commands

```bash
/docker-dev snapshot bug-repro-12345   # Save current db state with a name
/docker-dev snapshot                   # Save with auto-generated name
/docker-dev list-snapshots             # See all saved snapshots
/docker-dev use-snapshot bug-repro-12345  # Restore a named snapshot (~3s)
/docker-dev reset                      # Restore the default snapshot (from initial setup)
```

### Tips

- Snapshot names must be alphanumeric with hyphens/underscores only (e.g., `pre-migration`, `with-broken-org-data`)
- The default snapshot (used by `reset`) is separate from named snapshots — named snapshots don't overwrite it
- The db container is briefly stopped during snapshot/restore to ensure data consistency, then automatically restarted

## Running API Tests Locally

The `packages/api-tests` vitest suite is designed for CI (runs against a preview deployment). To run locally against Docker:

```bash
cd packages/api-tests
PGHOST=localhost \
DBT_PROJECT_DIR=$(pwd)/../../../examples/full-jaffle-shop-demo/dbt \
npx vitest run
```

### Required env vars

| Variable | Default (CI) | Local value | Why |
|----------|-------------|-------------|-----|
| `PGHOST` | `db-dev` | `localhost` | Tests create projects with this as the warehouse host |
| `DBT_PROJECT_DIR` | `/usr/app/dbt` | Absolute path to `examples/full-jaffle-shop-demo/dbt` | Tests trigger dbt refresh on new projects |
| `MCP_ENABLED` | `false` | `true` (in `.env.development.local`) | MCP server tests need the endpoint enabled |

### PM2 env var gotcha

PM2 caches environment variables from `ecosystem.config.js` at `pm2 start` time. If you add new env vars to `.env.development.local`:

- `pnpm pm2:restart:api` — **will NOT pick up new vars** (reuses cached env)
- `npx pm2 delete all && pnpm pm2:start` — **will pick up new vars** (reloads ecosystem config)
EOF

````

### Install Dependencies

```bash
pnpm install
pnpm -F common build && pnpm -F warehouses build
````

### Set Up Python/dbt

```bash
python3 -m venv venv
source venv/bin/activate
pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
ln -sf dbt venv/bin/dbt1.7
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

### Auto-Snapshot After Initial Setup

After all setup steps complete successfully and no snapshot exists yet, **automatically take a volume snapshot** (see "Taking a Snapshot" below). This ensures future `/docker-dev reset` calls use the fast path.

## Volume Snapshot & Restore

### Volume Names

The Docker Compose project name determines the volume prefix. The compose file is at `docker/docker-compose.dev.mini.yml`, so Docker prefixes volumes with `docker_`:

- **Live volume**: `docker_postgres_data`
- **Snapshot volume**: `docker_postgres_data_snapshot`

### Taking a Snapshot

Run this after initial setup completes or after a hard-reset. **The db container MUST be stopped before snapshotting** to ensure data consistency (PostgreSQL needs a clean shutdown):

```bash
# Stop only the db container (clean PostgreSQL shutdown)
docker compose -f docker/docker-compose.dev.mini.yml stop db-dev

# Remove any existing snapshot volume
docker volume rm docker_postgres_data_snapshot 2>/dev/null || true

# Create fresh snapshot volume
docker volume create docker_postgres_data_snapshot

# Clone the data using a temporary Alpine container
docker run --rm \
  -v docker_postgres_data:/source:ro \
  -v docker_postgres_data_snapshot:/snapshot \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"

# Restart the db container
docker compose -f docker/docker-compose.dev.mini.yml start db-dev
```

## Reset Steps (When `reset` Argument Provided)

Restore the database from the volume snapshot. This is fast (~3 seconds).

**If no snapshot exists, tell the user** to run `/docker-dev` (initial setup) or `/docker-dev hard-reset` first. Do NOT fall back to a full reset automatically.

```bash
# Verify snapshot exists
if ! docker volume inspect docker_postgres_data_snapshot >/dev/null 2>&1; then
  echo "ERROR: No snapshot volume found. Run /docker-dev (initial setup) or /docker-dev hard-reset first."
  exit 1
fi

# Stop only the db container
docker compose -f docker/docker-compose.dev.mini.yml stop db-dev

# Wipe the live volume and restore from snapshot
docker run --rm \
  -v docker_postgres_data:/target \
  -v docker_postgres_data_snapshot:/snapshot:ro \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"

# Restart the db container
docker compose -f docker/docker-compose.dev.mini.yml start db-dev
```

Wait a few seconds for PostgreSQL to start accepting connections, then verify:

```bash
docker exec docker-db-dev-1 pg_isready -U postgres
```

## Named Snapshot Steps (When `snapshot [name]` Argument Provided)

Save the current database state as a named snapshot. This is useful for preserving specific states (e.g., after importing test data, before a migration, etc.).

**If no name is provided**, auto-generate one based on the current context. Use these signals to pick a good name:
- The current git branch name (e.g., `charliedowler/auth-refactor` → `auth-refactor`)
- What the user has been working on in this conversation (e.g., "after adding test orgs" → `after-test-orgs`)
- Prefix with `pre-` or `post-` if the snapshot is being taken before/after a specific operation (e.g., `pre-migration`, `post-seed`)
- Keep it short, descriptive, and lowercase with hyphens (e.g., `clean-seed`, `with-custom-roles`, `pre-auth-migration`)

```bash
# Validate the snapshot name (alphanumeric, hyphens, underscores only)
SNAPSHOT_NAME="<chosen-or-provided-name>"
if ! echo "$SNAPSHOT_NAME" | grep -qE '^[a-zA-Z0-9_-]+$'; then
  echo "ERROR: Snapshot name must contain only alphanumeric characters, hyphens, and underscores."
  exit 1
fi

SNAPSHOT_VOLUME="docker_postgres_data_snapshot_${SNAPSHOT_NAME}"

# Check if a snapshot with this name already exists
if docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' already exists. Remove it first or choose a different name."
  echo "To overwrite, run: docker volume rm $SNAPSHOT_VOLUME"
  exit 1
fi

# Stop the db container for a consistent snapshot
docker compose -f docker/docker-compose.dev.mini.yml stop db-dev

# Create the named snapshot volume
docker volume create "$SNAPSHOT_VOLUME"

# Clone the data
docker run --rm \
  -v docker_postgres_data:/source:ro \
  -v "${SNAPSHOT_VOLUME}:/snapshot" \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"

# Restart the db container
docker compose -f docker/docker-compose.dev.mini.yml start db-dev
```

Report the snapshot name and confirm it was created successfully.

## List Snapshots Steps (When `list-snapshots` Argument Provided)

List all named snapshots that have been saved.

```bash
# List all Docker volumes matching the named snapshot pattern
docker volume ls --format '{{.Name}}' | grep '^docker_postgres_data_snapshot_' | while read vol; do
  # Strip the prefix to get the snapshot name
  name="${vol#docker_postgres_data_snapshot_}"
  # Get creation date and size
  created=$(docker volume inspect "$vol" --format '{{.CreatedAt}}' | cut -d'T' -f1)
  # Get actual disk size using a temporary container
  size=$(docker run --rm -v "${vol}:/data" alpine du -sh /data 2>/dev/null | cut -f1)
  echo "  $name  (created: $created, size: $size)"
done
```

If no snapshots are found (no output), report: "No named snapshots found. Use `/docker-dev snapshot <name>` to create one."

Also note whether the default snapshot (`docker_postgres_data_snapshot`) exists, as a separate line.

## Use Snapshot Steps (When `use-snapshot <name>` Argument Provided)

Restore the database from a named snapshot. This does NOT affect the default snapshot used by `reset`.

```bash
SNAPSHOT_NAME="$1"
SNAPSHOT_VOLUME="docker_postgres_data_snapshot_${SNAPSHOT_NAME}"

# Verify the named snapshot exists
if ! docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' not found. Use /docker-dev list-snapshots to see available snapshots."
  exit 1
fi

# Stop the db container
docker compose -f docker/docker-compose.dev.mini.yml stop db-dev

# Wipe the live volume and restore from the named snapshot
docker run --rm \
  -v docker_postgres_data:/target \
  -v "${SNAPSHOT_VOLUME}:/snapshot:ro" \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"

# Restart the db container
docker compose -f docker/docker-compose.dev.mini.yml start db-dev
```

Wait for PostgreSQL to be ready:

```bash
docker exec docker-db-dev-1 pg_isready -U postgres
```

Report which snapshot was restored and that the database is ready.

## Hard Reset Steps (When `hard-reset` Argument Provided)

Purge the snapshot volume, then do a full database reset from scratch. Automatically takes a new snapshot when done.

### Pre-flight: Verify Environment Configuration

Before doing any destructive work, verify that the local configuration files are correct. **Run these checks in parallel:**

```bash
# Check 1: .env.development.local exists and has required variables
REQUIRED_VARS="PGHOST S3_ENDPOINT HEADLESS_BROWSER_HOST HEADLESS_BROWSER_PORT DBT_DEMO_DIR"
MISSING_VARS=""
if [ ! -f .env.development.local ]; then
  echo "NEED: .env.development.local does not exist"
else
  for var in $REQUIRED_VARS; do
    grep -q "^${var}=" .env.development.local || MISSING_VARS="$MISSING_VARS $var"
  done
  if [ -n "$MISSING_VARS" ]; then
    echo "NEED: .env.development.local is missing required variables:$MISSING_VARS"
  else
    echo "OK: .env.development.local has all required variables"
  fi
fi

# Check 2: CLAUDE.local.md has local dev instructions
grep -q "## Starting Development Services" CLAUDE.local.md 2>/dev/null && echo "OK: CLAUDE.local.md has local dev instructions" || echo "NEED: CLAUDE.local.md missing local dev instructions"

# Check 3: Python/dbt environment ready
test -f venv/bin/dbt && test -f venv/bin/dbt1.7 && echo "OK: Python/dbt ready" || echo "NEED: Set up Python venv"

# Check 4: Dependencies installed
test -d node_modules && test -d packages/common/dist && echo "OK: Dependencies installed" || echo "NEED: Run pnpm install and build"
```

**If any checks show `NEED:`**, fix them before proceeding with the reset:

- **Missing `.env.development.local`**: Create it using the "Create Environment File" steps above
- **Missing variables in `.env.development.local`**: Add the missing variables. The required variables and their expected values are:
  - `PGHOST=localhost`
  - `S3_ENDPOINT=http://localhost:9000`
  - `HEADLESS_BROWSER_HOST=localhost`
  - `HEADLESS_BROWSER_PORT=3001`
  - `DBT_DEMO_DIR=<absolute-path-to-repo>/examples/full-jaffle-shop-demo`
- **Missing CLAUDE.local.md instructions**: Run the "Add Local Dev Instructions to CLAUDE.local.md" step (ask user for permission first)
- **Missing Python/dbt**: Run the "Set Up Python/dbt" steps
- **Missing dependencies**: Run the "Install Dependencies" steps

### Perform Hard Reset

Once all pre-flight checks pass:

```bash
# Purge existing snapshot
docker volume rm docker_postgres_data_snapshot 2>/dev/null || true

# Ensure Docker is running first
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d

# Set up environment
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

# Drop and recreate the public schema via docker exec (NEVER use scripts/reset-db.sh — it requires local psql)
docker exec docker-db-dev-1 psql -U postgres -c 'drop schema public cascade; create schema public;'

# Run migrations and seed
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend seed

# Rebuild dbt models
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

**After hard-reset completes, automatically take a snapshot** using the snapshot steps below.

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

| Command                      | Description                      |
| ---------------------------- | -------------------------------- |
| `pnpm pm2:logs`              | Stream all process logs          |
| `pnpm pm2:status`            | Show process status table        |
| `pnpm pm2:restart:api`       | Restart only the API server      |
| `pnpm pm2:restart:scheduler` | Restart only the scheduler       |
| `pnpm pm2:restart:frontend`  | Restart only the frontend        |
| `pnpm pm2:monit`             | Interactive monitoring dashboard |
| `pnpm pm2:stop`              | Stop all processes               |
| `pnpm pm2:delete`            | Stop and remove all processes    |

### Alternative: Traditional Dev Server

If the user specifically requests `pnpm dev`, use the traditional single-terminal approach:

```bash
export PGHOST=localhost S3_ENDPOINT=http://localhost:9000 HEADLESS_BROWSER_HOST=localhost HEADLESS_BROWSER_PORT=3001
pnpx dotenv-cli -e .env.development -- pnpm dev
```

**Why PM2 is preferred:**

| Feature                    | `pnpm dev`         | `pnpm pm2:start`        |
| -------------------------- | ------------------ | ----------------------- |
| Process visibility         | Interleaved output | Individual status/logs  |
| Restart individual service | Not possible       | `pnpm pm2:restart:api`  |
| Memory/CPU monitoring      | Not available      | `pnpm pm2:monit`        |
| Log management             | Terminal only      | Persistent log files    |
| Background running         | No                 | Yes (processes persist) |
| Best for                   | Quick terminal dev | LLM control, debugging  |

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Demo login**: `demo@lightdash.com` / `demo_password!`

## Service Ports Reference

| Service           | Port      | Description                      |
| ----------------- | --------- | -------------------------------- |
| Frontend (Vite)   | 3000      | React development server         |
| Backend (Express) | 8080      | API server                       |
| Scheduler         | 8081      | Background job processor         |
| PostgreSQL        | 5432      | Database                         |
| MinIO             | 9000/9001 | S3-compatible storage/console    |
| Headless Browser  | 3001      | PDF/image generation             |
| Mailpit           | 8025/1025 | Email testing Web UI/SMTP server |

## Troubleshooting

### Canvas Installation Fails (macOS)

If `pnpm install` fails with canvas errors - read this guide: https://github.com/Automattic/node-canvas?tab=readme-ov-file#installation

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
