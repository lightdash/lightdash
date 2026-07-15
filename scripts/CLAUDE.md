# Scripts

## Okteto Preview Environment

### `okteto-ssh.sh <pr_number>`

SSH into a preview environment pod.

### `okteto-db.sh <pr_number|staging> [mode] [SQL]`

Connect to a preview or staging environment's Postgres database.

**Targets:**

- `<pr_number>` — a PR preview environment (namespace `pr-<pr_number>`)
- `staging` — the shared staging environment (namespace `lightdash-staging`)

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

# Connect to the shared staging database
./scripts/okteto-db.sh staging psql
```

The database service (`db-preview`) and the app pod that holds the connection
credentials are resolved automatically, so the script works both with today's
combined `lightdash-preview` pod and the future split `backend` pod. If a PR
preview has no database of its own (e.g. a diverted preview that only rebuilt
the frontend/backend and shares the staging DB), it falls back to the
`lightdash-staging` database.

Port-forward auto-cleans on exit for `psql` and `query` modes. `forward` mode keeps it alive but tells you how to kill it manually.
