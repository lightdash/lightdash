---
name: agent-harness
description: Guide for AI agents running in the isolated agent-harness environment. Use when you need to discover your agent ID, find your ports, manage your stack with agent-cli.sh, run verification, or understand the multi-agent development setup.
---

# Agent Harness Quick Start

You are running in an isolated Lightdash development environment managed by the agent-harness. This guide helps you discover your environment and get productive immediately.

## Step 1: Discover Your Agent ID

Your agent ID determines all your ports and resources. Find it by checking for the generated environment file:

```bash
ls -la .env.agent.* 2>/dev/null | head -1
```

This will show something like `.env.agent.1` — the number is your agent ID.

**Alternative**: Check which PM2 processes are running:

```bash
pnpm exec pm2 jlist 2>/dev/null | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const agents = [...new Set(data.map(p => p.name.match(/^agent-(\d+)-/)?.[1]).filter(Boolean))];
  if (agents.length === 1) console.log('AGENT_ID=' + agents[0]);
  else if (agents.length > 1) console.log('Multiple agents running: ' + agents.join(', '));
  else console.log('No agent processes found');
"
```

## Step 2: Know Your Ports

Once you have your agent ID, your ports are deterministic:

| Service | Formula | Agent 1 | Agent 2 | Agent 3 |
|---------|---------|---------|---------|---------|
| Frontend (Vite) | 3000 + (ID × 10) | 3010 | 3020 | 3030 |
| Backend API | 8000 + (ID × 10) | 8010 | 8020 | 8030 |
| Node Debugger | 9200 + (ID × 10) | 9210 | 9220 | 9230 |

**Shared infrastructure** (same for all agents):
- PostgreSQL: `localhost:15432`
- MinIO S3: `localhost:19000`
- Headless Browser: `localhost:13001`
- Mailpit SMTP: `localhost:11025`
- Mailpit Web UI: `localhost:18025`

Get your URLs with:
```bash
./agent-harness/agent-cli.sh <AGENT_ID> url
```

## Step 3: Use the CLI

All stack management goes through `agent-cli.sh`:

```bash
# Replace <ID> with your agent ID (1-5)

# Check process status (uptime, restarts, memory)
./agent-harness/agent-cli.sh <ID> status

# View logs (services: api, frontend, common-watch, warehouses-watch)
./agent-harness/agent-cli.sh <ID> logs api
./agent-harness/agent-cli.sh <ID> logs frontend

# Check API health
./agent-harness/agent-cli.sh <ID> health

# Restart services after code changes
./agent-harness/agent-cli.sh <ID> restart api
./agent-harness/agent-cli.sh <ID> restart frontend

# Run SQL queries against your database
./agent-harness/agent-cli.sh <ID> psql "SELECT * FROM users LIMIT 5;"

# View slow queries (useful for debugging)
./agent-harness/agent-cli.sh <ID> slow-queries

# Run arbitrary command with your agent's environment loaded
./agent-harness/agent-cli.sh <ID> exec pnpm -F backend test:dev:nowatch
```

## Step 4: Verification Workflow

**Run verification after every code change:**

```bash
# Quick verification (typecheck + lint + unit tests for changed files)
./agent-harness/verify.sh <ID>

# Full verification (complete test suite + smoke test)
./agent-harness/verify.sh <ID> --full
```

Output is JSON to stdout:
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

Stages run in order, stopping on first failure:
1. **typecheck** — TypeScript for common, backend, frontend (parallel)
2. **lint** — ESLint for common, backend, frontend (parallel)
3. **test-unit** — Unit tests for changed files
4. **test-full** (--full only) — Complete test suite
5. **smoke** (--full only) — API health check

## Step 5: Test Login Credentials

```
Email:    demo@lightdash.com
Password: demo_password!
```

## Common Workflows

### Making code changes

1. Edit files as needed
2. If you changed `packages/common/`, the TypeScript watcher auto-rebuilds
3. If you changed `packages/backend/`, restart the API:
   ```bash
   ./agent-harness/agent-cli.sh <ID> restart api
   ```
4. Run verification:
   ```bash
   ./agent-harness/verify.sh <ID>
   ```

### Debugging API issues

```bash
# Check health
./agent-harness/agent-cli.sh <ID> health

# View recent API logs
./agent-harness/agent-cli.sh <ID> logs api

# Check for errors using Spotlight MCP
mcp__spotlight__search_errors with filters: {"timeWindow": 300}

# Get trace details
mcp__spotlight__get_traces with traceId: "<8-char-prefix-from-logs>"
```

### Debugging frontend issues

```bash
# View Vite server logs
./agent-harness/agent-cli.sh <ID> logs frontend

# Use Chrome DevTools MCP for browser automation
# (Your frontend URL is http://localhost:<3000 + ID*10>)
```

### Database queries

```bash
# View schema
./agent-harness/agent-cli.sh <ID> psql "\d tablename"

# Run queries
./agent-harness/agent-cli.sh <ID> psql "SELECT * FROM projects LIMIT 5;"

# Check slow queries
./agent-harness/agent-cli.sh <ID> slow-queries
```

## Definition of Done

Your task is complete when ALL are true:
- `./agent-harness/verify.sh <ID> --full` returns `"status": "pass"`
- Feature/fix works in browser at your frontend URL
- Tests cover the change
- No TypeScript errors or lint warnings
- Changes are committed

## What NOT to Do

- **Do NOT** modify shared infrastructure (PostgreSQL, MinIO containers)
- **Do NOT** hardcode ports — always derive from your agent ID
- **Do NOT** run `docker compose` commands — use `agent-cli.sh`
- **Do NOT** touch other agents' databases or processes
- **Do NOT** manually edit `.env.agent.<ID>` or `ecosystem.agent.<ID>.config.cjs`
- **Do NOT** disable tests to make verification pass

## Tmux Session Management

If you were launched with `--claude`, you're running inside a named tmux session `agent-<ID>`.

**For human supervisors** to attach to your session:
```bash
# Attach to a specific agent's tmux session
./agent-harness/attach.sh <ID>

# Or directly with tmux
tmux attach -t agent-<ID>

# List all agent sessions
tmux list-sessions | grep "^agent-"
```

**Useful tmux commands** (prefix is `Ctrl-a` on cloud servers, `Ctrl-b` locally):
- `prefix + d` — Detach from session (leaves Claude running)
- `prefix + [` — Enter scroll mode (q to exit)
- `prefix + c` — Create new window
- `prefix + n/p` — Next/previous window

## Quick Reference Card

```bash
# Status & Health
./agent-harness/agent-cli.sh <ID> status
./agent-harness/agent-cli.sh <ID> health
./agent-harness/agent-cli.sh <ID> url

# Logs
./agent-harness/agent-cli.sh <ID> logs api
./agent-harness/agent-cli.sh <ID> logs frontend

# Restart
./agent-harness/agent-cli.sh <ID> restart api
./agent-harness/agent-cli.sh <ID> restart frontend

# Database
./agent-harness/agent-cli.sh <ID> psql "<SQL>"
./agent-harness/agent-cli.sh <ID> slow-queries

# Verification
./agent-harness/verify.sh <ID>           # Quick
./agent-harness/verify.sh <ID> --full    # Complete

# Package commands (use your agent's env)
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
pnpm -F backend lint
pnpm -F common test
pnpm generate-api  # After TSOA controller changes
```
