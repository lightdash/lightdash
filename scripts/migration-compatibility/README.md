# Migration compatibility harness

This harness runs selected application revisions against migrations from a later revision and compares exact values for known compatibility boundaries. The full suite contains a broken control and a compatible revision for every regression. It fails before probing if either side of a required pair is missing or both sides resolve to the same commit.

For every selected application revision, the harness creates a clean Git archive, installs its locked dependencies, and builds its backend without adding current-branch source. It starts that revision's `packages/backend/dist/index.js` against an isolated PostgreSQL database before applying the selected migrations, then asserts that the same process is ready afterward. An external runtime driver imports only the built backend modules to exercise the exact model seams and report their returned values.

Run the full paired suite with a PostgreSQL 15 administrative connection:

```bash
PGCONNECTIONURI=postgresql://postgres:password@localhost:5432/postgres \
pnpm test:migration-compatibility -- --case full --require-pairs
```

Use comma-separated case names while iterating. `--candidate-ref` replaces compatible revisions only. `--app-ref` replaces every selected revision, so it is rejected for a complete pair because both sides would resolve to the same commit. `--migration-ref` replaces the migration revision.

```bash
PGCONNECTIONURI=postgresql://postgres:password@localhost:5432/postgres \
pnpm test:migration-compatibility -- \
  --case saved-sql-wrong-warehouse,saved-sql-compatible \
  --require-pairs \
  --candidate-ref feature/spk-2198
```

| Pair or invariant           | Broken control                                                                                                                                                      | Compatible assertion                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ambiguous credential column | `ambiguous-column-broken` returns PostgreSQL `42702`. It also proves that the project and connection credential pointers contain the two expected, different UUIDs. | `ambiguous-column-compatible` returns the exact `project-authority` credential value from the same divergent fixture.                            |
| Catalog cache               | `catalog-cache-stale` leaves the connection-scoped cache stale while updating the legacy cache.                                                                     | `catalog-cache-compatible` writes the exact latest value to both stores, and the schema-native reader returns it.                                |
| Merged manifest             | `merged-manifest-stale` leaves the connection-scoped manifest stale while updating the legacy manifest.                                                             | `merged-manifest-compatible` writes the exact latest value to both stores, and the schema-native reader returns it.                              |
| Saved SQL connection        | `saved-sql-wrong-warehouse` proves that the historical saved-SQL model loses its stored connection B binding and the project-scoped resolver selects connection A.  | `saved-sql-compatible` proves that the schema-native saved-SQL model returns connection B and that the credential resolver selects connection B. |
| Context-free safety         | Not paired.                                                                                                                                                         | `context-free-two-live-refused` proves that the compatibility revision refuses a context-free lookup when two live connections exist.            |

The command writes progress to stderr and one JSON summary to stdout. The summary separates broken controls from compatible results and records the resolved commit SHAs, application-process readiness, exact probe values, and wall-clock duration.

## Evidence boundary

The harness proves two related claims:

1. A backend built from each named application revision can remain running and ready while the selected newer migrations are applied to its database.
2. The built production modules return the expected values at the credential, saved-SQL, cache, and manifest seams.

It does not prove that every value assertion travels through an HTTP controller. The catalog-cache and manifest writes are reached in production only through the full dbt compile and scheduler pipeline, so those cases call the built `ProjectModel` directly. The saved-SQL case calls the built `SavedSqlModel` and passes its returned connection UUID to the built credential resolver; it does not execute a warehouse query. This suite therefore provides deployed-backend schema compatibility plus compiled production-module behavior, not a complete end-to-end rolling deployment test.

The saved-SQL compatible case applies through the schema-native revision's final artifact migration so that its live process is ready. The broken control stops at the earlier connection-contract boundary because that is the forward-compatible schema seen by the historical checkpoint.
