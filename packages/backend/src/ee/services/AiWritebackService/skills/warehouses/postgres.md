---
name: warehouse-postgres
description: Type-coercion quirks for Postgres. Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# Postgres

Postgres deliberately does NOT mark int↔bool as implicit, to avoid surprising query plans. Wrong type edits fail loudly — behaves like Trino in spirit.

## Boolean ↔ integer

- **No implicit coercion.** `int_col = TRUE` → `operator does not exist: integer = boolean`. Explicit `::boolean` works (`1::boolean → true`).
- `WHERE bool_col` works without a comparator.
- Source: https://www.postgresql.org/docs/current/typeconv.html
- **Right:** `WHERE bool_col` or `WHERE int_col::boolean`
- **Wrong:** `WHERE int_col = TRUE`

## String → number

- No implicit `text` ↔ numeric. A real text column compared to a number — `text_col = 1` — errors with `operator does not exist: text = integer`. Use `CAST` / `::int`.
- **Gotcha:** a bare quoted literal `'1' = 1` does NOT error. Postgres types the literal as `unknown` and operator resolution coerces it to `integer`. The risk is typed text columns, not literals.

## Date / timestamp

- `TIMESTAMP` vs `TIMESTAMPTZ` are distinct; comparisons implicitly cast through session timezone (can shift values silently).
- `CURRENT_DATE` (DATE) vs `CURRENT_TIMESTAMP` (TIMESTAMPTZ).

## Identifier quoting & case

- Double quotes; unquoted identifiers fold to **lowercase** (opposite of Snowflake's UPPERCASE). Quoted identifiers are case-sensitive.

## Notable gotcha

- `LIKE` is case-sensitive; `ILIKE` is case-insensitive (Postgres-specific). Don't emit `ILIKE` for non-Postgres warehouses.
- Source: https://www.postgresql.org/docs/current/functions-matching.html
