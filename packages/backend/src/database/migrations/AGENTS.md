# Writing Migrations

The migration system supports both up/down functions and includes 150+ historical migrations. These rules apply to all migrations, including EE migrations in `packages/backend/src/ee/database/migrations/`.

- **Migrations are frozen in time — never import enums, constants, or types from `@lightdash/common` or other application code.** Those values can change after the migration ships, silently altering what the migration does on a fresh install. Copy the values into the migration file as local constants instead.
- **Postgres rejects bind parameters in DDL** (`CREATE INDEX`, `ALTER TABLE`, ...). Knex `?` value bindings are sent to the server as protocol-level parameters, so `knex.raw('CREATE UNIQUE INDEX ... WHERE status IN (?, ?)', [...])` fails at migrate time with `bind message supplies N parameters, but prepared statement "" requires 0`. Inline literal values in DDL statements. `??` identifier placeholders are safe — knex interpolates those client-side.
- **Every table must have a PRIMARY KEY**: PostgreSQL logical replication and CDC tools rely on it for row identity, and PG can otherwise be forced into expensive `REPLICA IDENTITY FULL`. For new tables, prefer a synthetic UUID PK (`<table>_uuid` defaulting to `uuid_generate_v4()`) — this is consistent with the external API and avoids relying on natural keys that can change. A composite natural-key PK is acceptable when every column is already `NOT NULL` and inherently stable. Append-only audit/log tables are no exception.
- **Foreign key preference**: When referencing other tables, prefer using UUID columns (e.g., `organization_uuid`) over integer IDs (e.g., `organization_id`). This maintains consistency with the external API and simplifies joins.
- **Always index FK columns**: every column with a `.references()` clause must also have an index. Postgres does **not** create one automatically, and an unindexed FK turns every `ON DELETE CASCADE` / `ON DELETE SET NULL` cascade — and every JOIN that goes from parent to child — into a sequential scan on the child table. This is a frequent miss in PR review and only shows up in production when the child table grows. Two patterns:
    - **Adding a brand-new column** in the same migration that creates it: chain `.index()` on the column definition. The column has zero rows, so the build is effectively free and a regular index is fine.
        ```typescript
        table
            .uuid('color_palette_uuid')
            .nullable()
            .references('color_palette_uuid')
            .inTable('organization_color_palettes')
            .onDelete('SET NULL')
            .index();
        ```
    - **Adding an index to an existing populated column** (e.g. fixing a missed index): use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` with `config = { transaction: false }` so the build doesn't take a write lock. See the safe-migrations section below for the full pattern.

    Same rule applies to columns frequently used as filter/JOIN predicates (e.g. `space_id` on `saved_queries`) even when there's no FK constraint.
- **Safe migrations on large tables**: Self-hosted instances can have tens of millions of rows. Any migration that backfills data, validates a constraint, or builds an index on a big table must be written defensively:
    - **Disable `statement_timeout` for the session**: at the top of `up()`, `await knex.raw('SET statement_timeout = 0')`, and `await knex.raw('RESET statement_timeout')` in a `finally` block. Production PG often has a session `statement_timeout` that will kill a long-running batch, and with `config = { transaction: false }` the Knex migration lock is *not* released on crash — operators should inspect with `migrate status`, then use `migrate unlock --actor <who>` as the attributed escape hatch before retrying.
    - **Use `config = { transaction: false }` whenever the migration runs `CREATE INDEX CONCURRENTLY`, validates a `NOT VALID` constraint, or loops batched updates**. Each statement then runs in its own implicit transaction, so the migration **must be idempotent** — a partial run has to be safely resumable by re-running.
    - **Make every step idempotent**: guard with `IF NOT EXISTS` / `IF EXISTS`, check `pg_constraint` / `pg_class` before adding constraints, and drop any INVALID indexes left behind by a previous crash (`SELECT ... FROM pg_index WHERE NOT indisvalid`) before re-creating them with `CREATE INDEX CONCURRENTLY`.
    - **Batch backfills**: process bounded batches (e.g. 10 000 rows via `ctid IN (SELECT ... LIMIT N)`) and break when `rowCount` is 0. One giant `UPDATE` bloats WAL and holds a long write lock.
    - **Adding `NOT NULL` to an existing column**: don't `ALTER COLUMN ... SET NOT NULL` directly — it scans the whole table under `ACCESS EXCLUSIVE`. Instead: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT` (only takes `SHARE UPDATE EXCLUSIVE` — reads and writes continue), then `SET NOT NULL` (instant on PG12+ because of the validated `CHECK`), then drop the now-redundant `CHECK`.
    - **Building unique indexes / primary keys**: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS`, then `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY USING INDEX ...` — the promotion is a brief `ACCESS EXCLUSIVE` lock with no scan.
    - **Log progress** with `console.log` before each post-backfill DDL step so an operator tailing pod logs can tell exactly which statement is in flight if the migration hangs or fails.
    - End-to-end reference: `20260428153355_add_primary_keys_to_analytics_and_scheduler_log.ts` applies all of the above patterns to a multi-million row table.

## Lock timeouts for DDL

**Avoid unnecessary explicit locks. For non-unique concurrent-index-only migrations, disable the lock timeout with `lock_timeout = 0`; otherwise use `lock_timeout = '60s'` (one minute) for blocking DDL in both `up()` and `down()`.** This is a timeout policy, not a way to bypass PostgreSQL's required locks. Evaluate the operation's locking behavior, not just the table's size. Customer databases can have 100× more data than our own and much heavier concurrent traffic. Lock contention is hard to predict from local tests or our production table sizes, even for an otherwise quick schema change. Avoid copying the 5-second timeout from historical migrations: repeated failures can force operators to perform privileged, manually reviewed unlocks before retrying an upgrade.

- **Examples**: the query-history migration `20261102120000_index_query_history_project_explore_created_at.ts` uses `CREATE/DROP INDEX CONCURRENTLY`, so it sets `lock_timeout = 0`. The scheduler migration `20261102120000_add_scheduler_use_cached_results.ts` uses blocking `ALTER TABLE`, so it sets `lock_timeout = '60s'`. Do not add a manual `LOCK TABLE` around concurrent index operations.
- **Transactional migrations with blocking DDL**: set the timeout before any DDL in each function. Knex runs the function in a transaction, so the setting is automatically restored on commit or rollback:
    ```typescript
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    ```
- **Non-transactional migrations with blocking DDL** (`config = { transaction: false }`): use `SET lock_timeout = '60s'` and `RESET lock_timeout` in a `finally` block. Run the settings and all affected DDL on the same explicitly acquired connection; separate calls through the Knex pool need not use the same connection. `SET LOCAL` has no effect outside a transaction.
- **Concurrent-index-only migrations**: `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` allow ordinary reads and writes while waiting for older transactions. For a migration containing only non-unique concurrent index creation/removal and metadata queries, explicitly set `lock_timeout = 0` and `statement_timeout = 0` on the acquired connection, then restore both previous values in `finally` before releasing it. Simply omitting the settings can inherit a customer's short timeout. PostgreSQL still takes the locks needed for correctness; disabling a timeout does not remove those locks. Explain the exception in the PR. Concurrent builds still consume resources and conflict with other schema changes or maintenance; queued exclusive DDL can delay later application queries. Do not apply this exception to blocking `ALTER TABLE` operations or mixed migrations; unique indexes also need a separate review of write-time constraint enforcement.
- **Keep blocking lock waits finite**: a waiting `ALTER TABLE` can queue application queries behind it. A longer timeout does not replace short transactions, concurrent index builds, or batched backfills. Check deployment request/proxy deadlines too: queued requests may already have used part of their time budget, so the one-minute default does not guarantee they will avoid timing out. Document the reason in the PR if blocking DDL needs a different finite timeout.
- **Check `statement_timeout` separately**: `lock_timeout` limits each wait to acquire a lock, not the statement's execution time. A nonzero `statement_timeout` must leave enough time for both the lock wait and the operation; a value at or below 60 seconds can cancel the statement before the lock timeout. Follow the large-table guidance above for long-running work.

See PostgreSQL's [lock timeout reference](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT), [transaction/session setting rules](https://www.postgresql.org/docs/current/sql-set.html), and concurrent index [creation](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY) and [removal](https://www.postgresql.org/docs/current/sql-dropindex.html) guarantees.

## Release-safety declarations

For API and type breaks outside migrations, see the root [release-safety declarations](../../../../../docs/release-safety.md).

The release-safety gate applies these rules only to migration files changed by the pull request. Existing untouched migrations are grandfathered.

- `impact` is not allowed on migration declarations.
- A migration containing a detected breaking operation must add a stable ID to `release-safety.declarations.json`. Set `reason`, `requiredStop`, and `migration` to the full migration path. The declaration records the break; it does not hide the detector finding.
- Raw SQL that the static lint cannot classify must add `export const classification: { kind: 'safe' | 'breaking'; reason: string } = { kind: '<safe | breaking>', reason: '<why>' }`, or the equivalent unannotated object literal. A `breaking` classification also requires a matching registry entry.
- A `transaction: false` migration must be resumable after any completed statement. Concurrent index creation needs `IF NOT EXISTS`; backfills need bounded, state-guarded batches; inserts need conflict handling or another explicit idempotency guard.
- `down()` must perform a real reversal or explicitly throw an error whose message starts with `irreversible:`. Missing and silently successful no-op `down()` functions fail the gate.
- DDL must follow the [operation-specific timeout policy](#lock-timeouts-for-ddl) before requesting locks. The gate warns when no lock timeout setting is detected; it does not verify the duration or connection scope.
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS` is not sufficient recovery by itself: an interrupted build can leave an invalid index that `IF NOT EXISTS` silently skips. Use a stable literal index name in the SQL so migration recovery can discover and replace an invalid index. Identifier placeholders and dynamically constructed index names defeat that recovery scan and require the migration to check `pg_index.indisvalid`, drop the invalid index, and recreate it explicitly.

When the gate detects a breaking pattern, use this decision tree:

1. Attempt an expand-only redesign first, such as deprecating the old shape now and dropping it in a later release.
2. Add a registry entry only after an engineer confirms the product and rollout decision. Its reason must describe what breaks and for whom; it must contain more than one word, use at least 24 characters, and must not reuse placeholder text.
3. Never add a breaking declaration merely to make CI pass. Declaring a break makes the release not rolling-safe and advises every self-hosted customer to use the Recreate strategy.

A declaration is active only for a Git range that adds its ID. It expires after the first release that contains it and stays in the append-only registry as history. Never edit, remove, rename, or reuse an existing ID. Add a new ID for each new break. A release may add `releasedIn` for documentation, but that value never controls activation. The inline `classification` export stays in the migration because it classifies SQL for the linter and is not a breaking declaration.

## Runtime rollback granularity

The lease runtime applies each migration as a separate Knex batch rather than grouping a deploy into one batch. Consequently, development tooling such as `knex migrate:rollback` unwinds one migration per invocation, not the whole deploy. During an incident, expect this per-migration unwind granularity; production recovery remains forward-only.

## Real-schema tests and schema compatibility

Test schema behaviour on the real schema, not on hand-built tables or `knex-mock-client`.

- `createMigratedDatabase()` (`src/testing/migratedDatabase.ts`) returns a fresh database with every core and EE migration applied, plus the Graphile Worker schema. The first call migrates a template database with `pnpm run migrate`; later calls clone it, so each test file gets its own database in about a second. Call `destroy()` in `afterAll`.
- Name real-schema test files `*.migration.integration.ts` under a `__tests__` folder. They run with `vitest.config.migrations.integration.ts` and need `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE`.
- `pnpm -F backend check:column-names --base origin/main` fails when a migration adds a column to an existing table under a name that some table in the base schema already has. The previous release can then read that name as ambiguous in a join. Rename the column, or add `{ "column": "table.column", "reason": "..." }` to `src/database/columnNameReuseAllowList.json`.
- `scripts/n-minus-one.sh --previous-ref <tag>` migrates and seeds a database with the previous release, upgrades it with this checkout's migrations, then runs the previous release's model integration tests and its parallel E2E API tests against it, with the preview stack's feature settings. `EXCLUDED_API_TESTS` in the script lists the files it leaves out, each with a reason that is not about the schema. It fails when the previous release's backend or scheduler dies, or when their logs show a schema error such as an ambiguous or missing column. That is the database a rolling deploy leaves the previous release's pods on.
- The `Schema compatibility` workflow runs the real-schema tests for every pull request that changes backend, common or warehouses code, and the column name check and the previous release run for every pull request that changes migrations. The `Schema compatibility gate` job fails when one of them failed, was cancelled, or was skipped when the change needed it.
- Pull requests from forks do not run the real-schema tests or the previous release, because those jobs need repository secrets. For a fork pull request that adds a migration, a maintainer must push the branch to this repository to get the previous-release run.
