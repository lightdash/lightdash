# Agent Harness Implementation Plan

## Audit Summary

### What Already Exists (and how we leverage it)

| Area | Existing Asset | Harness Use |
|------|---------------|-------------|
| **Docker infra** | `docker/docker-compose.dev.mini.yml` (db-dev, minio, headless-browser, mailpit) | Base our compose file on this; same images, same init scripts |
| **DB templating** | `scripts/setup-template-db.sh` + `setup-branch-db.sh` | Instant per-agent DB creation via `CREATE DATABASE ... TEMPLATE` |
| **Seeding** | 13 seed files + `seed-jaffle.sh` for dbt models | Baked into template DB; each agent gets a pre-seeded copy |
| **PM2 dev workflow** | `ecosystem.config.js` managing 6 processes | Parameterize per agent with port offsets and namespaced process names |
| **Env vars** | `.env.development` + `.env.development.local` pattern | Generate per-agent `.env.agent.<id>` with correct ports and DB name |
| **Health check** | `GET /api/v1/health` endpoint | Used by launch script to confirm agent stack is ready |
| **Test infra** | Jest (backend/common), Vitest (frontend), Cypress (E2E) | Wire into verify.sh stages; use `test:dev:nowatch` for fast inner loop |
| **Type checking** | Backend has `incremental: true`; all packages have `composite: true` | `pnpm -F backend typecheck` is fastest; run per-package in parallel |
| **Linting** | ESLint + oxfmt across all packages | `pnpm -F <pkg> lint` per package in parallel |
| **CI workflow** | `ai-agent-integration-tests.yml` with pg_dump/pg_restore pattern | Reference for GitHub Actions workflow design |
| **Vite proxy** | `packages/frontend/vite.config.ts` reads `FE_PORT` and `PORT` env vars | Port isolation works via env vars alone — no code changes needed |
| **dbt profiles** | `examples/full-jaffle-shop-demo/profiles/profiles.yml` reads `PGHOST`/`PGPORT`/`PGDATABASE` from env | Agent-specific DB connection works via env vars |
| **CLAUDE.md context** | 49 CLAUDE.md files across the repo providing module-level guidance | Agents inherit codebase context automatically |
| **Skills/commands** | 5 skills + 3 commands in `.claude/skills/` and `.claude/commands/` | Some conflict with agent ports — need overrides (see §Skill Conflicts) |

### Key Architecture Decisions

**1. App runs natively, not in Docker.** The current dev workflow runs only infrastructure (db, minio, headless-browser, mailpit) in Docker and the app via PM2 on the host. The harness follows this pattern because:
- Hot-reload is faster without Docker volume mounts
- The agent edits files directly in the worktree (no bind-mount latency)
- node_modules stay on the host filesystem
- Matches how developers actually work

**2. Shared infrastructure, isolated databases.** All agents share one PostgreSQL instance (separate databases), one MinIO (separate buckets), one headless-browser, one mailpit. This cuts RAM from ~2.5GB/agent to ~1GB/agent for infra.

**3. Database templating for instant provisioning.** PostgreSQL's `CREATE DATABASE ... TEMPLATE` copies the entire template database (with migrations, seeds, dbt models) in milliseconds. No per-agent migration/seed runs needed.

**4. Port isolation via deterministic offset.** Each agent gets ports derived from `AGENT_ID * 10`:

| Service | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
|---------|---------|---------|---------|---------|---------|
| Frontend (Vite) | 3010 | 3020 | 3030 | 3040 | 3050 |
| Backend API | 8010 | 8020 | 8030 | 8040 | 8050 |
| Scheduler | 8011 | 8021 | 8031 | 8041 | 8051 |
| Node Debugger | 9210 | 9220 | 9230 | 9240 | 9250 |

Shared infra (one instance, non-conflicting ports):

| Service | Host Port |
|---------|-----------|
| PostgreSQL | 15432 |
| MinIO S3 API | 19000 |
| MinIO Console | 19001 |
| Headless Browser | 13001 |
| Mailpit SMTP | 11025 |
| Mailpit Web UI | 18025 |

---

## Prerequisites

The following must be available on the host before `setup-infra.sh` runs. The script validates each prerequisite and fails fast with a clear message if any are missing.

### 1. Node.js + pnpm

```bash
# Verify
node --version   # v20+
pnpm --version   # v9.15.5+
```

### 2. pnpm install + package builds

`setup-infra.sh` checks for `node_modules/` and `packages/common/dist/` and runs these if missing:

```bash
pnpm install
pnpm -F common build && pnpm -F warehouses build
```

This must happen before migrations (which import from common) and before the Vite dev server.

### 3. Python/dbt environment

`setup-infra.sh` checks for `venv/bin/dbt1.7` and sets it up if missing:

```bash
python3 -m venv venv
source venv/bin/activate
pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
ln -sf venv/bin/dbt venv/bin/dbt1.7
```

The `seed-jaffle.sh` script calls `dbt1.7` and expects it on `PATH`. The ecosystem config already adds `venv/bin` to PATH.

### 4. Docker

```bash
docker compose version  # Docker Compose V2
```

### 5. psql client

Needed by `setup-infra.sh` for template DB creation. The existing `setup-template-db.sh` uses `psql` directly (not `docker exec`), so it must be available on the host.

```bash
psql --version
```

---

## Skill & Command Conflict Analysis

Several existing skills and commands hardcode ports/URLs that conflict with agent port offsets. The `CLAUDE.agent.md` file must address each one.

### Conflicts

| Skill/Command | Hardcoded Value | Agent Conflict | Mitigation |
|---------------|----------------|----------------|------------|
| `/docker-dev` | Ports 3000, 5432, 8080; container `docker-db-dev-1`; writes `CLAUDE.local.md` | Would start a **separate** Docker stack on conflicting ports | `CLAUDE.agent.md` must say: "NEVER run `/docker-dev`. Your infrastructure is managed by the agent harness." |
| `/debug-local` | `localhost:3000`, `localhost:8080`, `localhost:8969` | Points to wrong ports; Spotlight is not running | `CLAUDE.agent.md` must provide agent-specific URLs and say: "Spotlight is not available. Use `agent-cli.sh <id> logs` instead." |
| `/har-replay` | Starts replay server on port 3001 | Port 3001 doesn't conflict directly, but Vite proxy assumptions break | `CLAUDE.agent.md` must say: "Do not run `/har-replay` — it assumes standard port layout." |
| `CLAUDE.local.md` | May exist with `PGHOST=localhost`, `HEADLESS_BROWSER_PORT=3001`, etc. | Values from `.env.development.local` could leak into agent env if not overridden | `launch.sh` generates a self-contained `.env.agent.<id>` that does **not** source `.env.development.local` |

### Safe Skills (no conflicts)

| Skill/Command | Why Safe |
|---------------|----------|
| `/frontend-style-guide` | Pure style guidance, no ports/URLs |
| `/investigate-pylon` | External service investigation, no local infra |
| `/ld-permissions` | Code reference guide, no local infra |
| `/add-context-file` | Creates CLAUDE.md files, no infra dependency |
| `/cs-bugs` | GitHub API query, no local infra |

### Environment File Precedence

The existing `ecosystem.config.js` loads env files in this order:
1. `.env.development` (base)
2. `.env.development.local` (overrides)

The agent ecosystem config (`ecosystem.agent.<id>.config.cjs`) must load **only**:
1. `agent-harness/.env.agent.<id>` (complete, self-contained)

This avoids inheriting stale values from `.env.development.local` (which may set `PGHOST=localhost`, `PGPORT=5432`, etc. for the standard dev setup).

---

## Files to Create

All files go in `agent-harness/` at the repo root.

### 1. `agent-harness/docker-compose.agent.yml`

Shared infrastructure for all agents. Based on `docker-compose.dev.mini.yml` with these changes:
- Non-standard host ports (15432, 19000, etc.) to avoid conflicts with normal dev
- `pg_stat_statements` enabled via postgres command args
- Resource limits on each service
- Health checks on postgres
- No `container_name` hardcoding

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: always
    ports:
      - "${AGENT_DB_PORT:-15432}:5432"
    environment:
      POSTGRES_PASSWORD: password
    volumes:
      - agent-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
    command:
      - postgres
      - -c
      - shared_preload_libraries=pg_stat_statements
      - -c
      - pg_stat_statements.track=all
    shm_size: 256m
    deploy:
      resources:
        limits:
          memory: 1G

  minio:
    image: coollabsio/minio:latest
    ports:
      - "${AGENT_MINIO_PORT:-19000}:9000"
      - "${AGENT_MINIO_CONSOLE_PORT:-19001}:9001"
    volumes:
      - agent-minio-data:/minio/data
      - ../docker/init-minio.sh:/init-minio.sh
    entrypoint: /init-minio.sh
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
      MINIO_DEFAULT_BUCKETS: default,results
      MINIO_BROWSER: "off"
    deploy:
      resources:
        limits:
          memory: 256M

  headless-browser:
    image: ghcr.io/browserless/chromium:v2.38.2
    restart: always
    ports:
      - "${AGENT_BROWSER_PORT:-13001}:3000"
    shm_size: 512m
    deploy:
      resources:
        limits:
          memory: 1G

  mailpit:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - "${AGENT_MAILPIT_WEB_PORT:-18025}:8025"
      - "${AGENT_MAILPIT_SMTP_PORT:-11025}:1025"
    environment:
      MP_MAX_MESSAGES: 5000
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1

volumes:
  agent-db-data:
  agent-minio-data:
```

### 2. `agent-harness/setup-infra.sh`

One-time setup of shared infrastructure. Idempotent.

Steps:
1. **Validate prerequisites**: Check for `node`, `pnpm`, `python3`, `docker`, `psql`. Fail fast with clear message if any missing.
2. **Install dependencies** (if needed): Check for `node_modules/` and `packages/common/dist/`. If missing, run:
   ```bash
   pnpm install
   pnpm -F common build && pnpm -F warehouses build
   ```
3. **Set up Python/dbt** (if needed): Check for `venv/bin/dbt1.7`. If missing, create venv and install dbt.
4. **Start Docker Compose** stack with project name `agent-infra`.
5. **Wait for postgres** health check (poll `pg_isready`, timeout 30s).
6. **Check if template database exists** (`SELECT 1 FROM pg_database WHERE datname = 'lightdash_template'`).
7. If template doesn't exist:
   a. Create the database
   b. Run migrations: `PGHOST=localhost PGPORT=15432 PGDATABASE=lightdash_template pnpm -F backend migrate`
   c. Run seeds: `PGHOST=localhost PGPORT=15432 PGDATABASE=lightdash_template pnpm -F backend seed`
   d. Run dbt models: `PGHOST=localhost PGPORT=15432 PGUSER=postgres PGPASSWORD=password PGDATABASE=lightdash_template PATH="$(pwd)/venv/bin:$PATH" ./scripts/seed-jaffle.sh`
   e. Mark as PostgreSQL template: `UPDATE pg_database SET datistemplate = true WHERE datname = 'lightdash_template'`
8. **Print status**: Template DB ready, Docker services healthy, port assignments.

**Why we don't reuse `setup-template-db.sh` directly**: It uses bare `psql` without explicit `PGHOST`/`PGPORT`, so it would connect to the default PostgreSQL (port 5432) rather than the agent infra PostgreSQL (port 15432). The setup-infra script replicates the same logic with explicit connection params.

### 3. `agent-harness/launch.sh`

Per-agent launch. Takes `<agent-id>` (1-5). Idempotent.

Steps:
1. Validate AGENT_ID (integer 1-9)
2. Ensure shared infra is running (call `setup-infra.sh` if needed)
3. Compute port offsets:
   ```bash
   FE_PORT=$((3000 + AGENT_ID * 10))
   API_PORT=$((8000 + AGENT_ID * 10))
   SCHEDULER_PORT=$((8000 + AGENT_ID * 10 + 1))
   DEBUG_PORT=$((9200 + AGENT_ID * 10))
   ```
4. Create agent database: `CREATE DATABASE agent_<id> TEMPLATE lightdash_template` (via `psql -h localhost -p 15432 -U postgres`)
5. Create MinIO bucket `agent-<id>` (via MinIO HTTP API on port 19000)
6. If `--worktree` flag: create git worktree at `~/worktrees/agent-<id>/`
7. Generate `.env.agent.<id>` from `env.template` (using `envsubst`)
8. Generate PM2 ecosystem config `ecosystem.agent.<id>.config.cjs` from template
9. Start PM2 processes: `pm2 start ecosystem.agent.<id>.config.cjs`
10. Poll `http://localhost:${API_PORT}/api/v1/health` until ready (timeout 120s — first build is slow)
11. Print agent URLs and status

### 4. `agent-harness/teardown.sh`

Per-agent teardown. Takes `<agent-id>`.

Steps:
1. Stop and delete PM2 processes with `agent-<id>-` prefix
2. Unmark template if needed, then drop database `agent_<id>` (disconnect active sessions first via `pg_terminate_backend`)
3. Remove MinIO bucket `agent-<id>` (force, including contents)
4. Remove `.env.agent.<id>` and `ecosystem.agent.<id>.config.cjs`
5. If worktree exists: remove it (`git worktree remove --force`)

Safety: Only touches resources with the agent's ID. Cannot affect other agents or the shared infra.

### 5. `agent-harness/agent-cli.sh`

Namespaced CLI wrapper. Reads `AGENT_ID` from environment or first argument.

Commands:
```
agent-cli.sh <id> logs [service]     # PM2 logs (api|scheduler|frontend|common|warehouses)
agent-cli.sh <id> psql [query]       # Run SQL against agent's database
agent-cli.sh <id> stats              # CPU/memory for agent's PM2 processes
agent-cli.sh <id> url                # Print frontend and API URLs
agent-cli.sh <id> restart [service]  # Restart specific PM2 process
agent-cli.sh <id> status             # PM2 process status table
agent-cli.sh <id> health             # curl /api/v1/health
agent-cli.sh <id> slow-queries       # Top 10 slow queries from pg_stat_statements
agent-cli.sh <id> exec <cmd...>      # Run command in db container
```

### 6. `agent-harness/verify.sh`

Progressive verification pipeline. Reads `AGENT_ID` from environment.

Stages (exit early on failure by default):
1. **typecheck** — `pnpm -F common typecheck & pnpm -F backend typecheck & pnpm -F frontend typecheck` in parallel
2. **lint** — `pnpm -F common lint & pnpm -F backend lint & pnpm -F frontend lint` in parallel
3. **generate-api** — `pnpm generate-api` then `git diff --exit-code packages/backend/src/generated/` to detect stale API specs. Only runs if files in `packages/backend/src/controllers/` were modified (checked via `git diff --name-only`).
4. **test-unit** — `pnpm -F backend test:dev:nowatch` (only changed files) + `pnpm -F common test` + `pnpm -F frontend test` (uses `vitest run`)
5. **test-full** (only with `--full`) — `pnpm test` via turbo
6. **smoke** (only with `--full`) — `curl http://localhost:${API_PORT}/api/v1/health`

Output format (JSON to stdout, human-readable to stderr):
```json
{
  "status": "pass|fail",
  "stages": [
    {"name": "typecheck", "status": "pass", "duration_ms": 3200},
    {"name": "lint", "status": "fail", "duration_ms": 1800,
     "first_error": "packages/backend/src/services/Foo.ts:42 ..."}
  ],
  "total_duration_ms": 5000
}
```

### 7. `agent-harness/env.template`

Template for per-agent `.env` files. Substituted by `launch.sh` using `envsubst`.

This file is **self-contained** — it does NOT rely on `.env.development` or `.env.development.local`. It includes every env var the app needs, with agent-specific values substituted in.

Key variables that vary per agent:
```bash
# Database — agent-specific database on shared PostgreSQL
PGHOST=localhost
PGPORT=15432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=agent_${AGENT_ID}

# Ports — deterministic per agent
PORT=${API_PORT}
FE_PORT=${FE_PORT}
SITE_URL=http://localhost:${FE_PORT}

# S3/MinIO — agent-specific bucket on shared MinIO
S3_ENDPOINT=http://localhost:19000
S3_REGION=us-east-1
S3_BUCKET=agent-${AGENT_ID}
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

# Headless browser — shared instance
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=13001

# Email — shared Mailpit
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=11025
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USE_AUTH=false
EMAIL_SMTP_ALLOW_INVALID_CERT=true
EMAIL_SMTP_SENDER_NAME=Lightdash
EMAIL_SMTP_SENDER_EMAIL=noreply@lightdash.local

# App config
LIGHTDASH_SECRET=agent-${AGENT_ID}-secret
LIGHTDASH_MODE=development
LIGHTDASH_LOG_LEVEL=debug
LIGHTDASH_QUERY_MAX_LIMIT=5000
SECURE_COOKIES=false
TRUST_PROXY=false

# Feature flags
SCHEDULER_ENABLED=false
GROUPS_ENABLED=true
EXTENDED_USAGE_ANALYTICS=true

# Disabled external services (not needed for agent work)
RUDDERSTACK_WRITE_KEY=
RUDDERSTACK_DATA_PLANE_URL=
POSTHOG_PROJECT_API_KEY=
INTERCOM_APP_ID=
SENTRY_DSN=
SENTRY_RELEASE=
```

### 8. `agent-harness/ecosystem.agent.template.cjs`

PM2 config template. `launch.sh` generates a concrete version per agent by substituting `AGENT_ID`, `API_PORT`, `FE_PORT`, `DEBUG_PORT`, and `WORKTREE_ROOT`.

Processes (prefix `agent-<id>-`):
- `agent-<id>-api` — Backend API (`PORT` from env, `--inspect=0.0.0.0:${DEBUG_PORT}`)
- `agent-<id>-frontend` — Vite dev server (`FE_PORT` from env)
- `agent-<id>-common-watch` — `tsc --build --watch` for common package
- `agent-<id>-warehouses-watch` — `tsc --build --watch` for warehouses package

Key differences from `ecosystem.config.js`:
- Loads `.env.agent.<id>` instead of `.env.development` + `.env.development.local`
- Process names are prefixed with `agent-<id>-` for PM2 namespace isolation
- `cwd` points to worktree root (if `--worktree` was used) or repo root
- Spotlight process omitted (not needed for agents)
- Scheduler process omitted (disabled by default; if needed, set `SCHEDULER_ENABLED=true` in env and add manually)

### 9. `agent-harness/CLAUDE.agent.md`

Agent instructions file. Placed in the agent's working directory (worktree root or repo root).

Generated per-agent by `launch.sh` with actual port values substituted in. Contents:

```markdown
# Agent Environment

## Your Instance

- **Agent ID**: ${AGENT_ID}
- **Frontend**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${API_PORT}
- **Database**: agent_${AGENT_ID} on localhost:15432
- **Login**: demo@lightdash.com / demo_password!

## Managing Your Stack

Always use the agent CLI:

    agent-harness/agent-cli.sh ${AGENT_ID} status    # Check processes
    agent-harness/agent-cli.sh ${AGENT_ID} logs api   # View API logs
    agent-harness/agent-cli.sh ${AGENT_ID} restart api # Restart API
    agent-harness/agent-cli.sh ${AGENT_ID} health      # Health check
    agent-harness/agent-cli.sh ${AGENT_ID} psql "SELECT ..."  # Query DB

## Verification Workflow

Run after every change:

    AGENT_ID=${AGENT_ID} agent-harness/verify.sh

Run before declaring done:

    AGENT_ID=${AGENT_ID} agent-harness/verify.sh --full

## Existing CLAUDE.md Files

This repo has ~49 CLAUDE.md context files in subdirectories providing
module-level guidance. They are loaded automatically by Claude Code when
you work in those directories. Key ones:

- packages/backend/src/controllers/CLAUDE.md — TSOA controller patterns
- packages/backend/src/services/CLAUDE.md — Service layer patterns
- packages/backend/src/database/CLAUDE.md — Knex migrations & models
- packages/backend/src/config/CLAUDE.md — Environment config system
- packages/frontend/CLAUDE.md — Frontend style guide (Mantine v8)
- .context/PERMISSIONS.md — Full CASL permissions reference

## Prohibited Actions

- NEVER run `/docker-dev` — your infra is managed by the agent harness
- NEVER run `/har-replay` — it assumes standard port layout
- NEVER run `docker compose` directly — use `agent-cli.sh`
- NEVER modify `ecosystem.config.js` or `.env.development*` files
- NEVER hardcode port numbers — always read from environment
- NEVER disable or skip tests to make verify.sh pass

## Safe Skills

These skills work normally in agent mode:
- `/frontend-style-guide` — Mantine v8 styling guidance
- `/ld-permissions` — CASL authorization reference
- `/add-context-file` — Create CLAUDE.md in a directory
- `/investigate-pylon` — Pylon ticket investigation
- `/cs-bugs` — List open customer support bugs

## Debugging (replaces /debug-local)

Spotlight is not available in agent mode. Use these instead:

    agent-harness/agent-cli.sh ${AGENT_ID} logs api       # API logs
    agent-harness/agent-cli.sh ${AGENT_ID} logs frontend   # Vite logs
    agent-harness/agent-cli.sh ${AGENT_ID} psql "..."      # SQL queries

## Definition of Done

1. `verify.sh --full` passes (all stages green)
2. Feature works at http://localhost:${FE_PORT}
3. New code has test coverage
4. No hardcoded ports, URLs, or credentials
```

### 10. `agent-harness/justfile`

Human-friendly wrapper:
- `just agent setup` — One-time infra setup
- `just agent launch <id>` — Spin up agent
- `just agent teardown <id>` — Destroy agent
- `just agent verify <id>` — Run verification
- `just agent verify-full <id>` — Full verification
- `just agent status` — All agent statuses
- `just agent launch-all [n]` — Launch N agents
- `just agent teardown-all` — Destroy all
- `just agent cli <id> <command...>` — CLI shortcut

### 11. `.github/workflows/agent-task.yml`

GitHub Actions workflow triggered by `agent-task` issue label.

Steps:
1. Checkout repo
2. Setup pnpm + node (v20)
3. Setup Python 3.10 + dbt:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0'
   ln -sf venv/bin/dbt venv/bin/dbt1.7
   ```
4. `pnpm install` + `pnpm -F common build && pnpm -F warehouses build`
5. Start PostgreSQL + MinIO services (via workflow service containers)
6. Run migrations, seeds, and dbt models
7. Start backend + frontend via PM2
8. Wait for health check
9. Run Claude Code in headless mode with issue body as prompt
10. Run `verify.sh --full`
11. If passing: create PR with results
12. Comment on issue with outcome

---

## Sequence of Implementation

### Phase 0: Prerequisites Validation
Before any harness code, manually verify the prerequisite chain works:
1. `pnpm install && pnpm -F common build && pnpm -F warehouses build`
2. Python venv + dbt installation
3. Docker Compose starts cleanly on non-standard ports
4. `psql` can connect to `localhost:15432`
5. Migrations + seeds + dbt models run successfully against port 15432

This phase produces no files — it's a manual smoke test.

### Phase 1: Docker Compose + Infra Setup
Create `docker-compose.agent.yml` and `setup-infra.sh`. Goal: `./agent-harness/setup-infra.sh` starts shared infra, installs prerequisites if needed, and creates the template database.

### Phase 2: Agent Launch/Teardown
Create `env.template`, `ecosystem.agent.template.cjs`, `launch.sh`, `teardown.sh`. Goal: `./agent-harness/launch.sh 1` produces a running Lightdash instance on agent-1 ports.

### Phase 3: Agent CLI
Create `agent-cli.sh`. Goal: `./agent-harness/agent-cli.sh 1 status` shows agent-1 processes.

### Phase 4: Verification Pipeline
Create `verify.sh`. Goal: `AGENT_ID=1 ./agent-harness/verify.sh` returns structured JSON with typecheck/lint/test results.

### Phase 5: Agent Instructions + Justfile
Create `CLAUDE.agent.md` template and `justfile`. Goal: `just agent launch 1` works end-to-end and generates a complete `CLAUDE.agent.md` in the working directory.

### Phase 6: Multi-Agent Isolation Test
Launch agents 1 and 2. Verify isolation: different DBs, different ports, different PM2 processes. Teardown agent 1, verify agent 2 is unaffected. Teardown agent 2.

### Phase 7: GitHub Actions Workflow
Create `.github/workflows/agent-task.yml`. Goal: labelling an issue triggers an agent run.

---

## Resource Estimates

| Component | RAM per agent | Shared RAM |
|-----------|--------------|------------|
| Backend API (Node.js) | 300-500 MB | - |
| Frontend (Vite) | 300-500 MB | - |
| Common/Warehouses watchers | 100-200 MB | - |
| **Per-agent subtotal** | **~700 MB - 1.2 GB** | |
| PostgreSQL (shared) | - | 500 MB - 1 GB |
| MinIO (shared) | - | 128-256 MB |
| Headless Browser (shared) | - | 500 MB - 1 GB |
| Mailpit (shared) | - | 64 MB |
| **Shared subtotal** | | **~1.2 - 2.3 GB** |

**3 agents**: ~4-6 GB total. Comfortable on 16 GB machine.
**5 agents**: ~6-8 GB total. Needs 16+ GB machine.

---

## Appendix: CLAUDE.md Files with Hardcoded Ports

These existing CLAUDE.md files contain hardcoded port references. They are informational (not executable), so they don't break agent isolation, but agents should be aware that the ports mentioned in them refer to the standard dev setup, not agent ports.

| File | Hardcoded Values |
|------|-----------------|
| `docker/CLAUDE.md` | 8080, 3000, 9090, 5432, 9000, 9001, 8025, 1025 |
| `docker/dev-configs/CLAUDE.md` | 9090, 2222 |
| `packages/cli/CLAUDE.md` | `localhost:3000` |
| `packages/iframe-test-app/src/CLAUDE.md` | `localhost:3000`, `localhost:5173` |
| `packages/backend/src/config/CLAUDE.md` | `postgres://localhost/test` |

The `CLAUDE.agent.md` includes a note that port references in subdirectory CLAUDE.md files refer to the standard dev setup and should be mentally substituted with the agent's actual ports.
