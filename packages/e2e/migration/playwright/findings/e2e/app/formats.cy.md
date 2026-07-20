# packages/e2e/cypress/e2e/app/formats.cy.ts

## Classification

Recommended runner: Removal; existing Common Vitest coverage is the primary replacement. If exact legacy-metadata integration coverage is still required, use a Common unit test, not Playwright.
Execution lane: common-unit (only if retained); otherwise none
Active tests: 0
Skipped tests: 1
Persistent mutation: None while skipped. If enabled, it creates/reuses an admin login session and executes an async metric query, which can leave session/query-history/cache records but does not mutate named Lightdash content.
Shared-preview dual-run safe: Yes if enabled; it is read-only with respect to project content and query executions receive query UUIDs. Concurrent runs can still add load to the shared seed warehouse/query infrastructure.
Difficulty total: 6/18 (persistent/shared state 0, browser interaction complexity 1, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 1, cross-file infrastructure 0)
Coordination keys: `formats-default-currency-contract`, `packages/common/src/utils/formatting.test.ts`
Analysis status: clarification-required

The suite and its only test are both explicitly skipped (`packages/e2e/cypress/e2e/app/formats.cy.ts:3,9`), and the adjacent comment already says to move the behavior to a unit test (`packages/e2e/cypress/e2e/app/formats.cy.ts:8`). The old no-round currency expectations conflict with current unit-level behavior: the Cypress test expects EUR/GBP/DKK integers without decimal places (`packages/e2e/cypress/e2e/app/formats.cy.ts:109-118`), while current formatter tests expect default EUR/GBP/DKK currency output with two decimal places (`packages/common/src/utils/formatting.test.ts:429-460`). That contract must be clarified before preserving the exact old assertion matrix.

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Explore` › `Should query in explore with formats and rounds` | Skipped: inherited `describe.skip` and direct `it.skip` (`packages/e2e/cypress/e2e/app/formats.cy.ts:3,9`) | Loads a hand-built Explore URL for the seed `events` model, runs nine aggregate metrics, checks their headers, and checks EUR rounding, GBP/JPY/DKK, km/mi, and percent display (`packages/e2e/cypress/e2e/app/formats.cy.ts:10-123`). | If enabled: login session plus async query/query-history/cache artifacts; no chart/dashboard/space/project write and no cleanup. | Large JSON query in a URL, `encodeURI`, async warehouse query, positional table selectors, and a cartesian chart config even though only the results table is asserted (`packages/e2e/cypress/e2e/app/formats.cy.ts:62-90,92-122`). | Remove rather than port to Playwright because formatter units already cover the intended primitives. If an exact regression matrix is wanted, add one table-driven test in `packages/common/src/utils/formatting.test.ts` after resolving the stale default-currency expectation. |

There are no active tests. Because the containing suite is skipped, its `beforeEach` does not currently execute.

## Cypress command expansion

- `cy.login()` is the only project-defined custom Cypress command invoked, through the suite `beforeEach` (`packages/e2e/cypress/e2e/app/formats.cy.ts:4-6`). It creates/reuses a `cy.session` keyed by the seed admin email, POSTs `api/v1/login` with seed admin credentials, requires HTTP 200, and validates restored sessions with GET `api/v1/user` status 200 (`packages/e2e/cypress/support/commands.ts:152-173`).
- The credentials imported by that command are `demo@lightdash.com` / `demo_password!`; this account is the seeded organization admin David Attenborough (`packages/common/src/index.ts:465-481`). No UI login flow is under test.
- `cy.visit`, `cy.get`, `contains`, and `click` are built-in Cypress commands, not repository custom commands.
- If this were ported to Playwright, no new auth helper would be justified: the existing setup performs the same POST `/api/v1/login` and GET `/api/v1/user`, then writes storage state (`packages/e2e/playwright/auth.setup.ts:10-23`), and the Firefox project consumes it (`packages/e2e/playwright.config.ts:33-40`). The recommended unit/removal path needs no authentication at all.

## State, seed, and environment assumptions

- The route hard-codes the imported seed project UUID through `SEED_PROJECT.project_uuid` (`packages/e2e/cypress/e2e/app/formats.cy.ts:1,88-90`), currently `3675b69e-8324-4110-bdca-059031aa8da3`, project name `Jaffle shop` (`packages/common/src/index.ts:550-558`).
- The project must already contain a compiled `events` Explore with the exact field IDs listed at `packages/e2e/cypress/e2e/app/formats.cy.ts:11-24`. The source model defines the underlying `event_id` number dimension (`examples/full-jaffle-shop-demo/dbt/models/events.yml:190-195`) and the legacy format metadata: GBP, JPY, DKK, EUR, EUR round 2, EUR round 0, mi, km, and percent (`examples/full-jaffle-shop-demo/dbt/models/events.yml:255-298`).
- The query filters `events_event_id < 2000`, requests aggregate sums, sorts by `events_in_eur` descending, and limits to one row (`packages/e2e/cypress/e2e/app/formats.cy.ts:26-47`). The expected base value `1,999,000` assumes event IDs 1 through 1999 exist and sum to that value. The demo generator assigns IDs sequentially as `i + 1` after sorting (`examples/full-jaffle-shop-demo/dbt/scripts/generate_product_events.py:197-205`).
- The fixed filter-group IDs at `packages/e2e/cypress/e2e/app/formats.cy.ts:28,31` are payload identities only; the test does not create, look up, or clean up objects by those IDs.
- It assumes the frontend and backend are reachable through Cypress's fixed `http://localhost:3000` base URL and the normal 1920×1080 viewport (`packages/e2e/cypress.config.ts:15-26`). It also requires the backend, seeded metadata/database, and the seed project's warehouse/query execution path. No environment variable is read by this spec.
- No fixture file, alias, test-local storage seed, upload/download, external SaaS, or prior suite is used. Cypress blocks analytics/support hosts globally, but none is material to the assertions (`packages/e2e/cypress.config.ts:27-31`).
- The only shared state is the deterministic seed project/model and admin identity. There are no duplicate-name risks because the test creates no named content.

## Synchronization and timeout requirements

- The source has no `cy.intercept`, aliases, explicit network waits, or custom timeout. It relies on Cypress's 10-second default command timeout (`packages/e2e/cypress.config.ts:15-20`) and retrying DOM assertions after clicking `Run query` (`packages/e2e/cypress/e2e/app/formats.cy.ts:92-122`).
- The click starts an async v2 metric query via POST `/api/v2/projects/{projectUuid}/query/metric-query` (`packages/frontend/src/hooks/useQueryResults.ts:81-92`). Query status is polled with GET `/api/v2/projects/{projectUuid}/query/{queryUuid}` using 250 ms, 500 ms, then 1,000 ms backoff until status is no longer queued/pending/executing (`packages/frontend/src/features/queryRunner/executeQuery.ts:15-39`).
- A browser port would need to wait on a semantic results state or the specific query response/poll completion before asserting cells. A fixed sleep would be inappropriate. The current positional `contains` calls happen to retry, but give no direct evidence that the intended query—not stale results—completed.
- The recommended Common unit test is synchronous and needs no network wait, timeout override, retries, or live service.

## Locator and strictness risks

- `cy.get('button').contains('Run query')` (`packages/e2e/cypress/e2e/app/formats.cy.ts:93`) is broad and substring-based. The rendered label may include a limit, and another matching button would make a Playwright role locator strictness-fail. If browser coverage is explicitly retained, scope to the Explore controls and use an accessible button name matching the full current label.
- Header and cell assertions use global CSS selectors plus `:nth-child(i + 2)` (`packages/e2e/cypress/e2e/app/formats.cy.ts:95-122`). They assume exactly one relevant table, a leading row-number column, the exact visible column order, and no hidden/pinned/virtualized column restructuring.
- Cypress `.contains(field)` is not exact, so values such as `€1,999,000` can also match `€1,999,000.00`. Playwright assertions should use exact cell text if this remains a browser test.
- The source never scopes locators to a Results card/table and does not identify rows or columns by accessible header association. A browser rewrite should locate the results region first and resolve each cell from its column header rather than preserve nth-child selectors.
- Header labels are inferred from field names and asserted in configured order (`packages/e2e/cypress/e2e/app/formats.cy.ts:49-60,95-108`); no stable test IDs are present or needed for the recommended unit/removal path.

## Nonstandard or surprising behavior

- The suite is doubly skipped, not merely skipped by its enclosing suite (`packages/e2e/cypress/e2e/app/formats.cy.ts:3,9`). Its login hook and body therefore provide no current CI coverage.
- The test serializes a full chart/query object into `create_saved_chart_version` with `encodeURI(JSON.stringify(...))` (`packages/e2e/cypress/e2e/app/formats.cy.ts:10-90`). The frontend reads this parameter and directly parses its JSON (`packages/frontend/src/hooks/useExplorerRoute.ts:162-172`). This is incidental setup rather than the stated formatting behavior.
- The URL includes a cartesian bar-series configuration (`packages/e2e/cypress/e2e/app/formats.cy.ts:62-83`), so enabling it may render chart SVG/canvas work, but no chart assertion is made. No canvas/SVG interaction is required.
- The raw sum is repeated across all nine metrics because they are format variants of the same `event_id` sum. Percent formatting multiplies `1,999,000` by 100, producing the old expected `199,900,000%` (`packages/e2e/cypress/e2e/app/formats.cy.ts:109-118`).
- Results-grid numeric metrics are currently formatted through `formatItemValue`, rather than trusting the backend-formatted value (`packages/frontend/src/hooks/useColumns.tsx:102-130`). Legacy metadata is converted to structured custom formats by `getCustomFormatFromLegacy`, including currencies, km/mi suffixes, and percent (`packages/common/src/utils/formatting.ts:490-530,610-648`).
- Existing formatter tests already cover currency symbols/codes and percent (`packages/common/src/utils/formatting.test.ts:429-474`), plus km/mi and explicit rounds (`packages/common/src/utils/formatting.test.ts:609-720`). This supports removal or a small matrix consolidation, not a new end-to-end helper.
- No debounce, popup, iframe, clipboard, Monaco, drag-and-drop, upload/download, browser API, timezone, or explicit virtualization mechanic is exercised.

## Coordination requirements

- No shared Playwright fixture, page object, locator helper, auth helper, or API helper should be added for this one skipped test. Existing Playwright auth would already suffice if a browser test were later demanded (`packages/e2e/playwright/auth.setup.ts:10-23`).
- Before changing `packages/common/src/utils/formatting.test.ts`, coordinate on key `formats-default-currency-contract`: another migration worker may also target this central formatter test, and the old integer-currency expectations conflict with its current assertions.
- Shared-preview Cypress/Playwright dual execution is content-safe because there are no content writes or names. The only coordination concern is resource load on the common seed project/warehouse and accumulation of independent session/query records.
- No ordering with another spec is required, no aliases or module globals are shared, and there is no cleanup to centralize.

## Exact port plan

1. Do **not** create `packages/e2e/playwright/app/formats.spec.ts`; the source comment identifies this as unit behavior (`packages/e2e/cypress/e2e/app/formats.cy.ts:8`), and the rendered-table path delegates numeric formatting to Common (`packages/frontend/src/hooks/useColumns.tsx:102-130`).
2. Confirm with the formatter owner whether default legacy EUR/GBP/DKK should render ISO-default decimals, as current Common tests require (`packages/common/src/utils/formatting.test.ts:429-460`), or omit decimals, as the stale skipped Cypress expectations require (`packages/e2e/cypress/e2e/app/formats.cy.ts:109-118`).
3. Preferred outcome: remove `packages/e2e/cypress/e2e/app/formats.cy.ts` with no replacement because `packages/common/src/utils/formatting.test.ts` already covers currencies, percent, units, and explicit rounds (`packages/common/src/utils/formatting.test.ts:429-474,609-720`).
4. Only if the exact combined regression is considered valuable, add one table-driven test to existing `packages/common/src/utils/formatting.test.ts`. Feed `1_999_000` through `getCustomFormatFromLegacy`/`applyCustomFormat` for EUR default/round 0/round 2, GBP, JPY, DKK, km, mi, and percent. Use the clarified current contract; do not copy stale browser expectations blindly. No new helper file or shared infrastructure is warranted.
5. Remove the skipped Cypress source after the chosen unit/removal path lands. Do not preserve the hand-built Explore URL, chart config, warehouse query, authentication, or positional DOM assertions in the replacement.

## Verification plan

For the preferred removal-only outcome:

```bash
pnpm -F common test -- src/utils/formatting.test.ts
pnpm -F common typecheck:fast
pnpm -F common lint
pnpm -F common format
```

If the optional table-driven unit test is added, run the same commands. No browser, seed, migration, warehouse, or Playwright run is necessary because no Playwright target should be created. If product clarification instead requires a browser integration test, verify the exact target only after implementation with:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e playwright:run -- playwright/app/formats.spec.ts
pnpm -F e2e lint
pnpm -F e2e format
```

The latter is a fallback, not the recommendation.

## Open questions

1. Is the current contract for no-round legacy EUR/GBP/DKK ISO-default decimal output (for example `€1,999,000.00` / `DKK 1,999,000.00`), or should integer values omit decimals as the skipped Cypress test expected? Existing unit evidence and the skipped test disagree (`packages/common/src/utils/formatting.test.ts:429-460`; `packages/e2e/cypress/e2e/app/formats.cy.ts:109-118`).
2. Does the team want to retain an integration assertion that dbt legacy metadata compiles into the formatter correctly, or is the existing formatter-level coverage sufficient? The source's own TODO only says “move to unit test” and gives no issue/history (`packages/e2e/cypress/e2e/app/formats.cy.ts:8`).
3. If integration coverage is required, should it be a compiler/unit fixture rather than a rendered results-grid test? No evidence in the assigned file identifies which boundary originally regressed.

## Port history

Not started.

### 2026-07-20 — retirement disposition verified

- Retire this spec without Playwright or new unit coverage. Its only suite and test remain doubly disabled by `describe.skip` and `it.skip` (`packages/e2e/cypress/e2e/app/formats.cy.ts:3,9`), so it has zero active coverage and its login hook does not execute.
- Existing Common tests are the authoritative replacement: legacy km/mi units, current currency defaults (including EUR/GBP two decimals, JPY zero decimals, and DKK two decimals), percent scaling, and explicit zero/positive/currency/percent rounds are covered in `packages/common/src/utils/formatting.test.ts:411-474,510-720,2255-2326`. The skipped browser's integer default expectations for EUR/GBP/DKK are stale and must not be preserved.
- No Playwright file or unit file was created, and no Common implementation/test/config/package file changed. Keep the Cypress source unchanged during dual-run; deletion remains deferred to the final all-sources removal.
- Authoritative verification used repository-pinned Node 20.19.4 from `.nvmrc`:
  - `PATH=/nix/store/h498bf8iiv260ysmfslql4b1p8v3jvk2-nodejs-20.19.4/bin:$PATH pnpm -F common exec vitest run --config vitest.config.ts src/utils/formatting.test.ts --reporter=verbose` — 184/184 passed.
  - `PATH=/nix/store/h498bf8iiv260ysmfslql4b1p8v3jvk2-nodejs-20.19.4/bin:$PATH pnpm -F common typecheck:fast` — passed.
  - `PATH=/nix/store/h498bf8iiv260ysmfslql4b1p8v3jvk2-nodejs-20.19.4/bin:$PATH pnpm -F common lint` — passed with 0 errors and 6 existing warnings outside the formatter disposition.
  - `PATH=/nix/store/h498bf8iiv260ysmfslql4b1p8v3jvk2-nodejs-20.19.4/bin:$PATH pnpm -F common format` — passed.
- Environment evidence: ambient Node 24.16.0 uses newer Intl defaults (`COP 1` and `HUF 1`) and the direct focused file reported 183 passed/1 unrelated `available currencies` failure; pinned Node 20.19.4 reports the expected `COP 1.00`/`HUF 1.00` and is authoritative. The earlier package-script form with a literal `--` was parsed as a positional filter and ran 110 files, so its result is command-forwarding evidence, not focused coverage.
