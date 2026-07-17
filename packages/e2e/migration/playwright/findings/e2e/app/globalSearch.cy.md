# packages/e2e/cypress/e2e/app/globalSearch.cy.ts

## Classification

- Recommended runner: Playwright
- Execution lane: `playwright-read-only`
- Active tests: 1
- Skipped tests: 0
- Persistent mutation: No intended content mutation; incidental login/session state, search/click analytics, dashboard/chart view rows, and query-history/result-cache writes are possible.
- Shared-preview dual-run safe: Yes, provided other tests do not rename/delete the shared seed content.
- Difficulty total: 6/18 (`persistent/shared state` 1 + `browser interaction complexity` 1 + `environment/external dependencies` 1 + `synchronization/flakiness` 2 + `authentication/authorization` 1 + `cross-file infrastructure` 0)
- Coordination keys: None
- Analysis status: analyzed

This is a genuine browser test: it opens the rendered omnibar, exercises its dialog/menu accessible structure, and verifies five client-side navigation mappings (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:29-98`). An API test would cover backend search but would not preserve the UI behavior under test.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should search all result types` | Active (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:8-99`) | As the seed admin, opens global search repeatedly and selects a seeded space, dashboard, saved chart, table, and metric; verifies each resulting route and selected page content (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:29-98`). | No create/update/delete. Reading the dashboard and chart records view events, and rendering the saved chart can create query-history/cache state (`packages/backend/src/services/DashboardService/DashboardService.ts:612-629`; `packages/backend/src/services/SavedChartsService/SavedChartService.ts:1290-1310`; `packages/backend/src/models/QueryHistoryModel/QueryHistoryModel.ts:146-177`). | 300 ms debounced search, a per-test first-seen-query set, one reused intercept alias, Mantine modal/accordion menu items, scrolling, sequential SPA navigation, saved-chart table rendering, and a forced reload for table-to-table navigation (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:9-28,70-71`; `packages/frontend/src/features/omnibar/components/Omnibar.tsx:63-76,152-160`). | `packages/e2e/playwright/app/globalSearch.spec.ts`; this target already exists and mirrors the source at lines 4-76. |

There are no `it.skip`, `describe.skip`, or inherited skipped tests in the assigned source (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:3-100`), so there are no skip comments requiring API/unit/removal triage.

## Cypress command expansion

- `cy.login()` is the only project-defined Cypress command used. The `beforeEach` invokes it before the sole test (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:3-6`). Its implementation wraps authentication in `cy.session`, keyed by the seed admin email, POSTs `api/v1/login` with the seed admin credentials, requires HTTP 200, and validates reused sessions with GET `api/v1/user` requiring HTTP 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The credentials are `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-481`).
- Testing Library commands (`findByRole`, `findAllByRole`, `findByPlaceholderText`, and `findAllByText`) come from `@testing-library/cypress/add-commands`, imported by the support file (`packages/e2e/cypress/support/commands.ts:20-43`). They are locator commands rather than additional project-defined behavior.
- The file-local `search(query)` helper is not a Cypress custom command. It opens the `role="search"` target, registers `cy.intercept('**/search/**').as('search')` only for a query not yet in the local `Set`, replaces the dialog input value, and waits on `@search` only for that query's first use (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:9-28`). The set is recreated inside the test, so it is not cross-test state.
- The Playwright equivalent should use the existing admin storage-state setup rather than reimplement login. That setup POSTs `/api/v1/login`, validates `/api/v1/user`, and saves request storage state (`packages/e2e/playwright/auth.setup.ts:10-24`); the Firefox project consumes it (`packages/e2e/playwright.config.ts:28-41`).

## State, seed, and environment assumptions

- The test hard-codes the shared seed project through `SEED_PROJECT`: UUID `3675b69e-8324-4110-bdca-059031aa8da3`, name `Jaffle shop` (`packages/common/src/index.ts:550-558`). It creates nothing and has no cleanup, so it assumes provisioning/seeding happened independently of this spec.
- The same seed creates a root space named `Jaffle shop`, grants the seed admin direct space-admin access, compiles explores, and saves them to the project cache (`packages/common/src/index.ts:559-561`; `packages/backend/src/database/seeds/development/01_initial_user.ts:238-255,258-283`). Search also requires project-view permission, filters content through accessible spaces, and returns tables/fields only when the user can manage Explore (`packages/backend/src/services/SearchService/SearchService.ts:150-220,285-308`). The admin role is therefore material to the table/field assertions.
- The selected saved chart is seeded exactly as `Which customers have not recently ordered an item?`, using the `payments` explore and a table visualization whose columns include `customers_customer_id` (`packages/backend/src/database/seeds/development/02_saved_queries.ts:295-340`). The selected dashboard is seeded as `Jaffle dashboard` in the same space (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:200-215,243-249`).
- The table result depends on the compiled `customers` explore metadata, including its `# Customers` description (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:27-40`). The field result depends on the `orders.order_date` metric `date_of_first_order` of type `min` (`examples/full-jaffle-shop-demo/lightdash/models/orders.yml:96-104`). These labels are generated metadata, not fixtures local to the test.
- The development seed itself requires `DBT_DEMO_DIR` and PostgreSQL `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`, and configures the seed project's warehouse as Postgres (`packages/backend/src/database/seeds/development/01_initial_user.ts:170-180,202-236`). The test does not read those variables directly, but the preview must already have a compiled project and reachable warehouse; the saved-chart render assertion at source line 71 depends on query execution.
- Search calls GET `/api/v1/projects/:projectUuid/search/:query?source=omnibar`; the client URL-encodes the query (`packages/frontend/src/features/omnibar/api/search.ts:17-29`) and the authenticated backend route delegates to permission-filtered search (`packages/backend/src/routers/projectRouter.ts:67-92`). The source issues first-use searches for `jaffle`, `Which`, `Customers`, and `Date of first order`; `jaffle` is entered twice and may be served immediately from TanStack Query cache while a refetch occurs (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:33,45,58,74,88`; `packages/frontend/src/features/omnibar/hooks/useSearch.ts:39-53`). It assumes successful responses containing the named items but never asserts response status or response body.
- Broad and name-based lookup is collision-prone. Another suite can create a second matching space/dashboard/chart in the shared project. The dashboard path explicitly accepts ambiguity by selecting `.first()` (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:46-50`); the other singular `findByRole` calls will fail on duplicate accessible names (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:34-37,59-64,75-80,89-94`). No database mutation here itself creates duplicate names.
- Cypress runs at 1920x1080, defaults to `http://localhost:3000`, retries twice in run mode, and blocks analytics/chat/Loom hosts (`packages/e2e/cypress.config.ts:13-32`). Playwright preserves the viewport, defaults to the same base URL (overridable with `PLAYWRIGHT_BASE_URL`), runs Firefox with one worker, and does not declare equivalent blocked hosts (`packages/e2e/playwright.config.ts:6-41`). There is no timezone, locale, clipboard, download, upload, iframe, or browser-permission assumption in this source.

## Synchronization and timeout requirements

- Search is explicitly debounced by 300 ms in the UI (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:61-76`). Cypress arms the intercept before typing and waits once per distinct query (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:9-28`). Do not replace this with a fixed sleep in Playwright.
- The repeated `jaffle` search intentionally does not wait on a new alias because the local set already contains it (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:13-27,33,45`). A Playwright helper that unconditionally waits for a network response can hang when cached results satisfy the UI without a request. Prefer waiting for the scoped result menu item; if response assertions are added, track first-seen queries and arm the response promise before `fill`.
- Cypress locators and assertions use the configured 10-second command timeout, with no local override (`packages/e2e/cypress.config.ts:15-21`). The Playwright config provides 10-second expect/action timeouts and 30-second navigation timeout (`packages/e2e/playwright.config.ts:11-26`). The port should rely on web-first `expect`/locator waiting and retain those defaults.
- The saved-chart step uses exactly one `Customer id` occurrence as its query/table readiness signal (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:65-71`). This is the slowest warehouse-dependent assertion and should remain an awaited count assertion, not a generic `networkidle` wait.
- Every result is scrolled before Cypress clicks it (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:34-37,46-50,59-64,75-80,89-94`). Playwright locator clicks auto-scroll actionable elements, so explicit `scrollIntoViewIfNeeded` is unnecessary unless Firefox demonstrates an accordion/modal clipping issue.
- The last click occurs while already on `/tables/customers`. Omnibar detects table-to-table navigation and calls `navigate(0)`, forcing a full reload after changing the route (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:152-160`). The final URL assertion must tolerate this reload and should not resolve from stale pre-navigation state.

## Locator and strictness risks

- `findByRole('search')` targets a clickable component explicitly assigned `role="search"`, not a native search input (`packages/frontend/src/features/omnibar/components/OmnibarTarget.tsx:18-24`). It is stable while unique, but any second search landmark on these pages would make Playwright strict mode fail. Keep it page-scoped and require uniqueness rather than adding `.first()` silently.
- Scope every result locator to the visible `role="dialog"`, as the source does (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:34-37,46-50,59-64,75-80,89-94`). Mantine transitions the target for 400 ms and renders a modal (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:201-230`), so the port should assert the dialog is visible before filling.
- The placeholder is project-name-derived and includes an ellipsis in the modal (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:256-267`). `/Search Jaffle shop/i` is intentionally less brittle than an exact placeholder, but still couples the test to the seed project name.
- Menu-item accessible names concatenate prefix/title and secondary type/description because the entire group has `role="menuitem"` (`packages/frontend/src/features/omnibar/components/OmnibarItem.tsx:41-49,62-90`). Consequently `^Customers Table · # Customers` and `Orders - Date of first order Metric · Min of Order date` are fragile to copy, metadata, punctuation, or DOM changes (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:75-78,89-92`). Preserve exactness where the source is singular; do not hide collisions with blanket `.first()`.
- The space item is exact-name singular, while the dashboard deliberately uses the first fuzzy match (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:34-37,46-50`). The existing Playwright target preserves those semantics (`packages/e2e/playwright/app/globalSearch.spec.ts:16-31`).
- `cy.contains('Spaces')`, `cy.contains('Jaffle dashboard')`, and `cy.contains('Customer id')` are broad and can match hidden or repeated descendants (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:42,55,85`). In Playwright, use exact visible text and only `.first()` where multiple legitimate rendered copies are established; the existing target does so at lines 23-25, 35-37, and 59-61.
- Route assertions use substring matching in Cypress (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:38-41,51-54,65-68,81-84,95-98`). The field URL carries serialized `create_saved_chart_version` state generated by the result mapping (`packages/frontend/src/features/omnibar/utils/getSearchItemMap.ts:99-143`); a Playwright URL predicate that checks pathname plus parameter presence is safer than matching serialization details, as the existing target does (`packages/e2e/playwright/app/globalSearch.spec.ts:70-75`).

## Nonstandard or surprising behavior

- Despite the title, this does not test “all result types.” It covers space, dashboard, chart, table, and field only (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:32-98`), while the omnibar also exposes dashboard tab, SQL chart, data app, page, and settings types (`packages/frontend/src/features/omnibar/types/searchItem.ts:7-17`). The migration should preserve current scope rather than silently expanding it.
- Plain clicks stay in the current tab because `OmnibarItemGroups` passes `e.metaKey` as the `redirect` argument (`packages/frontend/src/features/omnibar/components/OmnibarItemGroups.tsx:79-87`). Only a Meta-click calls `window.open(..., '_blank')`; ordinary clicks close the modal and use React Router (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:126-152`). There is no popup handling requirement for this source.
- Search panels are Mantine accordions with all search types initially open (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:64-66`; `packages/frontend/src/features/omnibar/components/OmnibarItemGroups.tsx:52-74`). The explicit Cypress scrolling is modal overflow handling, not virtualization.
- Backend search emits `project.search` analytics for every completed search (`packages/backend/src/services/SearchService/SearchService.ts:357-370`), while the frontend tracks modal open/close and result clicks (`packages/frontend/src/features/omnibar/components/Omnibar.tsx:83-95,126-150`). These side effects are not asserted.
- The saved chart page is used as an implicit end-to-end warehouse check through `Customer id`, whereas the other destinations mostly assert route/header rendering (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:65-85`).
- No canvas/SVG targeting, Monaco, drag-and-drop, download/upload, file chooser, clipboard, popup, iframe, browser API, or custom timeout appears in the source.

## Coordination requirements

- No shared helper or coordinator prerequisite is justified. The search helper is local to one target file and only wraps three operations; keep it local (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:12-28`). Existing admin storage-state infrastructure already supplies the needed role (`packages/e2e/playwright/auth.setup.ts:10-24`).
- Coordination keys: none. The read-only lane may share a preview with Cypress/Playwright readers. Incidental analytics/view/query rows are append-only or cache-like and do not alter the searched names or routes (`packages/backend/src/services/DashboardService/DashboardService.ts:612-629`; `packages/backend/src/services/SavedChartsService/SavedChartService.ts:1290-1310`).
- Collision keys to be aware of, but not coordination gates: seed project UUID `3675b69e-8324-4110-bdca-059031aa8da3`, admin `demo@lightdash.com`, and names `Jaffle shop`, `Jaffle dashboard`, and `Which customers have not recently ordered an item?` (`packages/common/src/index.ts:474-481,550-560`; `packages/backend/src/database/seeds/development/02_saved_queries.ts:295-306`; `packages/backend/src/database/seeds/development/03_saved_dashboards.ts:200-205`). A concurrent mutator that renames/deletes these fixtures will break both runners; a creator of duplicates can make selection ambiguous.
- The test has no dependency on prior suites, no cleanup, and no cross-test ordering. Its only ordering requirement is internal: each selected result navigates to the page from which the next omnibar search is opened (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:29-98`).

## Exact port plan

1. Use the already-present target `packages/e2e/playwright/app/globalSearch.spec.ts`. Keep one admin test and the existing imports of `SEED_PROJECT`, `expect`, and `test` (`packages/e2e/playwright/app/globalSearch.spec.ts:1-4`); do not add a new shared fixture.
2. Keep a target-local async `search(query)` helper that clicks the unique page-level search target, asserts the dialog is visible, and fills the project-derived placeholder (`packages/e2e/playwright/app/globalSearch.spec.ts:5-11`). Synchronize on the requested menu item rather than sleeping or unconditionally waiting for a response, because the second `jaffle` query can use cached data.
3. Preserve the source's exact sequence and semantics: exact seeded space; first matching seeded dashboard; strict saved-chart item followed by exactly one `Customer id`; strict Customers table item; strict date metric item (`packages/e2e/playwright/app/globalSearch.spec.ts:16-69`). Playwright click actionability replaces Cypress's explicit `scrollIntoView`.
4. Preserve route assertions after every click. Use regex for generated UUID suffix routes and the existing URL predicate for the final orders route plus `create_saved_chart_version`, avoiding serialized query-value coupling (`packages/e2e/playwright/app/globalSearch.spec.ts:20-25,32-37,45-48,56-61,70-75`). Ensure the final predicate survives the table-to-table forced reload.
5. Continue using `playwright/auth.setup.ts` and the Firefox project's storage state; do not call the login UI or duplicate API authentication in this target (`packages/e2e/playwright.config.ts:28-41`; `packages/e2e/playwright/auth.setup.ts:10-24`).
6. Do not add coverage for dashboard tabs, SQL charts, data apps, pages, or settings as part of this one-file parity port. If desired, handle that as a separate behavior change after clarifying the misleading source title.

## Verification plan

Run from the repository root, with the existing dev preview and seeded database already available; do not run installs, migrations, or seeds for this port.

1. `pnpm -F e2e typecheck:playwright`
2. `pnpm -F e2e exec playwright test playwright/app/globalSearch.spec.ts --project=firefox`
3. `pnpm -F e2e lint`
4. `pnpm -F e2e format`
5. `pnpm -F e2e playwright:run`

The scripts are defined in `packages/e2e/package.json:7-20`; focused Playwright execution inherits setup/auth through the project dependency in `packages/e2e/playwright.config.ts:28-41`.

## Open questions

- Should the test title be narrowed to “core result types,” or should missing dashboard-tab/SQL-chart/data-app/page/settings coverage be added in a separate task? The current source covers only five of ten declared types (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:32-98`; `packages/frontend/src/features/omnibar/types/searchItem.ts:7-17`). This does not block a parity port.
- Is the dashboard's intentional `.first()` selection still acceptable, or should seed lookup become uniquely scoped? Both source and existing target deliberately accept the first fuzzy `Jaffle dashboard` result (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:46-50`; `packages/e2e/playwright/app/globalSearch.spec.ts:27-31`). This does not require migration-wide coordination.
- The source asserts only the final field-generated URL, not successful rendering after the forced reload (`packages/e2e/cypress/e2e/app/globalSearch.cy.ts:88-98`; `packages/frontend/src/features/omnibar/components/Omnibar.tsx:152-160`). Strengthening that assertion would be a coverage change rather than strict parity.

## Port history

- 2026-07-18: Diagnosed the space-navigation failure as a stale shared-app runtime, not a migration, seed, search ambiguity, route identity, or product-source defect. Search returned one exact `Jaffle shop` space (`9d128fee-4c90-4df0-8d6c-bb2036826fed`), and the database contained one active matching space. Firefox emitted no `pageerror`; the space list returned 200, but GET `/api/v1/projects/3675b69e-8324-4110-bdca-059031aa8da3/spaces/9d128fee-4c90-4df0-8d6c-bb2036826fed` returned 500 and surfaced its `UnexpectedServerError` in the console. The backend stack failed at `SpacePermissionService.ts:243` because `getOrganizationRoleForSpaceAccess` was present in Common source but `undefined` in the running Common CJS build.
- The orchestrator repaired the shared `playwright-migration` app without resetting or reseeding by running `pnpm -F common build:fast` and restarting `pnpm -F backend dev`. No test change was required, preserving all five result types and Cypress dual-run behavior.
- Verification after the repair: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm -F e2e exec playwright test playwright/app/globalSearch.spec.ts --project=firefox --repeat-each=3 --reporter=list` passed all three repetitions (4/4 including setup), and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm -F e2e playwright:run` passed the complete Playwright suite (6/6).
