# Migration compatibility harness

This harness runs application source from one Git commit against migrations from another. It installs and builds each selected revision in a temporary archive, creates a PostgreSQL template with the baseline migration history, clones one isolated database per case, and removes the databases and archives after the run.

Set `PGCONNECTIONURI` to an administrative PostgreSQL database whose user can create databases. Run one or more comma-separated cases:

```bash
PGCONNECTIONURI=postgresql://postgres:password@localhost:5432/postgres \
pnpm test:migration-compatibility -- \
  --case ambiguous-column-broken,catalog-cache-stale,merged-manifest-stale,two-live-connections-wrong-warehouse
```

Override the application and migration revisions with full commits or local refs:

```bash
PGCONNECTIONURI=postgresql://postgres:password@localhost:5432/postgres \
pnpm test:migration-compatibility -- \
  --case ambiguous-column-compatible,catalog-cache-compatible,merged-manifest-compatible \
  --candidate-ref feature/spk-2297 \
  --migration-ref feature/spk-2198
```

The compatible cases require `--candidate-ref` or `--app-ref`. The candidate option changes only compatible cases, while the application option overrides every selected case. Every case compares exact values. Known broken behaviour is accepted only when it matches its full characterization, such as PostgreSQL error `42702`, a stale scoped artifact value, or the wrong credential marker for connection-bound content.

| Case                                   | Assertion                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ambiguous-column-broken`              | The deployed reader returns PostgreSQL `42702` for `organization_warehouse_credentials_uuid`.              |
| `ambiguous-column-compatible`          | The compatibility reader returns `project-authority`.                                                      |
| `catalog-cache-stale`                  | The old writer updates the legacy cache while the new reader returns the older connection-scoped value.    |
| `catalog-cache-compatible`             | Both cache stores and the new reader return the latest value.                                              |
| `merged-manifest-stale`                | The old writer updates the legacy manifest while the new reader returns the older connection-scoped value. |
| `merged-manifest-compatible`           | Both manifest stores and the new reader return the latest value.                                           |
| `two-live-connections-wrong-warehouse` | Content bound to connection B is paired with credentials silently selected from connection A.              |
| `two-live-connections-refused`         | A compatible binary refuses the two-live-connection state with the exact expected error.                   |

The command writes progress to stderr and one JSON summary to stdout. The summary records resolved commit SHAs, exact probe values, and wall-clock duration.
