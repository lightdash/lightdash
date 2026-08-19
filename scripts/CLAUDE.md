# Scripts

## Claude Code exe.dev Environment

### `agent-exedev-dev.sh <start|wait|sync|url|ssh|exe>`

When `LIGHTDASH_EXEDEV_SSH_KEY` is set, clones this session's VM from the
`ld-linear-agent-template` exe.dev template (copy-on-write), pushes git-computed deltas
of the working tree over SSH, and launches the preview stack in the background;
`wait` blocks until the app is healthy and prints the public test URL
(`READY: https://<vm>.exe.xyz`). Hook commands (`hook-start`, `hook-sync`,
`hook-stop`) are wired in `.claude/settings.json` and no-op when the key is
unset. See `docs/agent-exedev.md`.

Use `agent-exedev-dev.sh ssh <cmd>` to run commands on the session VM and
`agent-exedev-dev.sh exe <cmd>` for exe.dev control commands (`ls`, `share`,
`tag`, ...) with the session identity already wired up.

## Claude Code Okteto Environment

### `agent-okteto-dev.sh <start|wait|url|okteto>`

When `LIGHTDASH_OKTETO_TOKEN` is set, atomically claims a ready Okteto namespace
for the session, keeps source changes synchronized through `okteto up` in tmux,
waits for synchronization and application health, and reports the public test
URL. See
`docs/agent-okteto.md` for setup.

Use `agent-okteto-dev.sh okteto <args...>` to run any `okteto` CLI command
(e.g. `status`, `namespace list`) against this session's environment without
hand-wiring `OKTETO_HOME`, `KUBECONFIG`, the authenticated context, or the
claimed namespace — it sets those up and execs `okteto` with your args,
defaulting `-n <namespace>` unless you already pass one.

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
