---
name: warehouse-shared
description: Cross-warehouse rules that apply regardless of dialect. Always loaded.
---

# Cross-warehouse rules

## NULL semantics (three-valued logic)

- All six warehouses: `NULL = NULL → UNKNOWN`, `NULL IN (1, 2, NULL) → UNKNOWN`. UNKNOWN rows are excluded from `WHERE` results.
- Source: https://modern-sql.com/concept/null
- **Agent rule:** when changing `type:` of a nullable column, warn — three-valued logic silently drops rows in WHERE predicates after the edit. Row counts can change with no error.

## dbt `data_type:` is descriptive only

- The `data_type:` field in `schema.yml` is **metadata**, not a coercion directive — unless inside `contract: enforced: true`.
- Outside contracts, dbt does NOT coerce the column. It records what the YAML claims, and downstream tools (Lightdash) read that as truth.
- Source: https://docs.getdbt.com/reference/resource-configs/contract
- **Agent rule:** editing `type:` does not change the warehouse column. The SQL Lightdash generates is the only place a wrong `type:` surfaces. Always check the column's actual warehouse type before flipping `type:`.

## Portable boolean filters

- **Never emit `WHERE int_col = TRUE`** — works on Snowflake/Redshift (wrong semantics) and errors on Trino/BigQuery/Postgres/Databricks-ANSI.
- **Portable pattern:** `WHERE int_col <> 0` or `WHERE CAST(int_col AS BOOLEAN)`.

## Skill order of operations

1. If asked to change a dimension's `type:` from numeric → boolean (or vice versa), first read the warehouse-specific skill for the project's dialect.
2. Check the warehouse column's actual type before applying the edit.
3. If types disagree, do not silently flip the YAML — either rewrite the SQL expression to match the new type, or surface the mismatch to the user.
4. Emit portable SQL patterns where possible (rule above).
