---
name: warehouse-trino
description: Type-coercion quirks for Trino / Presto (incl. Athena, Starburst). Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# Trino / Presto / Athena / Starburst

Trino is the **strictest** dialect on this list — it refuses implicit cross-family coercions on `=`, `<`, `BETWEEN`, `IN`. Wrong type edits fail loudly with `TYPE_MISMATCH`. This is the warehouse where the incident that motivated these skills happened.

## Boolean ↔ integer

- **No implicit coercion.** `WHERE int_col = TRUE` → `TYPE_MISMATCH: Cannot apply operator: integer = boolean`.
- Source: https://trino.io/docs/current/functions/comparison.html
- **Right:** `WHERE int_col <> 0` or `WHERE CAST(int_col AS BOOLEAN)`
- **Wrong:** `WHERE int_col = TRUE`
- **Agent rule:** before changing `type:` numeric → boolean on a column whose dbt SQL emits an integer, also rewrite the SQL expression to emit boolean (`sql: CAST(...)` or `sql: ... = 1`).

## String → number

- No implicit string ↔ numeric. `'1' = 1` errors.
- Source: https://trino.io/docs/current/functions/conversion.html
- **Right:** `CAST('1' AS INTEGER)` or `TRY(CAST('1' AS INTEGER))` for safe nullable casts.

## Date / timestamp

- `TIMESTAMP` and `TIMESTAMP WITH TIME ZONE` are distinct types.
- `DATE = TIMESTAMP` is implicitly coerced (DATE → TIMESTAMP at midnight) but timezone semantics differ.
- Source: https://trino.io/docs/current/functions/datetime.html

## Identifier quoting & case

- Double quotes. Identifiers are case-insensitive in standard Trino — Trino lowercases them. The Iceberg connector has documented case-sensitivity issues with mixed-case names created by other engines (it does not cleanly preserve case at the query layer).
- Source: https://trino.io/docs/current/language/reserved.html

## Notable gotcha

- Athena lags upstream Trino. If the project is on Athena, prefer the safer (more explicit CAST) pattern.
