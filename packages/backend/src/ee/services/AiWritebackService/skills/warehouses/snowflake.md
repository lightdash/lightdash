---
name: warehouse-snowflake
description: Type-coercion quirks for Snowflake. Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# Snowflake

Snowflake silently coerces between many types. This is _worse_ than a hard error: wrong edits produce wrong row counts with no log signal.

## Boolean ↔ integer

- **Integer → boolean is implicit** (boolean → numeric is explicit only). `0 → FALSE`, any non-zero → `TRUE`. `WHERE int_col = TRUE` succeeds and matches every non-zero row (including 2, 3, -1).
- Source: https://docs.snowflake.com/en/sql-reference/data-type-conversion
- **Right (intent: "the flag column"):** keep `type: boolean` only if the column is actually BOOLEAN; otherwise leave as integer and let users filter `= 1`
- **Wrong (silent semantic break):** flip `type: boolean` on an integer 0/1/2/3 column — `= TRUE` now matches 2 and 3 too
- **Agent rule:** before changing `type:` numeric → boolean, verify the warehouse column is BOOLEAN. If it's integer, refuse the edit and surface the silent-miscount risk to the user.

## String → number

- Implicit planner cast — convenient but errors at runtime if any non-numeric string sneaks in. Prefer `TRY_CAST` in generated SQL.
- Source: https://docs.snowflake.com/en/sql-reference/functions/cast

## Date / timestamp

- Three flavours: `TIMESTAMP_NTZ` (default), `TIMESTAMP_LTZ`, `TIMESTAMP_TZ`. **`TIMESTAMP_TZ` stores offset, not zone**, so DST math is wrong.
- Cross-flavour comparisons are allowed but semantics vary. Preserve the original flavour exactly.
- Source: https://docs.snowflake.com/en/sql-reference/data-types-datetime

## Identifier quoting & case

- Unquoted identifiers folded to **UPPERCASE**. Double-quoted identifiers are case-preserving and case-sensitive (unless `QUOTED_IDENTIFIERS_IGNORE_CASE`).
- **Agent rule:** if quoting a previously-unquoted identifier, UPPERCASE it inside the quotes.
- Source: https://docs.snowflake.com/en/sql-reference/identifiers-syntax

## Notable gotcha

- Implicit cast added by the join planner is invisible in the SQL but appears in the query profile. Avoid `varchar = number` join keys.
