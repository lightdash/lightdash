# Agent Harness

Run multiple isolated Lightdash development environments on a single machine. Each agent gets its own database, S3 bucket, ports, and PM2 processes while sharing one set of infrastructure containers (PostgreSQL, MinIO, headless browser, Mailpit).

Built for AI coding agents (Claude Code, etc.) but works just as well for parallel human development.

> **Remote deployment?** See [cloud/README.md](./cloud/README.md) for setting up the harness on a VPS.

## For AI Agents (Claude Code)

If you're an AI agent running in the harness, use the `/agent-harness` skill to get started:

```
/agent-harness
```

This skill guides you through discovering your agent ID, finding your ports, managing your stack, and running verification. It covers everything you need to be productive immediately.

## Quick Start

```bash
# 1. Set up shared infrastructure (Docker containers + template database)
./agent-harness/setup-infra.sh

# 2. Launch agent 1
./agent-harness/launch.sh 1

# 3. Open in browser
#    Frontend: http://localhost:3010
#    API:      http://localhost:8010
#    Login:    demo@lightdash.com / demo_password!

# 4. Check status
./agent-harness/agent-cli.sh 1 status

# 5. Run verification after making changes
./agent-harness/verify.sh 1

# 6. Tear down when done
./agent-harness/teardown.sh 1
```

## Architecture

```
┌─────────────────────────── Host Machine ───────────────────────────┐
│                                                                     │
│  ┌─── Shared Docker Containers ──────────────────────────────────┐  │
│  │  PostgreSQL (:15432)  MinIO (:19000)  Browser (:13001)        │  │
│  │  Mailpit (:11025/:18025)                                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─── Agent 1 (PM2) ────┐  ┌─── Agent 2 (PM2) ────┐              │
│  │  Frontend  :3010      │  │  Frontend  :3020      │              │
│  │  API       :8010      │  │  API       :8020      │   ...        │
│  │  DB: agent_1          │  │  DB: agent_2          │              │
│  │  Bucket: agent-1      │  │  Bucket: agent-2      │              │
│  └───────────────────────┘  └───────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### Port Allocation

Each agent gets ports derived from `AGENT_ID * 10`:

| Service         | Agent 1 | Agent 2 | Agent 3 | Agent 4 | Agent 5 |
|-----------------|---------|---------|---------|---------|---------|
| Frontend (Vite) | 3010    | 3020    | 3030    | 3040    | 3050    |
| Backend API     | 8010    | 8020    | 8030    | 8040    | 8050    |
| Node Debugger   | 9210    | 9220    | 9230    | 9240    | 9250    |

Shared infrastructure uses non-standard ports to avoid conflicts with normal dev:

| Service        | Port  |
|----------------|-------|
| PostgreSQL     | 15432 |
| MinIO S3 API   | 19000 |
| MinIO Console  | 19001 |
| Headless Browser | 13001 |
| Mailpit SMTP   | 11025 |
| Mailpit Web UI | 18025 |

### Database Templating

PostgreSQL's `CREATE DATABASE ... TEMPLATE` copies the fully-migrated, seeded template database in milliseconds. No per-agent migration or seed runs needed.

## Scripts Reference

### `setup-infra.sh`

Starts shared Docker containers and creates the template database (migrations + seeds + dbt models). Idempotent — safe to run multiple times.

### `launch.sh <agent-id> [--worktree]`

Launches one agent (ID 1–5). Creates its database from the template, MinIO bucket, `.env` file, PM2 config, and starts all processes. Waits for the health check.

`--worktree`: creates an isolated git worktree at `~/worktrees/agent-<id>/` so the agent can modify files without affecting other agents.

### `teardown.sh <agent-id>`

Safely tears down one agent: stops PM2 processes, drops database, removes bucket, cleans up generated files. Only touches that agent's resources.

### `agent-cli.sh <agent-id> <command>`

Namespaced CLI for managing a running agent:

| Command | Description |
|---------|-------------|
| `status` | PM2 process status table |
| `logs [service]` | PM2 logs (api, frontend, common-watch, warehouses-watch) |
| `health` | Check API health endpoint |
| `url` | Print frontend/API URLs |
| `restart [service]` | Restart PM2 processes |
| `psql [query]` | SQL against agent's database |
| `stats` | CPU/memory for agent's processes |
| `slow-queries` | Top 10 slow queries from pg_stat_statements |
| `exec <cmd...>` | Run command with agent env vars |

### `verify.sh <agent-id> [--full]`

Progressive verification pipeline. Outputs JSON to stdout, human-readable progress to stderr.

**Default stages** (exit on first failure):
1. Typecheck — common, backend, frontend in parallel
2. Lint — common, backend, frontend in parallel
3. Unit tests — backend + common in parallel

**With `--full`**:
4. Full test suite
5. API smoke test

Output example:
```json
{
  "status": "pass",
  "stages": [
    {"name": "typecheck", "status": "pass", "duration_ms": 3200},
    {"name": "lint", "status": "pass", "duration_ms": 1800},
    {"name": "test-unit", "status": "pass", "duration_ms": 4500}
  ],
  "total_duration_ms": 9500
}
```

## Using `just` (Optional)

If you have [just](https://github.com/casey/just) installed:

```bash
cd agent-harness

just setup               # One-time infra setup
just launch 1            # Launch agent 1
just teardown 1          # Tear down agent 1
just verify 1            # Quick verification
just verify-full 1       # Full verification
just status              # All agent statuses
just launch-all 3        # Launch agents 1-3
just teardown-all        # Tear down all agents
just cli 1 logs api      # CLI shortcut
```

## Resource Estimates

| Component | Per Agent | Shared |
|-----------|-----------|--------|
| Backend API | 300–500 MB | — |
| Frontend (Vite) | 300–500 MB | — |
| TypeScript watchers | 100–200 MB | — |
| PostgreSQL | — | 500 MB–1 GB |
| MinIO | — | 128–256 MB |
| Headless Browser | — | 500 MB–1 GB |
| Mailpit | — | 64 MB |

**3 agents**: ~4–6 GB total (comfortable on 16 GB)
**5 agents**: ~6–8 GB total (needs 16+ GB)

## FAQ

<details>
<summary><strong>How do migrations and seeds work?</strong></summary>

`setup-infra.sh` runs migrations and seeds **once** to create a PostgreSQL template database (`lightdash_template`). When you launch an agent, `launch.sh` creates its database using `CREATE DATABASE agent_X TEMPLATE lightdash_template`, which is a near-instant copy operation.

This means:
- All agents start with identical database state
- No per-agent migration or seed runs needed
- Template creation includes: migrations → Lightdash seed → Jaffle Shop dbt models

</details>

<details>
<summary><strong>Can agents run different migration versions?</strong></summary>

**Not by default.** All agents share the same template, so they all start with the same migration state.

**Workaround with `--worktree`:**

1. Launch an agent with an isolated worktree:
   ```bash
   ./agent-harness/launch.sh 2 --worktree
   ```

2. Switch to a branch with different migrations:
   ```bash
   cd ~/worktrees/agent-2
   git checkout feature-branch-with-new-migrations
   ```

3. Manually run migrations on that agent's database:
   ```bash
   source .env.agent.2
   pnpm -F backend migrate
   ```

The agent's database (`agent_2`) is fully isolated, so this won't affect other agents.

</details>

<details>
<summary><strong>How do I reset an agent's database?</strong></summary>

Tear down and relaunch the agent:

```bash
./agent-harness/teardown.sh 1
./agent-harness/launch.sh 1
```

This drops the database and recreates it fresh from the template.

</details>

<details>
<summary><strong>How do I update the template database?</strong></summary>

If you've added new migrations or changed seeds:

1. Drop the existing template:
   ```bash
   psql -h localhost -p 15432 -U postgres -c "DROP DATABASE lightdash_template"
   ```

2. Re-run setup:
   ```bash
   ./agent-harness/setup-infra.sh
   ```

3. Tear down and relaunch agents to pick up the new template:
   ```bash
   ./agent-harness/teardown.sh 1
   ./agent-harness/launch.sh 1
   ```

</details>
