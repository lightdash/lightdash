Manage Docker dev environment. Args: (none) = show status & help, `start` = auto-detect and setup, `stop` = stop this instance, `stop-all` = stop everything, `reset` = reset db from snapshot, `rebuild` = full db rebuild, `snapshot [name]` = save db snapshot, `list-snapshots` = list snapshots, `restore <name>` = restore named snapshot, `list-instances` = show all instances.

**NEVER use `scripts/reset-db.sh`** — it requires a local `psql` client which is not available. Instead, use `docker exec` to run psql inside the container, then run migrate/seed via pnpm.

## Arguments

- **No arguments**: Show current status, assigned ports, and available commands. Read-only, safe to run anytime.
- **`start`**: Auto-detect state and run what's needed (fresh setup, migrations, or just start PM2). Uses shared base snapshot to bootstrap new instances fast.
- **`stop`**: Stop this instance's PM2 processes and PostgreSQL. Shared services stay running. Releases port slot.
- **`stop-all`**: Stop ALL instances — all PM2 processes, all per-instance PostgreSQL containers, shared services, and release all port slots. Use when shutting down for the day.
- **`reset`**: Restore database from this instance's volume snapshot (fast, ~3 seconds). Fails if no snapshot exists.
- **`rebuild`**: Full database reset from scratch (drop schema, migrate, seed, dbt). Takes a new snapshot when done.
- **`snapshot [name]`**: Save a named snapshot of the current database state. Name is optional — if omitted, auto-generate a descriptive name.
- **`list-snapshots`**: List all named snapshots with their creation dates and sizes.
- **`restore <name>`**: Restore the database from a named snapshot.
- **`list-instances`**: Show all active development instances and their port assignments.

---

## Step 0: Port Allocation (ALWAYS run first, for ALL commands)

Before any other work, claim a port slot and load env vars:

```bash
./scripts/dev-ports.sh claim
eval "$(./scripts/dev-ports.sh env)"
```

This gives you:
- `$LD_INSTANCE_ID` — instance name (worktree basename)
- `$LD_COMPOSE_PROJECT` — docker compose project name
- `$LD_VOLUME_PREFIX` / `$LD_CONTAINER_PREFIX` — prefixes for volumes and containers
- `$LD_PG_PORT` — per-instance PostgreSQL port
- `$PORT`, `$FE_PORT`, `$SCHEDULER_PORT`, `$DEBUG_PORT`, `$SDK_TEST_PORT`, `$SPOTLIGHT_PORT`, `$LIGHTDASH_PROMETHEUS_PORT` — per-instance app ports
- `$PGPORT`, `$SITE_URL`, `$S3_ENDPOINT`, `$HEADLESS_BROWSER_PORT`, `$EMAIL_SMTP_PORT` — app config (shared ports hardcoded: S3=9000, browser=3001, SMTP=1025)

**Shared services** (minio, headless-browser, mailpit, nats) run once on fixed ports via `docker-compose.dev.shared.yml`. Only PostgreSQL is per-instance via `docker-compose.dev.instance.yml`.

---

## No Arguments: Status & Help

Show the current state of this instance. Run port allocation (Step 0) first, then:

```bash
./scripts/dev-ports.sh show
```

Then run the **State Detection** checks below and present the results as a status summary. After showing status, list available commands:

```
Available commands:
  /docker-dev start          Auto-detect and start what's needed
  /docker-dev stop           Stop this instance (preserves data)
  /docker-dev stop-all       Stop ALL instances and shared services
  /docker-dev reset          Restore db from snapshot (~3s)
  /docker-dev rebuild        Full db rebuild from scratch
  /docker-dev snapshot       Save current db state
  /docker-dev list-snapshots List saved snapshots
  /docker-dev restore        Restore a named snapshot
  /docker-dev list-instances Show all active instances
```

---

## `list-instances`

```bash
./scripts/dev-ports.sh list
```

---

## State Detection

Run these checks to determine what needs to be done. **Run checks 1-5 and 10 in parallel first**, then checks 6-8 in parallel (they depend on Docker running):

```bash
# Check 1a: Shared Docker services running (minio, headless-browser, mailpit, nats)
SHARED_COUNT=$(docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps --format json 2>/dev/null | grep -c '"State":"running"' || true)
[ "$SHARED_COUNT" -ge 4 ] && echo "OK: Shared Docker services running ($SHARED_COUNT)" || echo "NEED: Start shared Docker services (only $SHARED_COUNT/4 running)"

# Check 1b: Per-instance PostgreSQL running
INSTANCE_COUNT=$(docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml ps --format json 2>/dev/null | grep -c '"State":"running"' || true)
[ "$INSTANCE_COUNT" -ge 1 ] && echo "OK: Instance PostgreSQL running" || echo "NEED: Start instance PostgreSQL"

# Check 2: Environment file exists
test -f .env.development.local && echo "OK: Env file exists" || echo "NEED: Create .env.development.local"

# Check 3: CLAUDE.local.md has local dev instructions
grep -q "## Starting Development Services" CLAUDE.local.md 2>/dev/null && echo "OK: CLAUDE.local.md has local dev instructions" || echo "NEED: Add local dev instructions to CLAUDE.local.md"

# Check 4: Dependencies installed
test -d node_modules && test -d packages/common/dist && echo "OK: Dependencies installed" || echo "NEED: Run pnpm install and build"

# Check 5: Python/dbt environment ready
test -f venv/bin/dbt && test -f venv/bin/dbt1.7 && echo "OK: Python/dbt ready" || echo "NEED: Set up Python venv"

# Check 6: Database migrated (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN 'migrated' ELSE 'not_migrated' END" 2>&1 | grep -q "^migrated" && echo "OK: Database migrated" || echo "NEED: Run migrations"

# Check 7: Database seeded (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM emails WHERE email='demo@lightdash.com') THEN 'seeded' ELSE 'not_seeded' END" 2>&1 | grep -q "^seeded" && echo "OK: Database seeded" || echo "NEED: Seed database"

# Check 8: dbt models built (requires Docker running)
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders') THEN 'built' ELSE 'not_built' END" 2>&1 | grep -q "^built" && echo "OK: dbt models built" || echo "NEED: Build dbt models"

# Check 9: Volume snapshot exists (for fast resets)
docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1 && echo "OK: Volume snapshot exists" || echo "NEED: No volume snapshot (will be created after setup completes)"

# Check 10: PM2 processes running for this instance
PM2_PROC=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
instance_procs = [p for p in procs if p['name'].startswith('${LD_INSTANCE_ID}-')]
if instance_procs:
    cwd = instance_procs[0]['pm2_env']['pm_cwd']
    root = cwd.rsplit('/packages/', 1)[0] if '/packages/' in cwd else cwd
    print(f'RUNNING:{root}')
else:
    other = [p for p in procs if not p['name'].startswith('${LD_INSTANCE_ID}-')]
    if other:
        print('OTHER')
    else:
        print('NONE')
" 2>/dev/null || echo "NONE")

case "$PM2_PROC" in
  RUNNING:$(pwd)) echo "OK: PM2 running for this instance from this worktree" ;;
  RUNNING:*) echo "MISMATCH: PM2 for instance ${LD_INSTANCE_ID} running from ${PM2_PROC#RUNNING:} but current worktree is $(pwd)" ;;
  OTHER) echo "OK: Other PM2 instances running (no conflict)" ;;
  NONE) echo "OK: No PM2 processes running for this instance" ;;
esac
```

**Interpreting results:**
- `OK:` = ready
- `NEED:` = setup step required
- `MISMATCH:` = ask user before switching PM2 to this worktree

### Database Check Notes

- Uses `docker exec ${LD_CONTAINER_PREFIX}-db-dev-1 psql` (no local psql needed)
- `information_schema` queries avoid "relation does not exist" errors
- `emails` table is checked for seed status (not `users` — Lightdash separates identity from emails)

---

## `start`: Auto-detect and Setup

Run State Detection first. For each `NEED:`, run the corresponding setup step below. If all checks show `OK:`, just start PM2.

### Start Docker Services

```bash
# Shared services (idempotent — safe if already running)
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d

# Per-instance PostgreSQL
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d
```

### Bootstrap from Shared Base Snapshot (fast path for new instances)

If this instance's database is empty (checks 6-8 show `NEED`) but a shared base snapshot exists, clone it instead of running full setup:

```bash
# Check if shared base snapshot exists
if docker volume inspect ld-shared_postgres_base >/dev/null 2>&1; then
  echo "Bootstrapping from shared base snapshot..."

  # Stop the db container
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev

  # Clone the shared base into this instance's volume
  docker run --rm \
    -v "ld-shared_postgres_base:/source:ro" \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
    alpine sh -c "rm -rf /target/* && cd /source && tar cf - . | (cd /target && tar xf -)"

  # Restart db
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev

  # Wait for postgres to be ready
  for i in $(seq 1 10); do
    docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres 2>/dev/null && break
    sleep 1
  done

  echo "Bootstrap complete — skipping migrations, seed, and dbt."
fi
```

**If the shared base snapshot does NOT exist**, this is the first instance — run the full setup (migrations, seed, dbt) below, then create the shared base snapshot at the end.

**After bootstrapping, skip directly to "Auto-Snapshot" and "Start PM2".**

### Create Environment File

```bash
cat > .env.development.local << EOF
# Local development overrides (instance: ${LD_INSTANCE_ID})
LD_INSTANCE_ID=${LD_INSTANCE_ID}
PGHOST=localhost
PGPORT=${LD_PG_PORT}
PORT=${PORT}
FE_PORT=${FE_PORT}
SCHEDULER_PORT=${SCHEDULER_PORT}
DEBUG_PORT=${DEBUG_PORT}
SDK_TEST_PORT=${SDK_TEST_PORT}
SPOTLIGHT_PORT=${SPOTLIGHT_PORT}
LIGHTDASH_PROMETHEUS_PORT=${LIGHTDASH_PROMETHEUS_PORT}
SITE_URL=http://localhost:${FE_PORT}
S3_ENDPOINT=http://localhost:9000
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=3001
INTERNAL_LIGHTDASH_HOST=http://localhost:${FE_PORT}

# Email - Mailpit (shared service, view emails at http://localhost:8025)
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USE_AUTH=false
EMAIL_SMTP_ALLOW_INVALID_CERT=true
EMAIL_SMTP_SENDER_NAME=Lightdash
EMAIL_SMTP_SENDER_EMAIL=noreply@lightdash.local

# Dev API access (auto-provisioned PAT from seed data)
LIGHTDASH_API_URL=http://localhost:${PORT}
LDPAT=ldpat_deadbeefdeadbeefdeadbeefdeadbeef
EOF
echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
```

### Add Local Dev Instructions to CLAUDE.local.md

Append to `CLAUDE.local.md` (creates file if it doesn't exist):

````bash
cat >> CLAUDE.local.md << EOF
# Local Development Environment

## Starting Development Services

Start the Docker services before running the dev server:

\`\`\`bash
/docker-dev start
\`\`\`

### PM2 Commands

\`\`\`bash
pnpm pm2:start          # Start all services
pnpm pm2:logs           # Stream all logs
pm2 logs ${LD_INSTANCE_ID}-api --lines 50 --nostream  # View last 50 API lines
pnpm pm2:status         # Check process status
pm2 restart ${LD_INSTANCE_ID}-api       # Restart only the API server
pm2 restart ${LD_INSTANCE_ID}-scheduler # Restart only the scheduler
pm2 restart ${LD_INSTANCE_ID}-frontend  # Restart only the frontend
\`\`\`

## Debugging

Use the \`/debug-local\` skill for comprehensive debugging combining PM2 logs, Spotlight traces, and browser automation.

Spotlight UI: http://localhost:${SPOTLIGHT_PORT}

## Database Snapshots

\`\`\`bash
/docker-dev snapshot bug-repro-12345   # Save current db state
/docker-dev list-snapshots             # See all saved snapshots
/docker-dev restore bug-repro-12345    # Restore a named snapshot (~3s)
/docker-dev reset                      # Restore the default snapshot
\`\`\`

## Access the Application

- **Frontend**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${PORT}
- **Demo login**: \`demo@lightdash.com\` / \`demo_password!\`
- **Mailpit** (email inbox): http://localhost:8025
- **Spotlight** (traces): http://localhost:${SPOTLIGHT_PORT}

## Service Ports (this instance)

| Service           | Port      | URL                                |
| ----------------- | --------- | ---------------------------------- |
| Frontend (Vite)   | ${FE_PORT}      | http://localhost:${FE_PORT}              |
| Backend (Express) | ${PORT}      | http://localhost:${PORT}              |
| Scheduler         | ${SCHEDULER_PORT}      |                                    |
| PostgreSQL        | ${LD_PG_PORT}      |                                    |
| MinIO             | 9000/9001 |                                    |
| Headless Browser  | 3001      |                                    |
| Mailpit           | 8025/1025 | http://localhost:8025         |
| Spotlight         | ${SPOTLIGHT_PORT}      | http://localhost:${SPOTLIGHT_PORT}             |
EOF
````

### Install Dependencies

```bash
pnpm install
pnpm -F common build && pnpm -F warehouses build
```

If `pnpm install` fails with canvas errors: https://github.com/Automattic/node-canvas?tab=readme-ov-file#installation

### Set Up Python/dbt

```bash
python3 -m venv venv
source venv/bin/activate
pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
ln -sf dbt venv/bin/dbt1.7
```

### Run Migrations (skip if bootstrapped)

```bash
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
```

### Seed Database (skip if bootstrapped)

```bash
export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend seed
```

### Build dbt Models (skip if bootstrapped)

```bash
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

### Create Shared Base Snapshot (first instance only)

After full setup completes (migrations + seed + dbt), create the shared base snapshot so future instances can bootstrap fast:

```bash
if ! docker volume inspect ld-shared_postgres_base >/dev/null 2>&1; then
  echo "Creating shared base snapshot for future instances..."
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
  docker volume create ld-shared_postgres_base
  docker run --rm \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
    -v "ld-shared_postgres_base:/snapshot" \
    alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
  echo "Shared base snapshot created."
fi
```

### Auto-Snapshot (per-instance)

After setup or bootstrap completes, take this instance's own snapshot for fast `/docker-dev reset`:

```bash
if ! docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
  docker volume create "${LD_VOLUME_PREFIX}_postgres_data_snapshot"
  docker run --rm \
    -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
    -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot" \
    alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
  docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
fi
```

### Start PM2

If PM2 shows `MISMATCH`, delete this instance's processes first:

```bash
pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" "${LD_INSTANCE_ID}-frontend" "${LD_INSTANCE_ID}-common-watch" "${LD_INSTANCE_ID}-warehouses-watch" "${LD_INSTANCE_ID}-sdk-test" "${LD_INSTANCE_ID}-spotlight" 2>/dev/null || true
```

Then start:

```bash
pnpm pm2:start
```

**Instance-specific PM2 commands:**

| Command | Description |
|---------|-------------|
| `pm2 logs ${LD_INSTANCE_ID}-api` | Stream API logs |
| `pm2 restart ${LD_INSTANCE_ID}-api` | Restart API |
| `pm2 restart ${LD_INSTANCE_ID}-scheduler` | Restart scheduler |
| `pm2 restart ${LD_INSTANCE_ID}-frontend` | Restart frontend |
| `pnpm pm2:status` | All process status |

### Access the Application

- **Frontend**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${PORT}
- **Demo login**: `demo@lightdash.com` / `demo_password!`

---

## `stop`: Stop This Instance

Stop this instance's services. Shared services and other instances are not affected.

```bash
pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" "${LD_INSTANCE_ID}-frontend" "${LD_INSTANCE_ID}-common-watch" "${LD_INSTANCE_ID}-warehouses-watch" "${LD_INSTANCE_ID}-sdk-test" "${LD_INSTANCE_ID}-spotlight" 2>/dev/null || true

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml down

./scripts/dev-ports.sh release
```

---

## `stop-all`: Stop Everything

Stop ALL instances, shared services, and release all port slots.

```bash
# Delete only Lightdash instance PM2 processes (not unrelated PM2 apps)
for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  INST_ID=$(python3 -c "import json; print(json.load(open('$f'))['instanceId'])")
  pm2 delete "${INST_ID}-api" "${INST_ID}-scheduler" "${INST_ID}-frontend" "${INST_ID}-common-watch" "${INST_ID}-warehouses-watch" "${INST_ID}-sdk-test" "${INST_ID}-spotlight" 2>/dev/null || true
done

for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  PROJECT=$(python3 -c "import json; print(json.load(open('$f'))['composeProject'])")
  docker compose -p "$PROJECT" -f docker/docker-compose.dev.instance.yml down 2>/dev/null || true
done

docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml down

for f in ~/.lightdash/dev-instances/*.json; do
  [ -f "$f" ] || continue
  rm "$f"
done

echo "All instances and shared services stopped."
```

---

## `reset`: Restore Database from Snapshot

```bash
if ! docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
  echo "ERROR: No snapshot found. Run /docker-dev start or /docker-dev rebuild first."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev

docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
  -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot:ro" \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres
```

---

## `rebuild`: Full Database Rebuild

Ensure env file, dependencies, and python/dbt are ready first (run pre-flight checks from `start`). Then:

```bash
# Remove instance snapshot (will be recreated after rebuild)
docker volume rm "${LD_VOLUME_PREFIX}_postgres_data_snapshot" 2>/dev/null || true

# Ensure Docker is running
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d

export PATH="$(pwd)/venv/bin:$PATH"
export DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo

docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -c 'drop schema public cascade; create schema public;'

PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate
PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend seed

PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
  "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
```

After completion, take an instance snapshot (see "Auto-Snapshot" in `start`). Also update the shared base snapshot so future instances get the latest:

```bash
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker volume rm ld-shared_postgres_base 2>/dev/null || true
docker volume create ld-shared_postgres_base
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
  -v "ld-shared_postgres_base:/snapshot" \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
```

---

## `snapshot [name]`: Save Database Snapshot

If no name provided, auto-generate from context (branch name, current work). Names must be alphanumeric with hyphens/underscores.

```bash
SNAPSHOT_NAME="<chosen-or-provided-name>"
if ! echo "$SNAPSHOT_NAME" | grep -qE '^[a-zA-Z0-9_-]+$'; then
  echo "ERROR: Invalid snapshot name."
  exit 1
fi

SNAPSHOT_VOLUME="${LD_VOLUME_PREFIX}_postgres_data_snapshot_${SNAPSHOT_NAME}"

if docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' already exists."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker volume create "$SNAPSHOT_VOLUME"
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
  -v "${SNAPSHOT_VOLUME}:/snapshot" \
  alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
```

---

## `list-snapshots`

```bash
docker volume ls --format '{{.Name}}' | grep "^${LD_VOLUME_PREFIX}_postgres_data_snapshot_" | while read vol; do
  name="${vol#${LD_VOLUME_PREFIX}_postgres_data_snapshot_}"
  created=$(docker volume inspect "$vol" --format '{{.CreatedAt}}' | cut -d'T' -f1)
  size=$(docker run --rm -v "${vol}:/data" alpine du -sh /data 2>/dev/null | cut -f1)
  echo "  $name  (created: $created, size: $size)"
done
```

Also check if the default snapshot exists: `docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot"`

---

## `restore <name>`

```bash
SNAPSHOT_NAME="<name>"
SNAPSHOT_VOLUME="${LD_VOLUME_PREFIX}_postgres_data_snapshot_${SNAPSHOT_NAME}"

if ! docker volume inspect "$SNAPSHOT_VOLUME" >/dev/null 2>&1; then
  echo "ERROR: Snapshot '$SNAPSHOT_NAME' not found."
  exit 1
fi

docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
docker run --rm \
  -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
  -v "${SNAPSHOT_VOLUME}:/snapshot:ro" \
  alpine sh -c "rm -rf /target/* && cd /snapshot && tar cf - . | (cd /target && tar xf -)"
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres
```

---

## Troubleshooting

### PostgreSQL Connection Refused

```bash
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml ps
```

### MinIO Connection Refused

```bash
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml ps | grep minio
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d
```

### Port Conflicts

```bash
./scripts/dev-ports.sh list
./scripts/dev-ports.sh gc
./scripts/dev-ports.sh release && ./scripts/dev-ports.sh claim
```
