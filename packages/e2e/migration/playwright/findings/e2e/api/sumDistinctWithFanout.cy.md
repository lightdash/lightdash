# packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts

## Classification

Recommended runner: API tests (Vitest), not Playwright
Execution lane: api-tests
Active tests: 3
Skipped tests: 0
Persistent mutation: Yes — each metric-query POST creates query-history state; cache/result artifacts may also be written, and the first organization query can set onboarding `ranQueryAt`
Shared-preview dual-run safe: Yes — all warehouse access is read-only, query UUIDs are generated, and there are no name-based creates/deletes; bound concurrency to avoid unnecessary warehouse/query-queue load
Difficulty total: 6/18 (persistent/shared state 1, browser interaction complexity 0, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 1, cross-file infrastructure 0)
Coordination keys: none
Analysis status: analyzed

This is API-only coverage: the source uses `cy.request` and `cy.wait` but never visits a page or inspects the DOM (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:10-56`). The E2E package guidance therefore places it in `packages/api-tests`, whose existing client is cookie-aware and targets `SITE_URL` (`packages/api-tests/helpers/api-client.ts:1-7`, `packages/api-tests/helpers/api-client.ts:22-78`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `sum_distinct should prevent SQL fanout inflation when joining customers to orders` | Active | Runs an ungrouped direct `orders_total_order_amount` query, then an ungrouped `customers_total_order_amount_deduped` query; requires one positive row from each and exact equality of raw numeric totals (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:69-129`). The customer explore has one-to-many joins to orders and payments and defines this metric as `sum_distinct` by `orders.order_id` (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:27-31`, `examples/full-jaffle-shop-demo/dbt/models/customers.yml:63-68`). | Two async query-history records plus possible cache/result artifacts. No warehouse data mutation and no cleanup. | Async POST-plus-poll; `Number(unknown)` conversion; exact comparison rather than a hard-coded fixture total. | `packages/api-tests/tests/sumDistinctWithFanout.test.ts` |
| `sum_distinct should return grouped values when the user selects distinct keys as dimensions` | Active | Compares the ungrouped total for a two-key `sum_distinct` metric with rows grouped by both `order_id` and `payment_method`; requires multiple rows, multiple metric values, a rounded grouped sum equal to total, and non-null keys (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:131-219`). The fixture declares the metric's distinct keys as `[order_id, payment_method]` (`examples/full-jaffle-shop-demo/dbt/models/customer_order_payments.yml:202-205`). | Two async query-history records plus possible cache/result artifacts. No warehouse data mutation and no cleanup. | Sequential total/grouped queries; sums raw values and applies `toFixed(2)` only to the grouped sum (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:196-204`). | `packages/api-tests/tests/sumDistinctWithFanout.test.ts` |
| `sum_distinct grouped by dimension outside distinct_keys should return per-group values` | Active | Compares the ungrouped payment total deduped by `payment_id` with results grouped by `payment_method`; requires multiple groups, distinct group values, and a rounded grouped sum equal to total (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:221-285`). The fixture defines `payment_method` as a dimension and the metric's distinct key as `payment_id` (`examples/full-jaffle-shop-demo/dbt/models/customer_order_payments.yml:167-183`). | Two async query-history records plus possible cache/result artifacts. No warehouse data mutation and no cleanup. | Sequential total/grouped queries; raw decimal aggregation with two-decimal normalization (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:274-281`). | `packages/api-tests/tests/sumDistinctWithFanout.test.ts` |

There are no `it.skip`, `describe.skip`, conditional skips, or inherited skipped blocks in the assigned file. Its explanatory comments describe intended SQL semantics; none are skip comments (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:70-70`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:88-88`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:132-134`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:202-202`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:234-234`). All three should remain integration-level API tests.

## Cypress command expansion

The only custom Cypress command invoked directly is `cy.login()` in the `beforeEach` hook (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:62-67`). Its implementation:

1. Keys a `cy.session` by the seed organization admin email (`packages/e2e/cypress/support/commands.ts:152-154`).
2. Creates the session with `POST api/v1/login`, using the seed admin email/password, and requires HTTP 200 (`packages/e2e/cypress/support/commands.ts:155-165`).
3. Restores/reuses that session across tests and validates it with `GET api/v1/user`, again requiring HTTP 200 (`packages/e2e/cypress/support/commands.ts:167-170`).

The credentials are the active seed admin (`demo@lightdash.com`) and seed password (`packages/common/src/index.ts:464-481`). The API-test equivalent is the existing `login()` helper, which posts the same credentials and returns a cookie-aware `ApiClient` (`packages/api-tests/helpers/auth.ts:13-27`; `packages/api-tests/helpers/api-client.ts:22-78`). Use it once in `beforeAll`; there is no test-specific session mutation requiring a fresh login.

`runMetricQuery` is a file-local helper, not a custom command. It:

- posts `{ context: 'exploreView', query }` to `POST /api/v2/projects/{projectUuid}/query/metric-query` and requires status 200 (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:43-55`);
- takes `body.results.queryUuid` without independently validating its presence (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:52-55`);
- polls `GET /api/v2/projects/{projectUuid}/query/{queryUuid}` every 200 ms until `results.status === 'ready'`, throwing only when `results.error` is truthy (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:14-40`);
- returns `results.rows` and uses `getRawValue` to index the expected field/value/raw shape directly (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:39-40`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:59-60`).

The backend protects both routes with authentication (`packages/backend/src/controllers/v2/QueryController.ts:63-75`, `packages/backend/src/controllers/v2/QueryController.ts:173-177`). Metric execution also checks the account's ability to view the requested explore (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:4222-4265`). This suite exercises only the admin-success path, not editor/viewer or denied access.

## State, seed, and environment assumptions

- The project is `SEED_PROJECT.project_uuid`, UUID `3675b69e-8324-4110-bdca-059031aa8da3`, named `Jaffle shop` (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:62-64`; `packages/common/src/index.ts:550-553`). There are no slug lookups.
- The compiled seed project must expose `orders`, `customers`, and `customer_order_payments` with every field ID used in the payloads. In particular, direct orders total is a `sum` (`examples/full-jaffle-shop-demo/dbt/models/orders.yml:370-371`), customer total is deduped by order ID (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:63-68`), and the wide table models compound order/line-item/payment fanout (`examples/full-jaffle-shop-demo/dbt/models/customer_order_payments.yml:3-22`).
- Seed warehouse data must be non-empty: every total must be greater than zero; grouped queries must return more than one row with more than one distinct metric value; selected order/payment keys must be non-null (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:106-125`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:175-216`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:252-281`). No exact amount is assumed.
- Every query has empty filters/calculations/additional metrics/overrides and a limit of 500 (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:71-104`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:135-173`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:222-250`). No request timezone is supplied, so project/server/warehouse defaults apply.
- Cypress resolves relative API URLs against `http://localhost:3000` (`packages/e2e/cypress.config.ts:24-27`). The API-test port should use the existing `SITE_URL` behavior, which defaults to the same URL but supports `process.env.SITE_URL` (`packages/api-tests/helpers/api-client.ts:1-1`). The API-test setup performs a live `/api/v1/health` check (`packages/api-tests/vitest.setup.ts:4-9`).
- Required runtime infrastructure is a live backend, its Postgres database/session state, the seeded compiled project, and its configured warehouse. Async query execution obtains warehouse credentials and executes through the backend service; it is not a mocked/unit path (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:4288-4335`). Depending on deployment configuration, normal async-query cache/result storage and queue infrastructure are also involved. No browser, headless-browser service, third-party page, popup, or email service is involved.
- Each of the six query POSTs creates its own query-history record even after checking the shared result cache (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3694-3739`). The first query in an organization may also persist onboarding `ranQueryAt` (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3658-3672`). These mutations are generated-key/monotonic and should not collide across Cypress/API dual-run. Cypress retries can create additional history rows.
- There are no aliases, fixtures loaded by the test, name-based resources, uploads/downloads, explicit cleanup, or assumptions about another suite. Tests share only seed project/data and a cached admin session. Within each test, the baseline total query intentionally completes before the comparison query; there is no required ordering among the three tests.

## Synchronization and timeout requirements

The query endpoint is asynchronous: POST returns a query UUID and GET exposes pending/queued/executing/ready/error/expired/cancelled states (`packages/common/src/types/api.ts:814-827`, `packages/common/src/types/api.ts:863-900`; `packages/common/src/types/queryHistory.ts:21-29`). The source's recursive polling has no retry count or wall-clock deadline (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:14-40`). In particular, cancelled has no `error` field and an expired/error response may have a null error, so those states can recurse forever rather than fail clearly (`packages/common/src/types/api.ts:885-900`). Cypress's 10-second command timeout and configurable run retries do not provide a clear overall poll contract (`packages/e2e/cypress.config.ts:12-20`).

The API port should use a local bounded poll:

- poll every 200 ms to preserve current responsiveness;
- allow up to 60 seconds, matching the API-test package guidance for slow CI and fitting inside its 120-second test timeout (`packages/api-tests/vitest.config.ts:5-8`);
- return rows only for `READY`;
- fail immediately with query UUID/error for `ERROR`, `EXPIRED`, or `CANCELLED`;
- continue only for `PENDING`, `QUEUED`, and `EXECUTING`;
- fail with an explicit timeout after the deadline.

Each test must await the baseline total before starting the grouped/deduped comparison, preserving source ordering. No arbitrary wait is needed outside polling. The API suite disables file-level parallelism (`packages/api-tests/vitest.config.ts:12-12`), but the tests are independently safe if that policy changes; only warehouse load may justify bounded swarm concurrency.

## Locator and strictness risks

There are no DOM, text, role, CSS, canvas/SVG, Monaco, virtualization, or visual locators.

API strictness risks are:

- `getRawValue` assumes `row[fieldId].value.raw` exists; a renamed/missing field produces an indexing exception rather than a targeted assertion (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:59-60`). Preserve strict field IDs, but have the port's assertions make a missing field failure readable.
- The local `ResultRow` type claims every value has `formatted`, although only `raw` is read (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:5-5`). Prefer the exported API/result types instead of reproducing this shape.
- The Cypress helper hides response typing with chainable casts, including `as unknown as` (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:41-41`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:56-56`). The port should use `Body<ApiExecuteAsyncMetricQueryResults>` and `Body<ApiGetAsyncQueryResults>` so status narrowing is honest (`packages/common/src/types/api.ts:821-827`, `packages/common/src/types/api.ts:885-900`).
- `Number(raw)` coerces null to zero and arbitrary strings to numbers/`NaN`. Positive-total assertions catch several failures, while grouped values are only indirectly checked (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:109-112`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:188-204`). Preserve behavior unless migration scope explicitly includes strengthening value validation.

## Nonstandard or surprising behavior

- All three browser-run tests are pure HTTP tests; migration to Playwright would retain unnecessary browser cost.
- Polling is recursive and unbounded, and only a truthy `error` stops it. Terminal cancellation or null-error expiration can hang (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:30-38`; `packages/common/src/types/api.ts:885-900`). Fix this migration-level synchronization defect in the local API helper.
- Grouped totals are rounded to two decimal places before comparison, while the ungrouped total is not normalized (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:196-204`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:274-281`). This relies on the raw total already matching the fixture's two-decimal money values/aggregation.
- The first test proves equivalence with a direct orders sum but does not query the intentionally inflated regular customer metric (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:69-125`). This is intentional source behavior, not additional coverage to invent during a mechanical port.
- Query sorts are semantically irrelevant for one-row totals but are still included in the first test's requests (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:76-81`, `packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:94-99`). Preserve payloads to avoid changing query-generation coverage.
- No debounce, intercept aliases, downloads/uploads, clipboard, drag-and-drop, iframes, popups, browser APIs, or explicit timezone manipulation occurs.

## Coordination requirements

No coordinator prerequisite or new shared infrastructure is required. Reuse only the existing API-test `ApiClient` and `login()` helper (`packages/api-tests/helpers/api-client.ts:22-114`; `packages/api-tests/helpers/auth.ts:13-27`). Keep the metric-query polling helper local to the new target file: one local use does not justify changing shared helpers. Query history uses generated UUIDs, there are no duplicate-name risks, and no cleanup contract is needed for this read-only warehouse test.

Operationally, dual-run is safe on the shared preview, but the orchestrator should avoid excessive parallel copies because each complete run submits six async warehouse queries and writes six query-history records (`packages/e2e/cypress/e2e/api/sumDistinctWithFanout.cy.ts:69-285`; `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:3720-3739`).

## Exact port plan

1. Create exactly `packages/api-tests/tests/sumDistinctWithFanout.test.ts`. Do not create a Playwright spec and do not change shared helpers.
2. Import `SEED_PROJECT`, the exported async-query/result types, and `QueryHistoryStatus` from `@lightdash/common`; import Vitest lifecycle/assertion APIs, `ApiClient`/`Body`, and `login()` from the existing API-test helpers.
3. Log in once in `beforeAll` as the seed organization admin. Preserve the source's authenticated success scope; do not add permission-role cases.
4. Add a file-local typed `runMetricQuery` that POSTs the unchanged `{ context: 'exploreView', query }` payload, asserts HTTP 200, reads the typed query UUID, and polls the typed GET route with a 60-second deadline and 200-ms interval. Exhaustively handle `READY`, `PENDING`, `QUEUED`, `EXECUTING`, `ERROR`, `EXPIRED`, and `CANCELLED`; include query UUID/status/error in failures.
5. Port all three active tests and their query payloads without renaming explores/fields, changing sorts/limits, hard-coding totals, or adding coverage. Convert Chai assertions to Vitest equivalents while preserving one-row, positive-total, equality, multi-row, distinct-value, grouped-sum, and non-null-key checks.
6. Keep `getRawValue` local or inline equivalent typed access. Do not reproduce Cypress chainable casts or introduce unsafe assertions. Keep the source's two-decimal grouped-sum normalization so the port is behaviorally equivalent.
7. Do not add cleanup: the endpoint's query-history/cache lifecycle is backend-owned, and the tests create no user-named domain resource. Leave the Cypress source authoritative during dual-run.

## Verification plan

Run against the normal live development instance (override `SITE_URL` only when needed):

```bash
SITE_URL=http://localhost:3000 pnpm -F api-tests test:api -- sumDistinctWithFanout
pnpm -F api-tests lint
pnpm -F api-tests typecheck
pnpm -F api-tests format
```

The focused command follows the package's Vitest script (`packages/api-tests/package.json:9-15`). Success requires all three tests to pass without a browser and without poll timeouts. No Playwright/Cypress command is required to verify the target itself; retain existing Cypress execution separately during the migration dual-run.

## Open questions

- Non-blocking: confirm the API-test deployment's seeded `Jaffle shop` compilation always includes the newer `customer_order_payments` model and sum-distinct metrics from `examples/full-jaffle-shop-demo/dbt/models/customer_order_payments.yml:3-205`. The assigned Cypress test assumes this already, but the API target should report a missing explore/field clearly rather than mask it as a polling timeout.
- No clarification or coordination is required before porting.

## Port history

Not started.

### 2026-07-17 — API-test port implemented

- Target: `packages/api-tests/tests/sumDistinctWithFanout.test.ts`.
- Behavior ported: all 3 active Cypress cases, with unchanged explores, fields, sorts, limits, sequential baseline/comparison queries, numeric assertions, and two-decimal grouped-sum normalization. Added local typed async-query polling at 200 ms with a 60-second deadline and exhaustive ready/pending/queued/executing/error/expired/cancelled handling.
- Skipped decisions: none; the source has 0 skipped tests. Cypress source remains unchanged.
- Verification:
  - `pnpm -F common build:fast` — passed; required because the frozen install did not create the ignored `packages/common/dist` build output.
  - `SITE_URL=http://localhost:3000 pnpm -F api-tests test:api tests/sumDistinctWithFanout.test.ts` — passed: 1 file, 3 tests.
  - `pnpm -F api-tests typecheck` — passed.
  - `pnpm -F api-tests lint` — passed with 5 pre-existing disabled-test warnings in `embedChart.test.ts` and `savedChartGet.test.ts`; no target warnings/errors.
  - `pnpm -F api-tests format` — passed.
  - `git diff --check` — passed before this append.
  - The findings command `SITE_URL=http://localhost:3000 pnpm -F api-tests test:api -- sumDistinctWithFanout` does not focus Vitest in this package: after building common it ran all 46 destination files. Result: 30 files passed, 16 failed; 462 tests passed, 113 failed, 78 skipped. The target did not fail. Unrelated failures reflect the shared development environment/state, including missing `jaffle.timezone_test`, unresolved `db-dev`, missing seeded role users, and existing permission/state mismatches. An initial attempt before the common build failed imports because `@lightdash/common` had no dist output.
- Remaining risks: the focused coverage is green and confirms the required `customer_order_payments` seed model. The full destination suite remains non-green for unrelated shared-environment prerequisites listed above.
- Commit: pending (not committed; awaiting serialized signing lease).
