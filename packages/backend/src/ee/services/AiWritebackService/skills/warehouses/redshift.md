---
name: warehouse-redshift
description: Type-coercion quirks for Redshift. Read before editing `schema.yml` `type:` or SQL that touches a column's emitted type.
---

# Redshift

Redshift documents implicit boolean ↔ integer coercion. This means wrong type edits produce **silent wrong results** (matches non-zero), not hard errors.

## Boolean ↔ integer

- Implicit: non-zero → TRUE, 0 → FALSE, NULL → UNKNOWN. `WHERE bool_col = 1`, `= TRUE`, `= 't'` all work.
- Source: https://docs.aws.amazon.com/redshift/latest/dg/r_Boolean_type.html
- **Right (preserve integer semantics):** keep `type: integer` and let users filter `= 1`
- **Wrong:** flip `type: boolean` on an integer 0/1/2 column — `= TRUE` silently matches all non-zero
- **Agent rule:** same as Snowflake — verify underlying column type before flipping `type:`.

## String → number

- Implicit conversion allowed where loss-of-precision-free; otherwise use CAST.
- Source: https://docs.aws.amazon.com/redshift/latest/dg/c_Supported_data_types.html

## Date / timestamp

- `TIMESTAMP` (NTZ) and `TIMESTAMPTZ` are distinct; implicit coercion exists but timezone math follows the inherited PostgreSQL behaviour.

## Identifier quoting & case

- Double quotes. Default is **case-insensitive, lowercase-folded**. Set `enable_case_sensitive_identifier = true` (cluster or session) to preserve case inside quotes.
- Source: https://docs.aws.amazon.com/redshift/latest/dg/r_enable_case_sensitive_identifier.html
- **Agent rule:** if the customer's cluster does not have this setting on, quoting mixed-case identifiers will silently lowercase them.

## Notable gotcha

- Boolean columns render as `t`/`f`. Boolean string literals are NOT case-sensitive — `'true'`, `'TRUE'`, `'t'`, and `TRUE` are all documented valid literals and all work.
- Source: https://docs.aws.amazon.com/redshift/latest/dg/r_Boolean_type.html
