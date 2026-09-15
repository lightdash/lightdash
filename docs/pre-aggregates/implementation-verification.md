# Deployment reuse: implementation and verification

The implementation follows the [refresh lifecycle and rollout guide](refresh-lifecycle.md).
After controlled activation, managed definitions with a verified compatible and
usable active materialization skip deployment refreshes, with or without cron.
Cron, manual/API, and existing webhook refreshes still execute.

## Implemented behavior

- Dedicated versioned compatibility fingerprints use the materialization compiler,
  the fixed comparison instant `2000-06-15T12:00:00.000Z`, occurrence-specific
  relative-filter provenance, physical output contracts, and execution context.
  Actual refreshes capture a fresh evaluation instant. Query-history cache keys
  retain their existing behavior.
- Stable definition identity and atomic full, streamed, and partial publication
  retain usable output. Promotion checks publication, compatibility, and evaluation
  order; query-history retention does not remove durable evidence.
- Compile checks decide after dequeue. Skips create no warehouse query or
  materialization attempt. Missing storage objects cause ordinary query fallback
  and a new baseline build on deployment.
- Schedule revision changes reconcile independently of compile skipping. Mixed
  version compatibility accepts eligible legacy jobs; activation enables strict
  revision checks. Preview projects remain excluded.
- Monitoring distinguishes the currently serving materialization from the latest
  attempt. Documentation explains the no-cron data-freshness change.
- Execution proofs use the active secret for new output and accept configured
  fallback keys for existing output. Secret rotation blocks removal while active
  materializations or in-progress attempts still need a fallback or unidentified
  key; fresh materialization and completed old attempts clear the gate.

## Authentication assurance boundary

Verified warehouse identities can participate in cross-deployment reuse.
Opaque refresh grants use execution-only proofs and remain ineligible for reuse.
Where an adapter exposes neither a principal nor a stable grant, existing
refresh support and adapter authorization are preserved, with publication-scoped
output and a configured-connection/actor guard. This guard does not claim to
identify ambient principals. See the [detailed assurance boundary](refresh-lifecycle.md#authentication-modes-without-a-verifiable-principal).

## Original implementation verification

These checks passed at implementation base `c5a8cc0ad0`, before replay onto the
current trunk. The per-layer current-trunk checks are recorded separately below.

| Check                                                                                               | Result                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Common filter, explore compiler, and metric-template tests                                          | 544 passed                                       |
| ProjectService and AsyncQueryService tests                                                          | Passed, including execution-proof rotation cases |
| Fingerprint, identity preparation, materializer, and managed routing tests                          | Passed                                           |
| Existing QueryBuilder, scheduler, and cache-model regression tests                                  | Passed; one preexisting skipped test             |
| Independent PostgreSQL expansion migration tests, without future service dependencies               | 13 passed                                        |
| Independent PostgreSQL publication tests before activation                                          | 12 passed                                        |
| PostgreSQL lifecycle, promotion/concurrency, rollout, source-data fixture, and secret-rotation gate | 14 passed                                        |
| Frontend materialization status tests                                                               | 2 passed                                         |
| CLI deploy and compile regression tests                                                             | 48 passed                                        |
| Common, backend, frontend, and CLI type checks                                                      | Passed                                           |
| Changed TypeScript file lint and formatting                                                         | Passed                                           |
| API generation, chart/dashboard schemas, and MCP snapshot generation                                | Passed                                           |

The PostgreSQL fixture runs real transactions and source SQL, with separate
connections for concurrency tests. Its query-submission and object-storage
adapters are synthetic. The actual async service and SDK context boundaries are
covered separately in the service tests. These checks do not constitute a live
BigQuery/S3 deployment or a browser UI walkthrough. No production customer data
was used.

## Current-trunk stack verification

Each layer was replayed onto `main` at `bcbbd1fa46` and checked against its direct
base. Layers 4 and 5 were checked in an isolated copy while commit signing was
paused; internal package resolution points to that copy.

| Layer | Current-trunk checks |
| --- | --- |
| 1. Fingerprints | 546 common tests; 351 backend tests; common/backend typechecks; builds; lint/format; API generation |
| 2. Schema | 13 real PostgreSQL expansion tests; backend typecheck; lint/format |
| 3. Publication | 12 real PostgreSQL publication tests; 546 service/identity/cache/scheduler tests with one existing skip; common/backend typechecks; lint/format; API generation |
| 4. Reuse | 430 worker/rotation/scheduler tests; 14 real PostgreSQL lifecycle tests; backend typecheck; lint/format |
| 5. Monitoring | 2 frontend tests; 15 real PostgreSQL lifecycle tests; 55 CLI deployment/compiler tests; common/backend/frontend/CLI typechecks; lint/format; API generation |

Counts overlap between layers and are not a unique test total. The rebase
preserves upstream selective-deploy model pruning and passes actual removed
explore names through the cache transaction to registry retirement. Unit tests
cover the callback and publication scope; PostgreSQL coverage verifies retirement,
schedule cancellation IDs, unrelated-row preservation, and rollback.

The full locked dependency installation through Socket Firewall encountered
registry timeouts. Targeted checks used the installed dependencies, including
Vitest 4.1.11; CI validation remains required. No dependency-policy bypass was used.

## Release state

The additive migration starts in compatibility mode with reuse disabled. The
explicit activation command contracts the schema only after compatible writers
are deployed and older executions have drained. Disabling reuse afterward retains
the schema and correctness guards. No production activation was performed.

Query-execution and migration changes require human peer review before merge.
Generated backend routes and Swagger were validated but are excluded from the
source diff in accordance with the repository instructions.
