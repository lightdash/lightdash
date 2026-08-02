# Reuse existing fields before re-deriving them

The most valuable thing you can do when asked to add a metric or column is to check whether the semantic layer **already expresses it**, and compose the existing fields instead of writing new SQL to recompute the value.

## The pattern to avoid

A request like *"add a metric for the average order value"* on a model that already has `total_revenue` and `order_count` metrics. The wrong move is to write fresh SQL — often a subquery — that recomputes revenue and counts from the raw rows. The right move is to define the new metric in terms of the two that already exist.

## How to do it

1. **Read the model first.** Before adding anything, read the model's existing `dimensions:` and `metrics:` (in `schema.yml` and the `.sql`). List what is already defined.
2. **Check whether the request is a combination of existing fields.** Ratios, differences, and rates are usually two existing measures combined — not a new base computation.
3. **Compose, don't recompute.** Express the new field using the existing ones. In Lightdash, a metric can reference other metrics/dimensions; a derived column in SQL can reference already-selected columns in a later CTE. Either way you inherit the existing field's tested definition instead of forking it.
4. **Only add base SQL when the value genuinely isn't modelled.** If nothing existing expresses it, add it — as a clean CTE-based derivation (see [cte-pipelines](./cte-pipelines.md)), never a correlated subquery.

## Why reuse matters here

- **Correctness by inheritance.** The existing field already encodes the right grain, filters, and casting. Recomputing risks diverging from it — a subtle bug that produces two "revenue" numbers that disagree.
- **Less to review.** A PR that composes existing fields is small and obviously correct; one that recomputes is large and has to be re-verified from scratch.
- **This is the exact class of change this skill exists to fix.**

## Guardrail: don't break what references the field

Before editing a model's SQL:

- Read the `source()`/`ref()` models it selects from so you know the real columns and their grain.
- Do not rename or remove a column that downstream models or `schema.yml` reference without checking the impact first. A rename that compiles can still break a downstream `ref` or a chart that used the old name.
