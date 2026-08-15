# Merge queries

A merge composes two metric queries into one warehouse statement: each side
compiles exactly as it would on its own (same access rules, required filters,
parameters), becomes a CTE, and the join runs on the project warehouse through
the ordinary async query runtime — paging, formatting, the standard pivot
stage, caching and downloads all behave as for any other query. Date-spine
filling is intentionally a follow-up capability layered on this core.

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
their own, each join type must keep exactly the key set it promises, join-key
type and grain mismatches must be refused by name, and source truncation must
never be presented as complete data.

Known coverage gap, deliberate: a live cap-guard trip needs more rows than the
jaffle seed carries (the guard SQL is pinned by unit tests).

## Dialect notes

The compiler emits all supported dialects. Constructs with per-dialect shapes
are pinned by snapshots in `MergeQueryBuilder.test.ts` (join + null-key
placeholders). Date-spine generation is intentionally documented and tested in
the stacked follow-up PR, where its dialect-specific behavior can evolve
without expanding the merge primitive.
