# Scripts

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
