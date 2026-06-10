---
name: warehouse-bigquery
description: Type-coercion quirks for BigQuery. Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# BigQuery

BigQuery is strict like Trino on most coercions — wrong type edits produce hard runtime errors, not silent miscount.

## Boolean ↔ integer

- Explicit `CAST` only — `CAST(1 AS BOOL)` → TRUE. Implicit comparison `int_col = TRUE` is rejected with "No matching signature for operator =".
- Source: https://cloud.google.com/bigquery/docs/reference/standard-sql/conversion_rules
- **Right:** `WHERE int_col <> 0` or `WHERE CAST(int_col AS BOOL)`
- **Wrong:** `WHERE int_col = TRUE`
- **Agent rule:** treat like Trino — never flip `type:` without also fixing the SQL expression.

## String → number

- No implicit string ↔ number. Use `SAFE_CAST(s AS INT64)` which returns NULL on failure (vs `CAST` which errors).
- Source: https://cloud.google.com/bigquery/docs/reference/standard-sql/conversion_functions

## Date / timestamp

- `DATE`, `DATETIME`, `TIMESTAMP` (UTC instant), `TIME` are distinct. **No implicit coercion between `DATE` and `TIMESTAMP`** — `WHERE date_col = CURRENT_TIMESTAMP()` errors.
- **Right:** `DATE(timestamp_col)` or `TIMESTAMP(date_col)`.
- Source: https://cloud.google.com/bigquery/docs/reference/standard-sql/conversion_rules

## Identifier quoting & case

- Backticks. Project/dataset/table names in FROM are case-sensitive; column names case-insensitive for resolution but case-preserved. Duplicate columns differing only in case are not allowed.
- Source: https://cloud.google.com/bigquery/docs/reference/standard-sql/lexical

## Notable gotcha

- Literal vs column coercion is asymmetric — BigQuery will coerce a literal to match a column's type but won't freely coerce two columns to a common type.
