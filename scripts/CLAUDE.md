# Scripts

## Claude Code Okteto Environment

### `agent-okteto-dev.sh <start|wait|url>`

When `LIGHTDASH_OKTETO_TOKEN` is set, atomically claims a ready Okteto namespace
for the session, keeps source changes synchronized through a detached
`okteto up` process,
waits for synchronization and application health, and reports the public test
URL. See
`docs/agent-okteto.md` for setup.

### `maintain-agent-okteto-pool.sh [minimum_ready]`

Repairs and replenishes the pool of unclaimed agent development environments.
The `agent-okteto-pool.yml` workflow runs it every 30 minutes with a minimum of
three. A ready namespace has the baked development image running in its idle
Lightdash pod and records the resolved immutable digest. The image workflow
refreshes unclaimed pool members after publishing a new digest.

## Okteto Preview Environment

### `preview-db-snapshot.sh <suffix>`

Snapshots the seeded preview database volume in the `db-snapshot` namespace so
preview environments can divert from it instead of migrating + seeding from
scratch. Run by `.github/workflows/preview-db-snapshot.yml` on merges to main
that change migrations, seeds, or the jaffle demo project.

### `okteto-ssh.sh <pr_number>`

SSH into a preview environment pod.

### `okteto-db.sh <pr_number> [mode] [SQL]`

Connect to a preview environment's Postgres database.

**Modes:**

- `psql` (default) — opens interactive psql session
- `query '<SQL>'` — runs a query and exits
- `forward` — port-forwards only, prints connection details for external tools

**Examples:**

```bash
# Interactive psql
./scripts/okteto-db.sh 20574

# Run a query
./scripts/okteto-db.sh 20574 query 'SELECT count(*) FROM spaces'

# Port-forward for GUI tools (TablePlus, DBeaver, etc.)
./scripts/okteto-db.sh 20574 forward
```

Port-forward auto-cleans on exit for `psql` and `query` modes. `forward` mode keeps it alive but tells you how to kill it manually.
