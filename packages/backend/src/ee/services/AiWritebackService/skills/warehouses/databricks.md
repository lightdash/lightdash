---
name: warehouse-databricks
description: Type-coercion quirks for Databricks (Spark SQL / Photon). ANSI mode is the deciding factor. Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# Databricks (Spark SQL / Photon)

**Behaviour depends on `spark.sql.ansi.enabled`.** ANSI is **on** by default in DBR 17+ and Spark 4+. The same edit can produce a hard error on a DBR 17 cluster and silent wrong results on a DBR 13 cluster — treat all results as **environment-dependent**.

## Boolean ↔ integer

- **ANSI on (DBR 17+):** implicit bool ↔ numeric disallowed, errors at runtime.
- **ANSI off (legacy policy):** loose CAST works, `int_col = TRUE` succeeds with non-zero → TRUE (silent miscount risk).
- Source: https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-ansi-compliance
- **Agent rule:** prefer explicit CAST regardless of detected ANSI mode — the cluster's ANSI setting may change between runs.

## String → number

- ANSI on: implicit in function context, errors in comparisons.
- ANSI off: tolerant.

## Date / timestamp

- `TIMESTAMP` is wall-clock with session timezone; `TIMESTAMP_NTZ` available since DBR 13.3.
- DATE ↔ TIMESTAMP implicit cast works (DATE → TIMESTAMP at midnight in session zone).

## Identifier quoting & case

- Backticks. Identifiers are case-insensitive for resolution. Unity Catalog **preserves** the original case.
- Source: https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-identifiers

## Notable gotcha

- Community report: "dangerous implicit type conversions on 17.3 LTS" — real-world regressions exist between runtime versions: https://community.databricks.com/t5/data-engineering/dangerous-implicit-type-conversions-on-17-3-lts/td-p/141575
