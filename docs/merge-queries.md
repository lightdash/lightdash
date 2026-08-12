# Merge queries

A merge composes two metric queries into one warehouse statement: each side
compiles exactly as it would on its own (same access rules, required filters,
parameters), becomes a CTE, and the join runs on the project warehouse through
the ordinary async query runtime — paging, formatting, the standard pivot
stage, caching and downloads all behave as for any other query.

The `merge-queries` feature flag is consumed by the frontend only: it shows or
hides the explorer entry point. The API endpoints
(`POST /projects/{uuid}/mergeQuery/compile|run`) are always available — they
are additive and permission-checked, so orgs without the flag are unaffected.

## Verification

The verification vehicle is the api-test suite
`packages/api-tests/tests/mergeQuery.test.ts`. It runs against the seeded
Postgres project and, via `getAvailableWarehouseConfigs`, against every
warehouse with CI credentials (Snowflake, BigQuery, Trino; Databricks excluded
to avoid serverless compute spin-up). The suite verifies *values*, not just
execution: merged numbers must equal the numbers the source queries return on
their own, each join type must keep exactly the key set it promises, date-spine
fills must come back gap-free at DAY and HOUR grain, and an empty merged
result must stay empty under the fill.

Known coverage gaps, deliberate: a live cap-guard trip needs more rows than
the jaffle seed carries (the guard SQL is pinned by unit tests); Trino's
10,000-element HOUR-fill cap errors by name at the warehouse rather than
pre-empted at compile.

## Dialect notes

The compiler emits all supported dialects. Constructs with per-dialect shapes
are pinned by snapshots in `MergeQueryBuilder.test.ts` (join + null-key
placeholders) and the spine emitter `mergeDateSpine.ts` (date-spine fill).

`fillMissingDates` refuses by name (`fill_not_supported_on_dialect`) on
dialects that cannot generate a spine — Redshift's `generate_series` is
leader-node-only. To lift Redshift:

1. Provision Redshift CI credentials and add the config to
   `getAvailableWarehouseConfigs`.
2. Live-probe the nested-WITH construct: a merge source compiled `asCteBody`
   can itself start with `WITH` inside `merge_N AS (...)`, which Redshift's
   documented WITH restrictions likely reject (shared exposure with the
   PivotQueryBuilder embed pattern).
3. Run the merge suite against Redshift.
4. Build the fill via a recursive-CTE spine if fill support is wanted;
   otherwise the named refusal stands.
