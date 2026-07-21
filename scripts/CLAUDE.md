# Scripts

## Okteto Preview Environment

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

## Golden DB snapshots (SPK-297)

PR previews boot Postgres from a CSI `VolumeSnapshot` (`golden-db/golden-db-latest`) when available, then skip dbt + knex seed and only run delta migrations.

| File | Role |
|------|------|
| `docker/docker-compose.preview.yml` | Preview stack; `postgres_data` PVC for PGDATA |
| `docker/docker-compose.preview.golden.yml` | Volume labels that point the PVC at the golden snapshot |
| `docker/docker-compose.golden-db.yml` | Stack that materialises the golden volume |
| `okteto.preview.yaml` | Soft-fail: use golden overlay when snapshot is ready |
| `okteto.golden-db.yaml` | Deploy/reset the golden stack |
| `scripts/merge-preview-golden-compose.py` | Merge golden labels into a single compose file |
| `scripts/snapshot-golden-db.sh` | Create `golden-db-<sha>` + `golden-db-latest` |
| `.github/workflows/refresh-golden-db.yml` | Refresh snapshots on main (migrations/seeds/jaffle) |

`PGPASSWORD` is stable (`lightdash-preview-golden`) across golden + previews so restored volumes accept connections. Override via Okteto admin var if needed (must match on both sides).
