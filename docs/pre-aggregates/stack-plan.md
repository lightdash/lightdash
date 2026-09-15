# Deployment reuse: pull request stack

Use one native GitHub stack rooted at `main`, with five pull requests in the
order below. Every layer includes its behavior tests and must pass against its
immediate base. The boundaries were first verified in isolated cumulative layers, then replayed
and checked on `main` at `bcbbd1fa46`.

## Product decision

Pre-aggregates are an Enterprise beta feature. Ship the changed deployment
behavior with a release note and updated UI/documentation, without a deprecation
period, customer opt-in flag, or another release preserving the old no-cron
behavior. An unchanged deploy reuses compatible output with or without cron.
Cron and explicit refreshes fetch changed source data.

Retain the additive schema, old-writer checks, and safe promotion/routing during
a rolling upgrade. Schema activation is an operator upgrade mechanism, not a
customer feature setting. A controlled upgrade with old processes stopped can
install the final code in one release; separate customer-facing compatibility
releases are not required.

## 1. Deterministic materialization fingerprints

Branch: `irakli/preaggregate-fingerprints`

Title: `feat(pre-aggregates): fingerprint materializations`

Include common `filtersCompiler`, `exploreCompiler`, `metricSqlTemplate`, compiled
metric types, backend `queryCompiler`, `MetricQueryBuilder`, `QueryComposer`,
`materializationFingerprint`, and `preAggregatePreparation`, with their tests.
In common `preAggregate.ts`, add only `PhysicalOutputContract` in this layer.

Refresh behavior stays unchanged. Test all six relative operators, nested and
repeated predicates, rule collisions, query/output/context changes, and
serving-only formula reuse. Run common/backend compiler tests, builds, type
checks, and API generation for the additive compiled-metric contract.

Risk: high, because this changes shared query compilation.

## 2. Additive registry schema

Branch: `irakli/preaggregate-registry-schema`

Title: `feat(pre-aggregates): persist reuse metadata`

Include the expand migration and independent PostgreSQL migration tests. Persist
logical names, publication/schedule revisions, fingerprints, evaluation time,
output contracts, execution proof metadata, and activation state. Include the
nullable `execution_scope_key_id` used by the later execution layer. Retain
existing cache foreign keys and start with reuse disabled.

Test existing-row backfill, old-writer inserts/defaults, logical uniqueness,
index validity, interrupted-migration recovery, unchanged cascade behavior,
and rollback before activation. These tests must not import new models or
services from later layers.

Risk: high, because this migrates persisted state.

## 3. Stable registry publication and scheduling

Branch: `irakli/preaggregate-publication`

Title: `feat(pre-aggregates): publish stable definitions`

Include database entity/common metadata types, the registry model, neutral
ProjectModel transaction callbacks, and ProjectService's shared preparation and
full/streamed/partial publication. Credential preparation helpers and their tests
belong here because publication calls them before opening its transaction.

Include schedule reconciliation, settings invalidation, the cron payload revision,
and required SchedulerClient support. Move daily revision production here; keep
skipped-worker outcomes with PR 4. Preserve refresh-on-every-deploy and legacy
worker/serving behavior in compatibility mode.

Do not remove a legacy model method before its last caller moves. Where shared
types become nullable, include safe handling in existing consumers here rather
than depending on PR 4. Keep the summary API and producer for PR 5.

Test transaction rollback, full versus partial reconciliation, stable identity,
removal/invalidation, settings/cron changes, creator-based cron execution, and
old/new publication, and selective-deploy inventory pruning. Cache publication
passes actual deleted explore names to registry retirement in the same transaction.
Extract the relevant real PostgreSQL lifecycle cases into
this layer, with ProjectModel/ProjectService/scheduler tests.

Risk: high, because publication and scheduling affect persisted query state.

## 4. Execute, reuse, and serve compatible materializations

Branch: `irakli/preaggregate-deploy-reuse`

Title: `feat(pre-aggregates): reuse compatible output`

Connect preparation to AsyncQueryService and the actual query worker. Include
post-dequeue reuse, forced refresh, immutable attempt provenance, freshness-ordered
promotion, consistent serving snapshots, storage availability checks, bounded
decision metrics, skipped scheduler outcomes, and activation/forward rollback.

Include execution-proof secret rotation: produce with the active key, verify with
all retained keys, persist a non-secret key identifier when required, and prevent
key removal while materializations or running attempts still need it. The
rotation command, tests, and operational documentation travel with this behavior.

Test deployment during preparation/submission/promotion, incompatible and older
results, retained output after failure, history retention, unavailable storage,
effective credentials, fallback keys, and stale cron jobs. Run the reuse/refresh
matrix with and without cron. Include worker, resolver, and real PostgreSQL tests.

Risk: high, because this changes execution, authorization context, and serving.
Human peer review is required before merge.

## 5. Current output, refresh history, and beta documentation

Branch: `irakli/preaggregate-refresh-status`

Title: `feat(pre-aggregates): show serving refresh state`

Move the summary API/common types and model summary producer together with the
frontend current-materialization/latest-attempt UI and tests. Include lifecycle
documentation, the no-cron behavior change, release notes, and final verification
record. Regenerate API contracts and run frontend/backend/common type checks and
status tests. Follow repository policy on generated files excluded from commits.

Risk: high while the API/producer is included; its eligibility must agree with
serving.

## Completion checks

- Preserve all working changes before reconstructing branches. Account for every
  changed file and manually split hunk.
- Refresh the trunk, resolve upstream changes, and verify each layer independently.
  Cumulative checks alone do not establish this.
- Use signed commits and `gh stack init`, `gh stack add`, and
  `gh stack submit --auto --remote origin`. Verify draft titles, bases, order, and
  URLs; account for any partial submission.
- Make current-day schedule reconciliation after activation an executable, tested
  operation. A runbook instruction alone is insufficient: old unstamped cron jobs
  are rejected after activation.
- Exercise the real asynchronous warehouse/object-storage path and UI in an
  isolated fixture environment. PostgreSQL tests currently use synthetic adapters
  around real transactions and source SQL.
- Activation currently applies to the database, not one project. Validate in an
  isolated deployment before enabling a shared installation; a project-only
  activation gate is not implemented.
- A dedicated service account for materialization remains a separate, tentative
  follow-up. This stack preserves current execution-account selection.
