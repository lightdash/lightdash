# Agent Environment

You are running inside a Lightdash agent harness. This file describes your environment and workflow.

## Your Identity

- **Agent ID**: ${AGENT_ID}
- **Frontend URL**: http://localhost:${FE_PORT}
- **Backend API**: http://localhost:${API_PORT}
- **Database**: `agent_${AGENT_ID}` on localhost:${DB_PORT}

## Credentials

- **Login**: demo@lightdash.com / demo_password!
- **Database**: postgres / password (localhost:${DB_PORT})
- **MinIO**: minioadmin / minioadmin (localhost:19000)

## Stack Management

Always use the agent CLI to manage your stack:

```bash
# Check if your services are running
./agent-harness/agent-cli.sh ${AGENT_ID} status

# View logs for a specific service
./agent-harness/agent-cli.sh ${AGENT_ID} logs api
./agent-harness/agent-cli.sh ${AGENT_ID} logs frontend

# Restart a service
./agent-harness/agent-cli.sh ${AGENT_ID} restart api

# Check health
./agent-harness/agent-cli.sh ${AGENT_ID} health

# Run SQL queries
./agent-harness/agent-cli.sh ${AGENT_ID} psql "SELECT count(*) FROM saved_queries"

# Check slow queries
./agent-harness/agent-cli.sh ${AGENT_ID} slow-queries
```

## Verification Workflow

Run verification after every meaningful change:

```bash
# Quick verification (typecheck + lint + unit tests)
./agent-harness/verify.sh ${AGENT_ID}

# Full verification (adds full test suite + smoke test)
./agent-harness/verify.sh ${AGENT_ID} --full
```

**Always run quick verification after code changes. Run full verification before declaring a task done.**

## Definition of Done

A task is complete when:

1. All verification stages pass (typecheck, lint, tests)
2. The feature works correctly in the browser at http://localhost:${FE_PORT}
3. New functionality has appropriate test coverage
4. Code follows existing patterns in the codebase

## What NOT to Do

- **Do not** modify shared test infrastructure or CI configuration
- **Do not** disable or skip tests to make verification pass
- **Do not** hardcode ports — always use the agent's assigned ports
- **Do not** run raw `docker compose` commands — use `agent-cli.sh` instead
- **Do not** modify files in `agent-harness/` unless explicitly asked
- **Do not** access other agents' databases or processes
- **Do not** run `pnpm install` or modify `package.json` without explicit permission

## Package-Specific Commands

```bash
# Type checking (fast, incremental)
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck

# Linting
pnpm -F common lint
pnpm -F backend lint
pnpm -F frontend lint

# Testing
pnpm -F backend test:dev:nowatch   # only changed files
pnpm -F common test

# Generate API specs (after changing TSOA controllers)
pnpm generate-api
```

## Database Migrations

```bash
# Create a new migration
pnpm -F backend create-migration migration_name

# Run migrations on your agent's database
PGDATABASE=agent_${AGENT_ID} PGHOST=localhost PGPORT=${DB_PORT} pnpm -F backend migrate

# Rollback last migration
PGDATABASE=agent_${AGENT_ID} PGHOST=localhost PGPORT=${DB_PORT} pnpm -F backend rollback-last
```
