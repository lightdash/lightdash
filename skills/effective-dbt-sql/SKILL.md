---
name: effective-dbt-sql
description: Use when writing or modifying dbt model SQL — deciding whether to add a subquery or reuse an existing dimension/metric, structuring a query, joining models, or refactoring a metric's SQL. Encodes SQL semantic-correctness rules: reuse existing fields, prefer CTEs over correlated subqueries, and make joins and column lists explicit.
---

# Effective dbt SQL

Write dbt model SQL that is correct, readable, and idiomatic. This skill is about the **semantics** of the SQL you write — not naming or formatting.

## Scope

**Use this when** you are about to write or change SQL inside a dbt model (`.sql`), or a metric/dimension whose value is defined by SQL.

**This skill covers semantics only.** It does **not** prescribe naming schemes, file layout, or indentation. For those, follow the rule below.

> **Match the target repo first.** These are fallback defaults, not mandates. Before applying any rule, read the models around the one you are changing and match the repo's established conventions where they differ. Apply these rules to new or changed SQL only — do **not** reformat, rename, or restructure existing code that already works.

## The rules

1. **Reuse before you re-derive.** If the value you are asked for is already expressed by an existing dimension or metric — or by two of them combined — compose those fields instead of writing new SQL to recompute it. Read the model's existing dimensions/metrics before adding one. See [reuse-over-subqueries](./resources/reuse-over-subqueries.md).

2. **No correlated subqueries.** Never compute a value with a subquery that references the outer query's rows (a per-row correlated subquery in `SELECT` or `WHERE`). Reuse an existing field, or join to an aggregated CTE instead. This is the single most common mistake. See [cte-pipelines](./resources/cte-pipelines.md).

3. **CTEs over nested subqueries.** Structure a query as a pipeline of named CTEs, each referenced by the next, ending in a final `select`. Prefer this over subqueries nested inside `from`/`where`. See [cte-pipelines](./resources/cte-pipelines.md).

4. **Explicit joins.** Always state the join type (`inner`/`left`/…) and the `on` condition. Never comma-join. Know the grain: a join that fans out rows silently changes every downstream aggregate.

5. **Explicit columns.** Select named columns rather than `select *` when adding or changing what a model emits, so a change to an upstream model can't silently alter this model's output. (A pass-through `select * from final` at the very end of a CTE pipeline is fine — the columns are already pinned by the CTEs.)

6. **Don't break references.** Before editing a model's SQL, read the `source()`/`ref()` models it selects from. Do not rename or remove a column that downstream models or `schema.yml` reference without checking the impact first.

## Not in scope

- **Emitted-type / casting safety** (e.g. boolean-vs-numeric column types): follow the **warehouse skill** the system prompt points you to (`/home/user/.lightdash-skills/`). This skill does not restate casting rules.
- **Naming and formatting conventions:** match the target repo (see the rule above).
