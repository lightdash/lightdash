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
| **Test infra** | Jest (backend/common), Vitest (frontend/integration), Cypress (E2E) | Wire into verify.sh stages; use `test:dev:nowatch` for fast inner loop |
| **Type checking** | Backend has `incremental: true`; all packages have `composite: true` | `pnpm -F backend typecheck` is fastest; run per-package in parallel |
| **Linting** | ESLint + oxfmt across all packages | `pnpm -F <pkg> lint` per package in parallel |
| **CI workflow** | `ai-agent-integration-tests.yml` with pg_dump/pg_restore pattern | Reference for GitHub Actions workflow design |

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
1. Start Docker Compose stack with project name `agent-infra`
2. Wait for postgres health check
3. Check if template database exists
4. If not: create it by running migrations, seeds, and dbt models (using `docker compose exec` to run psql, and host-side pnpm commands with `PGHOST=localhost PGPORT=15432`)
5. Mark as PostgreSQL template (`datistemplate = true`)
6. Print status

### 3. `agent-harness/launch.sh`

Per-agent launch. Takes `<agent-id>` (1-5). Idempotent.

Steps:
1. Validate AGENT_ID
2. Ensure shared infra is running (call `setup-infra.sh` if needed)
3. Compute port offsets: `FE_PORT=$((3000 + AGENT_ID * 10))`, `API_PORT=$((8000 + AGENT_ID * 10))`, etc.
4. Create agent database: `CREATE DATABASE agent_<id> TEMPLATE lightdash_template` (via psql on port 15432)
5. Create MinIO bucket `agent-<id>` (via `mc` or HTTP API)
6. If `--worktree` flag: create git worktree at `~/worktrees/agent-<id>/`
7. Generate `.env.agent.<id>` from template
8. Generate PM2 ecosystem config `ecosystem.agent.<id>.config.cjs`
9. Start PM2 processes with `--name agent-<id>-*`
10. Poll `/api/v1/health` until ready (timeout 60s)
11. Print agent URLs and status

### 4. `agent-harness/teardown.sh`

Per-agent teardown. Takes `<agent-id>`.

Steps:
1. Stop and delete PM2 processes with `agent-<id>-` prefix
2. Drop database `agent_<id>` (disconnect active sessions first)
3. Remove MinIO bucket `agent-<id>`
4. Remove `.env.agent.<id>` and `ecosystem.agent.<id>.config.cjs`
5. If worktree exists: remove it (`git worktree remove`)

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
3. **test-unit** — `pnpm -F backend test:dev:nowatch` (only changed files) + `pnpm -F common test` + `pnpm -F frontend test`
4. **test-full** (only with `--full`) — `pnpm test` via turbo
5. **smoke** (only with `--full`) — `curl http://localhost:${API_PORT}/api/v1/health`

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

Template for per-agent `.env` files. Substituted by `launch.sh` using `envsubst` or `sed`.

Key variables that vary per agent:
- `PGDATABASE=agent_${AGENT_ID}`
- `PORT=${API_PORT}` (8010, 8020, ...)
- `SITE_URL=http://localhost:${FE_PORT}` (3010, 3020, ...)
- `S3_BUCKET=agent-${AGENT_ID}`
- `S3_ENDPOINT=http://localhost:19000`
- `PGHOST=localhost`, `PGPORT=15432`
- `LIGHTDASH_SECRET=agent-${AGENT_ID}-secret`
- `SCHEDULER_ENABLED=false` (disabled for agents by default)
- All external services disabled (RudderStack, PostHog, Intercom, Sentry empty)

### 8. `agent-harness/ecosystem.agent.template.cjs`

PM2 config template. `launch.sh` generates a concrete version per agent.

Processes (prefix `agent-<id>-`):
- `agent-<id>-api` — Backend API (PORT from env)
- `agent-<id>-frontend` — Vite dev server (FE_PORT)
- `agent-<id>-common-watch` — tsc --build --watch for common
- `agent-<id>-warehouses-watch` — tsc --build --watch for warehouses

Omitted from agent setup (not needed for inner loop):
- Scheduler (disabled, can be enabled via env)
- Spotlight (debugging UI, not needed for agents)

### 9. `agent-harness/CLAUDE.agent.md`

Agent instructions file. Placed in the agent's working directory (or the worktree root).

Contents:
- Agent ID, URLs, credentials
- How to manage the stack (always use `agent-cli.sh`)
- Verification workflow (`verify.sh` after every change, `--full` before declaring done)
- Definition of "done" (all stages green, feature works in browser, tests cover change)
- What NOT to do (modify test infra, disable tests, hardcode ports, raw docker commands)

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

### 11. `agent-harness/cloud-init.yml` *(done)*

Cloud-init config for provisioning a bare VPS (Hetzner, DigitalOcean, Vultr) with the full agent harness stack. Pass as `--user-data` when creating the server.

Installs:
- Docker CE + compose plugin
- Node.js 20.19 (via fnm), pnpm 9.15.5 (via corepack), PM2
- Python 3 + dbt 1.7 with postgres adapter (in venv)
- just (command runner)
- Clones the repo, runs `pnpm install`, builds common + warehouses
- Pre-pulls all Docker images (pgvector, minio, chromium, mailpit)

Configures:
- `lightdash` user with Docker group and sudo access
- 4 GB swap, sysctl tuning (524K inotify watchers, TCP backlog, VM overcommit)
- Docker log rotation
- `.env.agent-harness` with shared infra port defaults
- PATH setup for pnpm, fnm, dbt venvs, just

Recommended instance sizes:
- 3 agents: 8 vCPU / 16 GB (Hetzner CPX41)
- 5 agents: 8 vCPU / 32 GB (Hetzner CPX51)

Usage:
```bash
hcloud server create \
  --name lightdash-agents \
  --type cpx41 \
  --image ubuntu-24.04 \
  --ssh-key my-key \
  --user-data-from-file agent-harness/cloud-init.yml
```

After provisioning: `sudo -iu lightdash && cd /opt/lightdash && ./agent-harness/setup-infra.sh`

### 12. `.github/workflows/agent-task.yml`

GitHub Actions workflow triggered by `agent-task` issue label.

Steps:
1. Checkout repo
2. Setup pnpm + node + python/dbt
3. Start PostgreSQL + MinIO services
4. Install dependencies, build common + warehouses
5. Migrate + seed + build dbt models
6. Start backend + frontend
7. Wait for health check
8. Run Claude Code in headless mode with issue body as prompt
9. Run `verify.sh --full`
10. If passing: create PR with results
11. Comment on issue with outcome

---

## Sequence of Implementation

### Phase 0: Cloud Provisioning *(done)*
`cloud-init.yml` is ready. Provisions a VPS with all system-level dependencies so subsequent phases only need to create application-level scripts. After the server boots, SSH in as the `lightdash` user — Node.js, pnpm, Docker, dbt, and the repo are all pre-installed.

### Phase 1: Docker Compose + Infra Setup
Create `docker-compose.agent.yml` and `setup-infra.sh`. Goal: `./agent-harness/setup-infra.sh` starts shared infra and creates the template database.

### Phase 2: Agent Launch/Teardown
Create `env.template`, `ecosystem.agent.template.cjs`, `launch.sh`, `teardown.sh`. Goal: `./agent-harness/launch.sh 1` produces a running Lightdash instance on agent-1 ports.

### Phase 3: Agent CLI
Create `agent-cli.sh`. Goal: `./agent-harness/agent-cli.sh 1 status` shows agent-1 processes.

### Phase 4: Verification Pipeline
Create `verify.sh`. Goal: `AGENT_ID=1 ./agent-harness/verify.sh` returns structured JSON with typecheck/lint/test results.

### Phase 5: Agent Instructions + Justfile
Create `CLAUDE.agent.md` and `justfile`. Goal: `just agent launch 1` works end-to-end.

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
