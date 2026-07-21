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
    - **Disable `statement_timeout` for the session**: at the top of `up()`, `await knex.raw('SET statement_timeout = 0')`, and `await knex.raw('RESET statement_timeout')` in a `finally` block. Production PG often has a session `statement_timeout` that will kill a long-running batch, and with `config = { transaction: false }` the Knex migration lock is *not* released on crash — operators then have to manually `UPDATE knex_migrations_lock SET is_locked = 0` to retry.
    - **Use `config = { transaction: false }` whenever the migration runs `CREATE INDEX CONCURRENTLY`, validates a `NOT VALID` constraint, or loops batched updates**. Each statement then runs in its own implicit transaction, so the migration **must be idempotent** — a partial run has to be safely resumable by re-running.
    - **Make every step idempotent**: guard with `IF NOT EXISTS` / `IF EXISTS`, check `pg_constraint` / `pg_class` before adding constraints, and drop any INVALID indexes left behind by a previous crash (`SELECT ... FROM pg_index WHERE NOT indisvalid`) before re-creating them with `CREATE INDEX CONCURRENTLY`.
    - **Batch backfills**: process bounded batches (e.g. 10 000 rows via `ctid IN (SELECT ... LIMIT N)`) and break when `rowCount` is 0. One giant `UPDATE` bloats WAL and holds a long write lock.
    - **Adding `NOT NULL` to an existing column**: don't `ALTER COLUMN ... SET NOT NULL` directly — it scans the whole table under `ACCESS EXCLUSIVE`. Instead: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT` (only takes `SHARE UPDATE EXCLUSIVE` — reads and writes continue), then `SET NOT NULL` (instant on PG12+ because of the validated `CHECK`), then drop the now-redundant `CHECK`.
    - **Building unique indexes / primary keys**: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS`, then `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY USING INDEX ...` — the promotion is a brief `ACCESS EXCLUSIVE` lock with no scan.
    - **Log progress** with `console.log` before each post-backfill DDL step so an operator tailing pod logs can tell exactly which statement is in flight if the migration hangs or fails.
    - End-to-end reference: `20260428153355_add_primary_keys_to_analytics_and_scheduler_log.ts` applies all of the above patterns to a multi-million row table.
