# Warehouse skills for the AI Writeback agent

These markdown files give the writeback agent warehouse-aware guidance about
type-coercion behaviour. At run time `AiWritebackService` copies two files into
the sandbox at `/home/user/.lightdash-skills/`:

- `shared.md` — always (sourced from `_shared.md` here)
- `warehouse.md` — the file matching the project's warehouse dialect

The agent is told (via the system prompt) to read both before editing a
`schema.yml` `type:` field or any SQL that changes a column's emitted type.

## File contract

Each `<warehouse>.md` must have YAML frontmatter (`name`, `description`) and a
body that covers the four categories the smoke test asserts on:

- **Boolean ↔ integer**
- **String → number**
- **Date / timestamp**
- **Identifier quoting & case**

`_shared.md` is dialect-agnostic and always loaded.

## Warehouse → file mapping

| `WarehouseTypes`                | skill file              |
| ------------------------------- | ----------------------- |
| `trino`, `athena`               | `trino.md`              |
| `snowflake`                     | `snowflake.md`          |
| `bigquery`                      | `bigquery.md`           |
| `databricks`                    | `databricks.md`         |
| `redshift`                      | `redshift.md`           |
| `postgres`                      | `postgres.md`           |
| `clickhouse`, `duckdb`, unknown | none — `shared.md` only |

## Build note

These `.md` files are shipped to `dist/` by the backend `postbuild` step
(`copyfiles ... 'src/**/*.md' dist`). No separate sync mechanism is needed —
do not move them outside `src/`.

## Maintenance

⚠️ **Quarterly review TODO:** warehouse dialects change (ANSI defaults, new
timestamp types, coercion rules). Re-check each file's claims and source links
against current vendor docs every quarter. Skill versioning is via git history.
