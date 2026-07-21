# Writing Migrations

- **Migrations are frozen in time — never import enums, constants, or types from `@lightdash/common` or other application code.** Those values can change after the migration ships, silently altering what the migration does on a fresh install. Copy the values into the migration file as local constants instead.
- **Postgres rejects bind parameters in DDL** (`CREATE INDEX`, `ALTER TABLE`, ...). Knex `?` value bindings are sent to the server as protocol-level parameters, so `knex.raw('CREATE UNIQUE INDEX ... WHERE status IN (?, ?)', [...])` fails at migrate time with `bind message supplies N parameters, but prepared statement "" requires 0`. Inline literal values in DDL statements. `??` identifier placeholders are safe — knex interpolates those client-side.
- For safe-migration patterns on large tables (indexes, backfills, `NOT NULL`, `transaction: false`), see `packages/backend/src/database/CLAUDE.md`.
