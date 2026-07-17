# packages/e2e/cypress/e2e/app/pivotTables.cy.ts

## Classification

Recommended runner: Playwright for the two active browser workflows; remove the skipped save workflow unless product coverage is explicitly requested, and move the skipped 100% label case to a frontend unit test.
Execution lane: Shared-preview, read-only business-state lane for active tests.
Active tests: 2
Skipped tests: 2 (one direct `it.skip`; one inherited from `describe.skip`)
Persistent mutation: Active tests create authenticated sessions and query-history/cache records but no charts or dashboards. The skipped save workflow would create a fixed-name chart and dashboard with no cleanup.
Shared-preview dual-run safe: Yes for the two active tests, subject to warehouse/query-capacity contention. No if the skipped save workflow is enabled unchanged.
Difficulty total: 10/18 (persistent/shared state 2, browser interaction complexity 2, environment/external dependencies 2, synchronization/flakiness 3, authentication/authorization 1, cross-file infrastructure 0).
Coordination keys: `seed-project:3675b69e-8324-4110-bdca-059031aa8da3`, `seed-explore:orders`, `auth:org1-admin`, shared query/warehouse capacity; if the save test is revived, also `content-name:My Pivot Table Chart` and `content-name:My Pivot Table Dashboard`.
Analysis status: analyzed

The active cases genuinely need a browser: they validate rendered pivot-table output and a drag-and-drop configuration workflow (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:7-50`). They should not move to API tests. The skipped percentage-label case is explicitly marked for a unit test and only inspects generated SVG text (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:91-109`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
| --- | --- | --- | --- | --- | --- |
| `Can view shared pivot table from URL in explore` | Active | Opens an authenticated explore URL containing a serialized chart with `orders_status` as a pivot, runs the query, and checks fixed pivot values/date/currency (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:7-22`). | Login/session; async query history and refreshed query cache. No content save. | Very long percent-encoded JSON URL; backend SQL pivot; fixed seed-value assertions. | Playwright, `packages/e2e/playwright/app/pivotTables.spec.ts`; an equivalent test already exists at lines 111-118. |
| `Can create a pivot table chart on explore` | Active | Opens the unpivoted chart, runs once, opens Configure, drags `orders_is_completed` from rows to Columns, reruns, and waits for the pivot header (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:24-50`). | Login/session; two async query histories/cache refreshes. The UI configuration is local unsaved state. | `@hello-pangea/dnd` internal attributes, synthetic mouse drag, DOM alias, SQL rerun, explicit 30-second assertion timeout. | Playwright, `packages/e2e/playwright/app/pivotTables.spec.ts`; an equivalent test already exists at lines 120-150. |
| `I can save a pivot table chart and add it to a dashboard` | Directly skipped by `it.skip` | Would save `My Pivot Table Chart`, create `My Pivot Table Dashboard`, add the chart, open the dashboard, and assert rendered pivot values (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:53-87`). | Persistent fixed-name chart, chart version, dashboard, and dashboard tile; no cleanup. | Save wizard, overflow menu, forced submit, navigation, eventual dashboard render. | Remove, following the source's `todo: remove` at line 53. If coverage is required, keep it in Playwright with per-run unique names and API cleanup; do not enable this source unchanged. |
| `Can create a 100% stacked bar chart with correct percentage labels` | Skipped through parent `describe.skip` at line 92 | Would load a serialized 100%-stacked Cartesian chart and assert four percentage labels in SVG (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:92-109`). | Login/session and query history/cache only if enabled. | Huge encoded ECharts config, page-spinner wait, SVG text lookup, exact percentages coupled to warehouse rows. | Move the label-generation assertion to `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.test.ts`; that file already has 100%-stack unit coverage at lines 2490-2509. Do not port this skipped E2E case to Playwright. |

The skipped suite's `beforeEach` and test body do not execute because skip is inherited from `describe.skip` (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:92-96`).

## Cypress command expansion

### `cy.login()`

Both suites declare `beforeEach(() => cy.login())` (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:3-6,92-95`). The command:

1. Uses `cy.session` keyed by the seed admin email (`packages/e2e/cypress/support/commands.ts:152-155`).
2. Establishes the session with `POST api/v1/login`, using `demo@lightdash.com` / `demo_password!`, and requires status 200 (`packages/e2e/cypress/support/commands.ts:156-165`; credentials at `packages/common/src/index.ts:474-481`).
3. Reuses a cached session only after `GET api/v1/user` returns 200 (`packages/e2e/cypress/support/commands.ts:167-171`).

The effective role is organization admin, not anonymous/shared-link access (`packages/common/src/index.ts:481`). Playwright should use the existing admin storage-state setup, which performs the same login and validation requests (`packages/e2e/playwright/auth.setup.ts:10-23`) and is attached to the Firefox project (`packages/e2e/playwright.config.ts:33-40`).

### `cy.dragAndDrop(dragSelector, dropSelector)`

Only the second active test invokes this command (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:37-41`). The implementation:

1. Retries until both selectors exist, then reads the first matching elements directly through `Cypress.$` (`packages/e2e/cypress/support/commands.ts:532-545`).
2. Computes center-point bounding rectangles and dispatches `mousedown`, a 5-pixel threshold `mousemove`, a final `mousemove`, and `mouseup` (`packages/e2e/cypress/support/commands.ts:552-629`).
3. Uses three 50 ms timers plus a 200 ms React-settle timer (`packages/e2e/cypress/support/commands.ts:585-635`).
4. Verifies that the same draggable ID appears under the drop target (`packages/e2e/cypress/support/commands.ts:642-652`).

The application maps a drop into `COLUMNS` to `setPivotDimensions(...)` (`packages/frontend/src/components/VisualizationConfigs/TableConfigPanel/GeneralSettings.tsx:87-108`) and renders the tested placeholder/drop zone at lines 175-190. Playwright must perform a real pointer/mouse sequence and assert the moved draggable is inside `COLUMNS` before rerunning; the existing port does this at `packages/e2e/playwright/app/pivotTables.spec.ts:86-109,132-141`. This one-spec mechanic does not justify shared cross-file drag infrastructure.

### Testing Library commands

`cy.findByText` and `cy.findByTestId` appear only in skipped tests (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:65-66,102`). They are registered by the support import at `packages/e2e/cypress/support/commands.ts:46`. The dependency registers every `find*` DOM query as a retryable Cypress query (`node_modules/.pnpm/@testing-library+cypress@10.1.3_cypress@15.18.1/node_modules/@testing-library/cypress/dist/add-commands.js:3-9`), delegates to the matching Testing Library `get*` query, and fails non-`All` queries on multiple matches (`node_modules/.pnpm/@testing-library+cypress@10.1.3_cypress@15.18.1/node_modules/@testing-library/cypress/dist/index.js:16-31,53-80`). Their direct Playwright equivalents are `getByText` and `getByTestId`.

## State, seed, and environment assumptions

- All tests target the deterministic `Jaffle shop` seed project UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-558`) and its `orders` explore (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:9-10,26-27,99-100`).
- The authenticated user must remain an active organization admin with access to that project (`packages/common/src/index.ts:474-481`). No editor/viewer or permission-denial behavior is covered.
- URL state is external JSON parsed from `create_saved_chart_version`; missing/empty `exploreName` is normalized to `tableName` (`packages/frontend/src/hooks/useExplorerRoute.ts:162-187`). The active URLs intentionally use an empty `exploreName`.
- Queries depend on compiled `orders` fields: `is_completed` is derived from completed status (`examples/full-jaffle-shop-demo/dbt/models/orders.sql:41-44`), `order_date` is UTC with week support (`examples/full-jaffle-shop-demo/lightdash/models/orders.yml:96-99`), and `total_order_amount` is a USD-formatted sum rounded to two decimals (`examples/full-jaffle-shop-demo/lightdash/models/orders.yml:115-128`).
- The assertions assume warehouse rows continue producing `placed`, `shipped`, `False`, week `2025-06-09`, and `$1.00` (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:17-22`). This is data-contract coverage, not merely component rendering.
- Running a raw explore query posts to `/api/v2/projects/{projectUuid}/query/metric-query` (`packages/frontend/src/hooks/useQueryResults.ts:81-92,164-197`), then polls `/api/v2/projects/{projectUuid}/query/{queryUuid}` (`packages/frontend/src/features/queryRunner/executeQuery.ts:15-38`). Result pages use the same endpoint with pagination (`packages/frontend/src/hooks/useQueryResults.ts:276-297`). The query response must provide a query UUID and eventually reach `READY`; error/expired/unexpected states fail (`packages/frontend/src/hooks/useQueryResults.ts:202-222`).
- Explore edit-mode executions invalidate cache by design (`packages/frontend/src/hooks/explorer/buildQueryArgs.ts:64-81`). Concurrent runs therefore do not overwrite named content, but can contend for backend/warehouse capacity and create independent query-history records.
- Cypress assumes `http://localhost:3000`, 1920x1080, 10-second default commands, and configurable `CYPRESS_RETRIES` (`packages/e2e/cypress.config.ts:12-26`). Playwright uses `PLAYWRIGHT_BASE_URL` or the same localhost URL, 1920x1080 Firefox, 10-second actions/assertions, 30-second navigation, one worker, and `PLAYWRIGHT_RETRIES` in CI (`packages/e2e/playwright.config.ts:4-13,20-40`).
- No explicit upload/download, popup, iframe, clipboard, Monaco, timezone environment variable, or third-party service is used. The app, backend, seeded database/compiled project, and query-capable warehouse are required.
- There is no dependency on a prior test in this file or another suite. Each runnable test has its own login hook. The only alias, `@chartArea`, is local to the second test (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:46-50`).

## Synchronization and timeout requirements

- The first active test clicks Run query and relies entirely on Cypress's retrying `contains` calls for completion (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:13-22`). In Playwright, every value assertion must be awaited and scoped to the visualization; the existing port does so at `packages/e2e/playwright/app/pivotTables.spec.ts:67-84`.
- The second active test waits for `Tables` before opening Configure, explicitly documenting sidebar-load ordering (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:33-35`). Preserve this readiness check.
- Drag completion must be proven before the second Run query. The Cypress command checks the dropped descendant after timed synthetic events (`packages/e2e/cypress/support/commands.ts:631-652`); preserve the post-drop DOM assertion rather than sleeping alone.
- Pivoting runs in SQL, so changing Columns is insufficient: the second query is required (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:43-50`). Query polling itself backs off 250 ms, 500 ms, then 1 second (`packages/frontend/src/features/queryRunner/executeQuery.ts:15-35`).
- `findByText('Loading chart').should('not.exist')` can pass before a loading node appears; it is not a sufficient completion barrier (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:46-50`). The meaningful barrier is the final pivot-header/result assertion with 30 seconds.
- Keep at least a 60-second test budget for the drag case and the 30-second final result assertion, matching the existing port (`packages/e2e/playwright/app/pivotTables.spec.ts:120-121,143-149`). Do not replace query completion with arbitrary long sleeps; the two 50 ms waits in the existing physical drag are only drag-library gesture spacing (`packages/e2e/playwright/app/pivotTables.spec.ts:95-108`).

## Locator and strictness risks

- `cy.get('button').contains('Run query')` is broad (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:14,31,44`). Playwright strict mode can find more than one responsive-layout button. Use the button role/name and intentionally select the visible/first explorer control; the existing port uses `/^Run query/` plus `.first()` (`packages/e2e/playwright/app/pivotTables.spec.ts:60-65`).
- Unscoped `cy.contains('placed')`, `shipped`, `False`, dates, and currency can match sidebars or hidden content (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:17-22`). Scope them to `[data-testid="visualization"]`, use exact text where possible, and assert visibility.
- `Tables` and `Configure` are unscoped text locators (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:33-35`). Use exact text and preserve the load-before-click sequence. If strict mode finds duplicates, scope to the explorer sidebar/config tabs rather than using an arbitrary global `.first()`.
- The drag selectors couple to `data-rfd-*` implementation attributes and a tabpanel structure (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:37-39`). They are currently the only deterministic drag handles, but are sensitive to DnD-library changes. The dropped-child assertion reduces false positives.
- The table can render repeated pivot text, so exact queries may still need scoping or `.first()`. The existing first Playwright test scopes to the visualization and deliberately selects the first exact match (`packages/e2e/playwright/app/pivotTables.spec.ts:67-83`).
- The existing second Playwright assertion uses a full accessible row name, `Orders Is completed False True` (`packages/e2e/playwright/app/pivotTables.spec.ts:143-149`). This is stronger than the Cypress substring, but may change with table accessibility or column-label changes; if it proves brittle, assert the exact `Is completed` header within the visualization rather than reverting to global text.
- Skipped-only risks: `button:has(.tabler-icon-dots)` and forced submit can select the wrong control or conceal actionability bugs (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:71-77`); global `svg` percentage searches can match multiple charts (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:106-109`).

## Nonstandard or surprising behavior

- “Shared pivot table from URL” is not an anonymous share test: the admin login hook always runs (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:3-10`). It tests reconstruction from URL-serialized chart state.
- The source embeds three large opaque encoded JSON blobs. The existing Playwright target improves maintainability by constructing chart objects and calling `encodeURIComponent(JSON.stringify(chart))` (`packages/e2e/playwright/app/pivotTables.spec.ts:4-58`). Preserve that shape.
- The first active test starts pivoted by URL (`pivotConfig.columns = ['orders_status']` in the source URL at line 10); the second starts without `pivotConfig` and adds `orders_is_completed` through DnD (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:27,37-44`). These are distinct behaviors.
- The custom drag is not HTML5 `DataTransfer`; it is a timed low-level mouse sequence for React DnD (`packages/e2e/cypress/support/commands.ts:572-635`). Playwright's built-in `dragTo` may not reproduce the threshold/movement events reliably.
- The skipped save case has an explicit removal TODO and fixed names (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:53,62-76`). It is unsafe to unskip as-is and should not silently become migration scope.
- The inherited skipped suite has an explicit unit-test TODO (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:91-92`). It tests ECharts SVG output rather than an end-user configuration interaction.
- No canvas inspection is used. The skipped Cartesian case uses SVG text. The active table may use complex table rendering, but the source interacts only through DOM text and DnD elements.

## Coordination requirements

- No new shared fixture/helper is required. Reuse the existing Playwright admin storage-state setup (`packages/e2e/playwright/auth.setup.ts:10-23`) and keep chart serialization/query helpers local to `packages/e2e/playwright/app/pivotTables.spec.ts`. Do not promote the one-use drag routine to cross-file infrastructure.
- The active tests can run alongside Cypress against the same preview because they do not create named content. Expect extra uncached query load; coordinate only if warehouse/query concurrency is constrained.
- The Playwright project itself is serial (`fullyParallel: false`, `workers: 1`) (`packages/e2e/playwright.config.ts:9-13`). Independent Playwright invocations also write the same `.auth/admin.json` through setup, so avoid launching multiple target runs in the same worktree simultaneously.
- Never enable the save test in a shared preview with its current fixed names. If retained by explicit decision, namespace names by run/worker, capture created UUIDs, and delete chart/dashboard records through API teardown even after failure.
- No ordering lock is needed between the two active tests. Query UUIDs are server-generated, and neither active test depends on the other's local chart state.

## Exact port plan

Target file: `packages/e2e/playwright/app/pivotTables.spec.ts` (already present with the two active cases).

1. Keep one typed/object chart fixture for the unpivoted table and derive the URL-pivoted variant with `pivotConfig.columns = ['orders_status']`; serialize via `encodeURIComponent(JSON.stringify(...))` instead of copying opaque URL strings (`packages/e2e/playwright/app/pivotTables.spec.ts:4-58`).
2. Keep a shared file-local `runQuery` helper because both active tests use it (`packages/e2e/playwright/app/pivotTables.spec.ts:60-65`). Keep result assertions scoped to `visualization`, exact, visible, and awaited (`packages/e2e/playwright/app/pivotTables.spec.ts:67-84`).
3. For the URL case, navigate with the pivot variant, click Run query, and assert all five source values. This is already represented at `packages/e2e/playwright/app/pivotTables.spec.ts:111-118`.
4. For the creation case, navigate with the unpivoted variant, run once, wait for the Tables sidebar, open Configure, verify the empty Columns prompt, perform the thresholded mouse drag, assert the draggable moved under `COLUMNS`, rerun, and await the pivot result for up to 30 seconds. This is already represented at `packages/e2e/playwright/app/pivotTables.spec.ts:120-150`.
5. Keep the drag code local to this target; do not create shared infrastructure for one caller. Retain an explicit failure when either bounding box is unavailable (`packages/e2e/playwright/app/pivotTables.spec.ts:86-93`).
6. Do not add the directly skipped save/dashboard test to Playwright. Remove it with the Cypress source after migration acceptance, unless ownership explicitly requests unique-name/cleanup coverage.
7. Do not add the inherited skipped SVG-label test to Playwright. Add focused label-generation coverage to `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.test.ts` if the exact behavior is not already covered, then remove the skipped Cypress block. Existing nearby 100%-stack coverage is at lines 2490-2509.
8. After parity and the skip decisions are accepted, delete only `packages/e2e/cypress/e2e/app/pivotTables.cy.ts` in the implementation change; no manifest update is indicated because specs are globbed (`packages/e2e/cypress.config.ts:23-25`, `packages/e2e/playwright.config.ts:7,36`).

## Verification plan

Run from repository root, with the documented already-running dev stack and seeded project available:

```bash
# Source baseline: runs two active tests and reports two skipped tests.
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/pivotTables.cy.ts

# Target behavior; setup dependency creates admin storage state.
pnpm -F e2e playwright:run -- playwright/app/pivotTables.spec.ts --project=firefox

# Playwright compile and package quality gates.
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
```

For dual-run confidence, run the Cypress and Playwright commands sequentially against the same preview and confirm the active assertions agree. Do not enable either skipped Cypress case during verification.

If the skipped unit-test recommendation is implemented separately, verify the exact frontend test plus frontend type/lint/format gates:

```bash
pnpm -F frontend test -- useEchartsCartesianConfig.test.ts
pnpm -F frontend typecheck:fast
pnpm -F frontend lint
```

## Open questions

1. Does product ownership agree with the explicit `todo: remove` for the save/dashboard flow (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:53`), or is that end-to-end workflow still required with collision-safe setup/cleanup?
2. Which exact frontend function owns the 100%-stack label text? The source says to move the case to a unit test (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:91-92`), and `useEchartsCartesianConfig.test.ts` has nearby 100%-stack coverage, but the skipped E2E test does not identify the intended unit seam.
3. Are `2025-06-09` and `$1.00` intentionally stable seed-contract values across all supported local/preview warehouses, or should the browser assertion validate pivot structure using less brittle rows? The source only states that they should remain constant (`packages/e2e/cypress/e2e/app/pivotTables.cy.ts:104-109` for the analogous percentage assumption and lines 17-22 for active values).
4. The Playwright target already exists. Should implementation work only verify and accept it, or is this discovery expected to revise that existing port before Cypress removal?

## Port history

Not started.
