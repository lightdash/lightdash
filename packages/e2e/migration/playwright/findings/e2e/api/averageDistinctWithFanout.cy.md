# packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts

## Classification

Recommended runner: Vitest API tests (`packages/api-tests`), not Playwright
Execution lane: API-only, headless live-server integration
Active tests: 2
Skipped tests: 0
Persistent mutation: Yes — each metric query creates query-history state and may stream an S3 result object; the first query for an organization can also update onboarding metadata (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3662-3672,3718-3735`). No Lightdash content or warehouse rows are changed.
Shared-preview dual-run safe: Yes — requests only read fixed seed explores, and each POST returns an API-managed `queryUuid`; there are no created names or shared cleanup targets. Dual runs do add independent query-history/result artifacts and load the same warehouse/S3 services.
Difficulty total: 7
Coordination keys: `packages/api-tests/tests/averageDistinctWithFanout.test.ts`; `SEED_PROJECT`; async metric-query polling; seed `customers`/`orders` metadata
Analysis status: analyzed

| Difficulty factor | Score | Evidence |
|---|---:|---|
| Persistent/shared state | 1 | Query execution creates query history and result-storage artifacts, but no test-owned named object (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3718-3735`; `packages/backend/src/services/AsyncQueryService/CLAUDE.md:84-100`). |
| Browser interaction complexity | 0 | The spec only uses `cy.request`, `cy.wait`, and `cy.session`; it never visits or locates rendered UI (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:7-53,62-64`). |
| Environment/external dependencies | 2 | It requires a running API, seeded project/warehouse metadata, warehouse execution, and S3-compatible result storage (`packages/common/src/index.ts:550-558`; `packages/backend/src/services/AsyncQueryService/CLAUDE.md:114-115,139-140`). |
| Synchronization/flakiness | 2 | Fire-and-forget queries are polled every 200 ms with recursion but no aggregate deadline (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:12-36`; `packages/backend/src/services/AsyncQueryService/CLAUDE.md:2,93-100`). |
| Authentication/authorization | 1 | Admin cookie login plus authenticated endpoint and Explore permission checks are required (`packages/e2e/cypress/support/commands.ts:152-170`; `packages/backend/src/controllers/v2/QueryController.ts:63-75,173-177`; `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:4256-4269`). |
| Cross-file infrastructure | 1 | The API-test package already supplies a cookie-aware client, admin login, and generic polling helper; no new shared helper is warranted (`packages/api-tests/helpers/api-client.ts:22-91`; `packages/api-tests/helpers/auth.ts:13-26`; `packages/api-tests/helpers/polling.ts:15-34`). |

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `average_distinct should match AVG on a non-fanned-out table` | Active; enclosing `describe` is not skipped | Runs `orders_average_order_amount`, verifies one positive fractional aggregate row, then runs `customers_avg_order_amount_deduped` and expects the deduplicated value to be within `0.01` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:66-130`). The seed metadata defines the baseline as `average`, the fanout metric as `average_distinct` keyed by `orders.order_id`, and one-to-many joins through orders and payments (`examples/full-jaffle-shop-demo/dbt/models/orders.yml:379-380`; `examples/full-jaffle-shop-demo/dbt/models/customers.yml:27-32,70-73`). | Two query-history records and corresponding result-storage activity; possible one-time onboarding update. No cleanup (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3662-3672,3718-3735`). | Two asynchronous requests are deliberately sequential; each recursively polls at 200 ms. Floating-point tolerance is `0.01` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:101-129`). | `packages/api-tests/tests/averageDistinctWithFanout.test.ts` |
| `average_distinct should return NULL when all values are NULL` | Active; enclosing `describe` is not skipped | Filters `orders_amount` with `isNull`, requests the deduplicated average, expects exactly one aggregate row, then asserts its raw value is `null` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:133-173`). | One query-history record and corresponding result-storage activity; possible one-time onboarding update. No cleanup. | Async polling; aggregate-without-dimensions returns one row even for an all-NULL input set. | `packages/api-tests/tests/averageDistinctWithFanout.test.ts` |

There are no `it.skip`, `describe.skip`, conditional skip calls, or skip comments in the assigned spec. Both tests should be retained as API integration tests; neither needs Playwright, CLI/Node-only machinery, a unit-test rewrite, removal, or clarification.

## Cypress command expansion

- The only custom Cypress command is `cy.login()` in the `beforeEach` hook (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:62-64`). Its implementation uses `cy.session` keyed by the seed admin email, POSTs `api/v1/login` with the seed admin credentials when creating the session, requires HTTP 200, and validates restored sessions with `GET api/v1/user` (`packages/e2e/cypress/support/commands.ts:152-170`). The constants resolve to `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-479`).
- `runMetricQuery` is a spec-local helper, not a custom Cypress command. It POSTs `{ context: 'exploreView', query }` to `/api/v2/projects/{projectUuid}/query/metric-query`, expects 200, extracts `resp.body.results.queryUuid`, then GET-polls `/api/v2/projects/{projectUuid}/query/{queryUuid}` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:7-53`).
- During polling, a truthy `results.error` throws; any status other than lowercase `ready` waits 200 ms and recursively polls; `ready` returns `results.rows` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:12-37`). `cy.request` and `cy.wait` are Cypress built-ins.
- `getRawValue` directly indexes `row[fieldId].value.raw` with no presence guard (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:56-57`).
- The support file globally imports these commands (`packages/e2e/cypress/support/e2e.ts:14-15`). Its unrelated global uncaught-exception suppression does not affect this API-only flow (`packages/e2e/cypress/support/commands.ts:135-142`).

## State, seed, and environment assumptions

- The fixed project is `SEED_PROJECT`: UUID `3675b69e-8324-4110-bdca-059031aa8da3`, name `Jaffle shop` (`packages/common/src/index.ts:550-558`). Both tests assign this UUID once at suite scope (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:59-60`).
- The project must already contain compiled `orders` and `customers` explores with field IDs exactly matching `orders_average_order_amount`, `customers_avg_order_amount_deduped`, and `orders_amount` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:68-99,135-160`). The source metadata defines those metrics at `examples/full-jaffle-shop-demo/dbt/models/orders.yml:379-380` and `examples/full-jaffle-shop-demo/dbt/models/customers.yml:70-73`.
- Fanout semantics depend on `customers -> orders` and `customers -> payments` one-to-many joins, with `average_distinct` deduplicating on `orders.order_id` (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:27-32,70-73`).
- `orders.amount` is the summed payment amount from a left join, so orders without a payment produce NULL (`examples/full-jaffle-shop-demo/dbt/models/orders.sql:15-26,62-66`). Seed orders 149-151 exist without matching payment order IDs in the checked fixture, providing the NULL case (`examples/full-jaffle-shop-demo/dbt/data/raw_orders.csv:150-152`; the payment fixture contains no matching `order_id` entries).
- The first test assumes the baseline average is positive and non-integral before comparing values (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:102-109`). This is a seed-data assertion, not merely an implementation assertion.
- Authentication is seed organization admin. The v2 POST and GET routes require authentication, and metric execution additionally checks permission to view the requested Explore (`packages/backend/src/controllers/v2/QueryController.ts:63-75,173-177`; `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:4256-4269`). No lower-role behavior is under test.
- Cypress retains the authenticated cookie state through `cy.session`; the second test can reuse and validate that session. There are no aliases, local/session storage values set by the spec, fixtures loaded by Cypress, or assumptions about a previous suite.
- Runtime requirements are the Lightdash API at Cypress's default `http://localhost:3000`, its application database/session backing, the configured seed warehouse, and enabled S3-compatible async-result storage (`packages/e2e/cypress.config.ts:24-26`; `packages/backend/src/services/AsyncQueryService/CLAUDE.md:139-140`). There is no third-party HTTP service, upload/download, email, headless-browser, or UI asset dependency.
- Neither test creates user-visible names, charts, dashboards, spaces, or warehouse rows, so duplicate-name risk is absent. Query history/result artifacts are not explicitly cleaned up.

## Synchronization and timeout requirements

- The API returns a `queryUuid` before warehouse completion; results must be polled until ready (`packages/backend/src/services/AsyncQueryService/CLAUDE.md:2,14,93-100`). A direct one-shot GET is not equivalent.
- The current helper waits 200 ms between polls but has no total attempt count or deadline (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:12-36`). Cypress's 10-second `defaultCommandTimeout` applies to individual commands, not a clearly bounded end-to-end recursive polling budget (`packages/e2e/cypress.config.ts:18-21`).
- Polling only special-cases a truthy `results.error`; a terminal `cancelled`/`expired` response without that property would continue forever. The service documents `PENDING`, `RUNNING`, `READY`, `ERROR`, and `CANCELLED`, and the implementation also handles expiration (`packages/backend/src/services/AsyncQueryService/CLAUDE.md:137`; `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:957-981`).
- The first test must preserve ordering: await the baseline orders result before submitting and comparing the customers result (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:101-130`). The second test is independent and may run after or before it once authenticated.
- The API port should reuse `pollUntil`, explicitly set approximately 60 seconds, keep a modest interval (200 ms is behaviorally closest), return only on `ready`, and throw immediately for terminal error/cancel states. The API-test suite itself allows 120 seconds per test and runs files non-parallel (`packages/api-tests/helpers/polling.ts:15-34`; `packages/api-tests/vitest.config.ts:7-12`).
- Cypress run mode retries default to two, which can create additional query-history/result artifacts on transient failures (`packages/e2e/cypress.config.ts:12-21`). The API-test lane should rely on bounded polling rather than copying recursive Cypress retry behavior.

## Locator and strictness risks

- There are no DOM, role, text, CSS, SVG/canvas, Monaco, virtualized-list, iframe, popup, clipboard, drag-and-drop, or browser locator concerns. This is the primary reason Playwright is the wrong target.
- API shape strictness is the relevant risk. The source assumes `resp.body.results.queryUuid`, `results.status`, `results.rows`, and `row[fieldId].value.raw` exist without schema validation (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:18-23,36,51,56-57`). The port should give POST and GET responses explicit `Body<...>` types and make missing fields fail clearly.
- Exact field IDs are intentional API contracts. Do not replace them with labels or loose key searches.
- Both queries have no dimensions and therefore expect exactly one aggregate row. Preserve the row-count assertions before indexing (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:102,112,166-170`).

## Nonstandard or surprising behavior

- Despite living under Cypress E2E, the file never creates a browser page. It is already an HTTP integration test and belongs in `packages/api-tests`, matching the package rule that API-only behavior must not use Cypress (`packages/e2e/CLAUDE.md:8-16`; `packages/api-tests/CLAUDE.md:5-12`).
- The local helper ends both Cypress chains with unsafe casts, including `as unknown as Cypress.Chainable<ResultRow[]>` (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:14-40,42-53`). Do not reproduce those casts in the Vitest port; use the existing generic `ApiClient` response types.
- The comparison intentionally does not hardcode a numeric fixture result. It compares ordinary AVG from `orders` with fanout-safe `average_distinct` from `customers`, after separately proving the baseline is meaningful (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:101-129`).
- The NULL test filters the joined `orders_amount` dimension to NULL and then aggregates; it is testing NULL elimination/empty effective input semantics, not a literal table in which every stored payment amount is NULL (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:139-171`).
- Query objects omit timezone, custom dimensions, pivot configuration, and dimension overrides. The controller forwards omitted optional fields without the spec asserting project/server defaults (`packages/backend/src/controllers/v2/QueryController.ts:183-202`).
- Sorts on the sole aggregate metric are present even though each query expects one row. Preserve them for parity unless a later cleanup is explicitly separated from migration.

## Coordination requirements

- Reserve only `packages/api-tests/tests/averageDistinctWithFanout.test.ts` for this port. No manifest or registration change is needed because Vitest discovers `tests/**/*.test.ts` (`packages/api-tests/vitest.config.ts:5`).
- Reuse `packages/api-tests/helpers/api-client.ts`, `packages/api-tests/helpers/auth.ts`, and `packages/api-tests/helpers/polling.ts`. Do not add or modify shared infrastructure for this one local query wrapper.
- A local `runMetricQuery` helper is justified because both tests use the same POST/poll protocol. It should remain in the target test file; broader consolidation with `packages/api-tests/tests/async-query.test.ts` is outside this migration.
- Concurrent old-Cypress/new-API execution is logically safe: no shared names or deletions exist. Coordination is operational only—both lanes consume the same seeded warehouse and async S3/result-history infrastructure.
- No cleanup ordering, alias handoff, or dependence on another spec exists. Do not add suite-order coupling.

## Exact port plan

1. Create exactly `packages/api-tests/tests/averageDistinctWithFanout.test.ts`; do not create a Playwright spec.
2. Import `SEED_PROJECT`, Vitest's `beforeAll`/`describe`/`expect`/`it`, `ApiClient` and `Body` from `../helpers/api-client`, `login` from `../helpers/auth`, and `pollUntil` from `../helpers/polling`.
3. Define local typed result-cell/row and async-query response shapes. Keep `apiUrl = '/api/v2'` and a file-local `runMetricQuery(client, projectUuid, query)` helper.
4. In `runMetricQuery`, POST the unchanged `{ context: 'exploreView', query }`, assert status 200, read the returned `queryUuid`, and call `pollUntil` on the GET endpoint with an explicit approximately 60-second deadline and 200 ms interval. Fail immediately on terminal error/cancel/expiry; return rows only for `ready`.
5. Authenticate once in `beforeAll` with the existing `login()` helper and retain its cookie-aware `ApiClient`. Do not introduce Playwright storage state or duplicate credential handling (`packages/api-tests/helpers/auth.ts:13-26`; `packages/api-tests/helpers/api-client.ts:22-91`).
6. Port both test query bodies and assertions without changing field IDs, filter shape, sorts, limits, tolerance, NULL assertion, or the first test's sequential order (`packages/e2e/cypress/e2e/api/averageDistinctWithFanout.cy.ts:66-173`).
7. Keep the query helper local. Do not change `helpers/polling.ts`, `tests/async-query.test.ts`, configuration, manifests, seed files, or application code.
8. After the API test passes, let the migration owner remove or disable the Cypress source in a separate coordinated step; this discovery assignment does not authorize that edit.

## Verification plan

Run from the repository root after implementing the port:

```bash
pnpm -F api-tests test:api -- tests/averageDistinctWithFanout.test.ts
pnpm -F api-tests typecheck
pnpm -F api-tests lint
pnpm -F api-tests format
```

The targeted test must pass against a running seeded Lightdash environment with its warehouse and S3-compatible result storage available. No Playwright/browser command is required. If the targeted invocation's path forwarding differs in the local pnpm version, use the equivalent direct command:

```bash
pnpm -F api-tests exec vitest run --config vitest.config.ts tests/averageDistinctWithFanout.test.ts
```

## Open questions

- Non-blocking: confirm whether preview-environment lifecycle cleanup is considered sufficient for the query-history and S3 result artifacts created by repeated dual runs. The source has no explicit cleanup.
- Non-blocking: the current test compares two live query results rather than pinning the expected seed average. Preserve that behavior for migration; any move to a fixed expected number should be reviewed as a separate test-strengthening change.
- Migration-owner decision: choose the coordinated point at which the old Cypress spec is retired after the API-test replacement is green.

## Port history

Not started.
