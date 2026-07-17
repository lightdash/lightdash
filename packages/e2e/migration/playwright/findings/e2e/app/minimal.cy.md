# packages/e2e/cypress/e2e/app/minimal.cy.ts

## Classification

Recommended runner: Playwright
Execution lane: Seeded, read-only browser E2E (Firefox)
Active tests: 5
Skipped tests: 0
Persistent mutation: No content mutation; authentication and async query execution create session/query/cache side effects.
Shared-preview dual-run safe: Yes, with added warehouse load and cache invalidation but no shared content-name collision from this spec.
Difficulty total: 7/18 (persistent/shared state 1, browser interaction complexity 1, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 1, cross-file infrastructure 0)
Coordination keys: seed project `3675b69e-8324-4110-bdca-059031aa8da3`; three seeded chart names; seeded `Jaffle dashboard`; edge-case dashboard `4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba`; admin storage state; PostgreSQL `jaffle` warehouse; Loom request isolation
Analysis status: analyzed

This is a browser test, not an API-test candidate: the list requests only discover dynamic UUIDs, while every test's contract is rendered chart/table/dashboard DOM or the hidden screenshot-readiness DOM signal (`packages/e2e/cypress/e2e/app/minimal.cy.ts:9-135`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `I can view a minimal chart` | Active | Finds the exact seeded chart name through `GET /api/v1/projects/:projectUuid/charts`, opens its minimal route, and checks an ECharts wrapper plus `Payment method` and `Total revenue` (`packages/e2e/cypress/e2e/app/minimal.cy.ts:9-27`). | Login cookie/session; saved-chart query execution and query/cache records. No content write. | ECharts rendering and loose text matching. | Playwright in `packages/e2e/playwright/app/minimal.spec.ts`. |
| `I can view a minimal table` | Active | Finds the exact seeded table chart, opens it, scopes assertions to a native `table`, and checks two headers (`packages/e2e/cypress/e2e/app/minimal.cy.ts:29-48`). | Login cookie/session; saved-chart query execution and query/cache records. No content write. | Async table rendering. | Playwright in the same target file. |
| `I can view a minimal big number` | Active | Finds the seeded big-number chart, opens it, checks its label and fixture-derived value containing `2,397` (`packages/e2e/cypress/e2e/app/minimal.cy.ts:50-68`). | Login cookie/session; saved-chart query execution with cache invalidation. No content write. | Locale/data-sensitive formatted number. | Playwright in the same target file. |
| `I can view a minimal dashboard` | Active | Finds `Jaffle dashboard`, renders markdown and multiple chart types, and checks a filtered big-number value plus bar/table text (`packages/e2e/cypress/e2e/app/minimal.cy.ts:69-99`). | Login cookie/session; multiple chart queries with cache invalidation. No content write. | React grid, five chart tiles, markdown, and a Loom iframe. The dashboard title assertion is intentionally commented because minimal mode omits titles (`packages/e2e/cypress/e2e/app/minimal.cy.ts:81`). | Playwright in the same target file; locally abort Loom traffic. |
| `Screenshot ready indicator works with edge cases (orphan tiles, empty results, errors)` | Active | Opens the deterministic edge-case dashboard, waits up to 30 seconds for the hidden indicator, then checks four total tiles, at least one error, and `completed-with-errors` (`packages/e2e/cypress/e2e/app/minimal.cy.ts:101-135`). | Login cookie/session; three extant chart queries plus query/cache/error records. No content write. | Hardcoded seed UUID, orphan relation, empty result, invalid metric, hidden element, custom timeout, numeric attribute conversion. | Playwright in the same target file. |

There is no `it.skip`, `describe.skip`, or inherited skip. The commented assertion at `packages/e2e/cypress/e2e/app/minimal.cy.ts:81` is not a skipped test; do not port it as an active title assertion. All five tests should remain browser E2E tests. None should move to API tests, CLI/Node, unit tests, or removal.

## Cypress command expansion

The only custom command invoked directly is `cy.login()` from the suite `beforeEach` (`packages/e2e/cypress/e2e/app/minimal.cy.ts:5-8`). Its implementation:

- Uses `cy.session` keyed by `demo@lightdash.com` (`packages/e2e/cypress/support/commands.ts:152-154`; seed value at `packages/common/src/index.ts:474-476`).
- Creates the session with `POST api/v1/login`, using the seeded admin email/password, and requires status 200 (`packages/e2e/cypress/support/commands.ts:155-165`; password at `packages/common/src/index.ts:478-480`).
- Validates restored sessions with `GET api/v1/user` status 200 (`packages/e2e/cypress/support/commands.ts:167-170`).
- The role is organization admin (`packages/common/src/index.ts:481`), and the seed grants that user admin access to the default space (`packages/backend/src/database/seeds/development/01_initial_user.ts:252-255`).

Playwright already provides the equivalent shared setup: `packages/e2e/playwright/auth.setup.ts:9-23` posts the same credentials, validates `/api/v1/user`, and writes storage state. The Firefox project consumes that state (`packages/e2e/playwright.config.ts:34-40`), so the port needs no login hook or new auth helper.

Relevant global Cypress behavior also comes from importing commands in `packages/e2e/cypress/support/e2e.ts:17`. The uncaught-exception handler at `packages/e2e/cypress/support/commands.ts:134-141` uses a broad-looking regular expression and can suppress errors. Do not reproduce that suppression in Playwright; page errors exposed by the port should be investigated.

## State, seed, and environment assumptions

- The project is the deterministic `Jaffle shop` UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-558`).
- The chart list response must have `body.results`, and `.find(...)` must return an object with `uuid`; the Cypress source does not check response status, response shape, absence, or duplicates before dereferencing (`packages/e2e/cypress/e2e/app/minimal.cy.ts:10-20`, `30-40`, `51-59`). `cy.request` supplies the implicit non-2xx failure only.
- Seeded saved queries are recreated after deleting all prior `saved_queries` (`packages/backend/src/database/seeds/development/02_saved_queries.ts:21`). The relevant exact names/configurations are the cartesian chart (`packages/backend/src/database/seeds/development/02_saved_queries.ts:45-69`), big number (`packages/backend/src/database/seeds/development/02_saved_queries.ts:119-148`), and table (`packages/backend/src/database/seeds/development/02_saved_queries.ts:301-338`). Their UUIDs are generated, so name lookup is necessary after each reseed.
- The big-number label is seeded as `Payments total revenue` (`packages/backend/src/database/seeds/development/02_saved_queries.ts:145-148`). The displayed `2,397` is data- and formatting-dependent, not stored as a seed assertion value.
- `Jaffle dashboard` is recreated after all dashboards are deleted (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:477-482`). It contains markdown, a Loom tile, and the relevant saved chart tiles (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:70-181`, `204-213`). Its completed-order and past-ten-years filters (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:216-238`) explain why its expected big number `1,961.5` differs from the standalone chart.
- The edge seed creates one valid bar, one empty table, one table using invalid field `orders_total_order_amount_foobar`, and one chart later deleted to produce an orphan (`packages/backend/src/database/seeds/development/08_scheduled_delivery_edge_cases_dashboard.ts:45-228`, `228-283`, `395-409`). It rewrites the dashboard UUID to `4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba` (`packages/backend/src/database/seeds/development/08_scheduled_delivery_edge_cases_dashboard.ts:385-390`).
- The seed project uses a PostgreSQL warehouse and schema `jaffle`; seeding requires `DBT_DEMO_DIR`, `PGHOST`, `PGPORT`, `PGPASSWORD`, `PGUSER`, and `PGDATABASE` (`packages/backend/src/database/seeds/development/01_initial_user.ts:171-227`). Runtime therefore requires frontend/backend, application PostgreSQL, and a queryable seeded warehouse.
- Minimal saved charts load the chart through v2 `GET /projects/:projectUuid/saved/:id` (`packages/frontend/src/hooks/useSavedQuery.ts:89-99`) and auto-run the initial saved-chart query (`packages/frontend/src/hooks/useExplorerQueryEffects.ts:205-223`). Query execution uses v2 `POST /projects/:projectUuid/query/chart`, followed by v2 paged `GET /projects/:projectUuid/query/:queryUuid` (`packages/frontend/src/hooks/useQueryResults.ts:95-106`, `276-297`).
- Minimal dashboards load through v2 `GET /projects/:projectUuid/dashboards/:id` (`packages/frontend/src/hooks/dashboard/useDashboard.ts:37-43`) and set `defaultInvalidateCache={true}` (`packages/frontend/src/pages/MinimalDashboard.tsx:610-618`). Standalone minimal saved-chart queries also invalidate cache (`packages/frontend/src/hooks/explorer/buildQueryArgs.ts:68-79`). These are persistent/transient query-history and cache side effects, but query UUIDs are independent and no content UUID/name is written.
- Cypress uses a 1920x1080 viewport, 10-second default command timeout, fixed `http://localhost:3000`, and two run retries by default (`packages/e2e/cypress.config.ts:13-26`). Playwright matches the viewport, defaults to the same URL with `PLAYWRIGHT_BASE_URL` override, has 10-second assertions/actions and 30-second navigation, runs one Firefox worker, and retries only in CI (`packages/e2e/playwright.config.ts:4-40`).
- No aliases, fixtures, mutable module state, cleanup, or dependency on another test/suite exists. Each test restores the admin session and discovers its own content. A clean browser `sessionStorage` is assumed: `MinimalDashboard` reads send-now scheduler filter/parameter keys even without this test setting them (`packages/frontend/src/pages/MinimalDashboard.tsx:318-339`).

## Synchronization and timeout requirements

- The Cypress source relies on retrying DOM assertions for the first four tests and has no explicit network intercept. The fifth test alone raises the indicator wait to 30 seconds (`packages/e2e/cypress/e2e/app/minimal.cy.ts:110-113`).
- A minimal saved chart does not mount its ready indicator until the saved chart, health, query creation, and result rows are complete; query errors also terminate the wait (`packages/frontend/src/pages/MinimalSavedExplorer.tsx:77-124`, `181-187`). The port should wait for the hidden ready indicator to be attached before making chart/table/value assertions, with an explicit 30-second timeout.
- Dashboard readiness is stronger: the indicator appears only when every expected chart/SQL tile is in the ready or errored set (`packages/frontend/src/providers/Dashboard/DashboardTileStatusProvider.tsx:121-201`; `packages/frontend/src/pages/MinimalDashboard.tsx:295-305`). Use this signal before dashboard assertions rather than adding sleeps or response-count assumptions.
- The edge dashboard intentionally completes with errors. Wait for attachment, not visibility: the indicator is `display: none` (`packages/frontend/src/components/common/ScreenshotReadyIndicator.tsx:23-32`).
- The indicator's status is derived solely from `tilesErrored > 0` (`packages/frontend/src/components/common/ScreenshotReadyIndicator.tsx:16-29`). The Playwright test should explicitly reject a missing/non-numeric `data-tiles-errored` value before asserting it is greater than zero; `Number(null)` would otherwise misleadingly become zero.
- There is no debounce, manual network wait, upload/download, popup, clipboard, drag-and-drop, Monaco, virtualization, timezone override, or fixed sleep in this spec.

## Locator and strictness risks

- Exact-name `.find` silently selects the first duplicate and crashes indirectly when absent (`packages/e2e/cypress/e2e/app/minimal.cy.ts:13-20`, `33-40`, `54-59`, `73-78`). The port should assert exactly one matching result before using its UUID. Do not replace UUID discovery with a slug: repository guidance says slugs are not unique.
- `.echarts-for-react` is an implementation class and the source only checks existence, not visibility or completed painting (`packages/e2e/cypress/e2e/app/minimal.cy.ts:23`). Prefer the stable minimal visualization boundary `data-testid="visualization"` (`packages/frontend/src/pages/MinimalSavedExplorer.tsx:157-163`), then retain a scoped ECharts assertion only if parity requires proving the chart implementation.
- Cypress `cy.contains` is substring-based and tolerates multiple matches. Playwright text/role locators are strict. Scope chart assertions to the visualization, table assertions to one table, and dashboard assertions to the dashboard screenshot target. Use exact text where the rendered markup permits it; otherwise use an explicit scoped regex/substring and document why.
- The table source scopes correctly but begins from generic `table` (`packages/e2e/cypress/e2e/app/minimal.cy.ts:43-46`). Confirm there is exactly one table before using `getByRole('table')`.
- `[data-testid="big-number-value"]` is the strongest existing locator (`packages/e2e/cypress/e2e/app/minimal.cy.ts:63-66`, `88-91`). Preserve it and scope it to the relevant visualization/dashboard tile if strict mode finds more than one.
- The ready indicator is an ID exported as `lightdash-ready-indicator` (`packages/common/src/constants/screenshot.ts:10-16`), so `page.locator('#lightdash-ready-indicator')` is stable. It is intentionally hidden; do not use `toBeVisible`.
- Formatted numbers `2,397` and `1,961.5` are locale and warehouse-fixture sensitive. Preserve them for parity, but failures should first distinguish data drift from rendering failure.

## Nonstandard or surprising behavior

- Minimal mode actively executes fresh saved-chart queries: `invalidateCache` is true for minimal saved charts and dashboard tiles (`packages/frontend/src/hooks/explorer/buildQueryArgs.ts:68-79`; `packages/frontend/src/pages/MinimalDashboard.tsx:617`). Read-only dual runs therefore double warehouse work rather than merely reading a cache.
- `Jaffle dashboard` includes a real Loom iframe (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:70-81`), and minimal rendering includes Loom tiles (`packages/frontend/src/pages/MinimalDashboard.tsx:82-113`). The component requests `https://www.loom.com/embed/...` (`packages/frontend/src/components/DashboardTiles/DashboardLoomTile.tsx:51-64`). Cypress blocks `*.loom.com` (`packages/e2e/cypress.config.ts:27-33`), while Playwright has no equivalent block. The target spec should abort that URL locally; Loom content is not asserted and is not part of screenshot-ready tile counting.
- The dashboard title assertion is deliberately disabled because minimal pages omit titles (`packages/e2e/cypress/e2e/app/minimal.cy.ts:81`). Port the actual markdown/chart assertions, not the commented title assertion.
- The edge seed's variable/comment says “table with data,” but its metric ID ends in `_foobar`, making it the intended invalid-metric tile (`packages/backend/src/database/seeds/development/08_scheduled_delivery_edge_cases_dashboard.ts:180-226`). The source's line 103 description is therefore consistent with runtime behavior.
- The hidden indicator reports four expected chart tiles even though one saved chart has been deleted; an orphan dashboard tile remains because the foreign key is set null (`packages/backend/src/database/seeds/development/08_scheduled_delivery_edge_cases_dashboard.ts:322-333`, `395-401`).
- Cypress's global exception suppression is not a Playwright requirement (`packages/e2e/cypress/support/commands.ts:134-141`). Do not add a broad `page.on('pageerror')` ignore.

## Coordination requirements

- No new shared helper, fixture, auth project, config entry, or application test ID is justified. Existing auth storage is sufficient, and content lookup/readiness helpers are local to one target file.
- A file-local response parser/UUID lookup should be reused inside this file only. It must check HTTP success, validate the response boundary, and require exactly one exact-name match. Do not create cross-file infrastructure for these four lookups.
- Cypress and Playwright may run concurrently against the same seeded preview because this spec does not create, rename, or delete content. Expect approximately doubled query execution/cache invalidation and avoid running alongside reseeds or suites that mutate the named charts/dashboards.
- Multiple independent Playwright processes could race while writing `packages/e2e/playwright/.auth/admin.json`; the configured setup dependency and single worker avoid that within one run (`packages/e2e/playwright.config.ts:13`, `28-40`). Cypress/Playwright dual-run does not share that file.
- Coordination keys that must remain stable are the seed project UUID, exact chart/dashboard names, edge dashboard UUID, admin credentials/permissions, and seeded warehouse data. Duplicate chart/dashboard names should fail explicitly rather than select an arbitrary result.

## Exact port plan

1. Create only `packages/e2e/playwright/app/minimal.spec.ts`; do not change Playwright config, auth setup, application code, or shared helpers.
2. Import `SCREENSHOT_READY_INDICATOR_ID` and `SEED_PROJECT` from `@lightdash/common`, and `expect`/`test` from `@playwright/test`.
3. Add file-local, boundary-validating API lookup logic for chart and dashboard list responses. For every lookup, call the existing v1 list URL, assert `response.ok()`, require a `results` array, filter by exact name, assert exactly one match, and return its UUID. Keep this local because no second target currently needs it.
4. Define a local ready-indicator locator from `SCREENSHOT_READY_INDICATOR_ID`. After each minimal navigation, wait up to 30 seconds for it to be attached before rendered-content assertions. Do not wait for visibility.
5. Port the three standalone chart tests one-for-one. Scope chart/table/text assertions to `data-testid="visualization"`; preserve the big-number test ID and current formatted value assertions.
6. Port `I can view a minimal dashboard`; abort `https://www.loom.com/**` in that test to match Cypress `blockHosts`, discover `Jaffle dashboard` by exact name, wait for readiness, and scope markdown/chart/table assertions to the dashboard screenshot target. Do not activate the commented dashboard-title assertion.
7. Port the edge-case test with the hardcoded UUID. Assert one attached indicator, `data-tiles-total="4"`, a present numeric `data-tiles-errored` greater than zero, and `data-status="completed-with-errors"`.
8. Keep all five tests independent and active. Use existing admin storage state; add no `beforeEach` login and no cleanup.

## Verification plan

Run from repository root, with the existing seeded dev stack available:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/minimal.spec.ts
pnpm -F e2e formatter ./playwright/app/minimal.spec.ts --check
pnpm -F e2e playwright:run -- playwright/app/minimal.spec.ts --project=firefox
```

Parity-check the assigned Cypress source separately:

```bash
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/minimal.cy.ts
```

For controlled dual-run validation, launch those two final commands in separate processes against the same preview and confirm both pass without a reseed or any content-mutating suite running concurrently. No install, migration, or seed command is part of this verification plan.

## Open questions

- Are `2,397` and `1,961.5` intended product contracts or only current demo-data smoke values? The port should preserve them for parity, but ownership should clarify whether future warehouse fixture changes should update these assertions.
- Do the v1 chart/dashboard list endpoints guarantee that all seeded results are present on the first response page? The Cypress test assumes they do (`packages/e2e/cypress/e2e/app/minimal.cy.ts:10-17`, `70-75`). If not, the port needs an explicit server-supported name lookup or pagination rather than a first-page scan.
- Should Loom blocking eventually become shared Playwright configuration for all migrated specs? It is required only by this target based on current evidence, so the initial port should keep the route abort local.

## Port history

Not started.

### 2026-07-17

- Target: `packages/e2e/playwright/app/minimal.spec.ts`.
- Ported all five active tests: standalone chart, table, and big-number rendering; the seeded minimal dashboard; and edge-case screenshot readiness. Added file-local validated UUID lookup, hidden readiness-indicator synchronization, dashboard-scoped Loom blocking, and strict scoped locators. No tests were skipped, and Cypress remains unchanged.
- Verification passed:
  - `pnpm -F common build:fast` (made the frozen-install worktree's common build output available).
  - `pnpm -F e2e typecheck:playwright`.
  - `pnpm -F e2e linter ./playwright/app/minimal.spec.ts`.
  - `pnpm -F e2e formatter ./playwright/app/minimal.spec.ts --check`.
  - Playwright discovery: 6 tests in 2 files (setup plus 5 target tests).
  - Focused Firefox: 6/6 passed.
  - Focused Firefox `--repeat-each=3`: 16/16 passed (setup plus 15 target executions).
  - Focused Cypress parity: 5/5 passed.
  - Concurrent Playwright/Cypress dual-run: Playwright 6/6 and Cypress 5/5 passed.
- The findings' package-script Cypress command (`pnpm -F e2e cypress:run -- --spec ...`) did not forward the spec filter with this CLI combination and began the full 29-spec Cypress suite; it was stopped on timeout. The equivalent direct focused invocation, `pnpm -F e2e exec cypress run --spec cypress/e2e/app/minimal.cy.ts`, selected exactly one spec and passed.
- Full Playwright destination suite: the target's 5 tests and 5 other tests passed; pre-existing `playwright/app/globalSearch.spec.ts` failed at its `Spaces` assertion after the app rendered `Unexpected error`. A focused rerun reproduced that unrelated failure. No shared helper/config change was made.
- Remaining risks: demo warehouse values `2,397` and `1,961.5` remain fixture-sensitive; v1 list lookup retains the Cypress first-page assumption. Commit: `PENDING`.
