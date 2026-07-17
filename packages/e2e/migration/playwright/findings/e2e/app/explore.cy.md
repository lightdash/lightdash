# packages/e2e/cypress/e2e/app/explore.cy.ts

## Classification

Recommended runner: Playwright for the 3 active browser journeys; frontend unit tests, plus one optional API test, for the 9 skipped cases
Execution lane: Seed-backed Firefox browser, serial; content-mutating save test must own cleanup
Active tests: 3
Skipped tests: 9, including 3 inherited from `describe.skip`
Persistent mutation: Yes — fixed-name saved chart `My chart`, its initial version, and an update version; no cleanup
Shared-preview dual-run safe: No — Cypress and Playwright would write fixed-name charts into the same seed project
Difficulty total: 12/18 (`persistent/shared state` 2, `browser interaction complexity` 3, `environment/external dependencies` 2, `synchronization/flakiness` 3, `authentication/authorization` 1, `cross-file infrastructure` 1)
Coordination keys: `SEED_PROJECT` `3675b69e-8324-4110-bdca-059031aa8da3`; saved-chart name `My chart`; `lightdash-explorer-auto-fetch-enabled`; virtualized Explore tree; `packages/e2e/playwright/app/explore.spec.ts`
Analysis status: coordination-required

The active cases require the rendered Explore UI: virtualized field selection, result-table menus, chart configuration, save/edit navigation, and Mantine portal menus (`packages/e2e/cypress/e2e/app/explore.cy.ts:9-156`). They therefore belong in Playwright rather than API tests. The skipped comments explicitly request unit-test migration (`packages/e2e/cypress/e2e/app/explore.cy.ts:159-160,238-239,266-267,343-344,440-441,467-468,491-492,528-529`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should query orders` | Active | Opens the seeded tables page, enters Orders, selects customer/name/count fields, applies ascending name sort, runs the query, and expects `Aaron` in the second table cell (`packages/e2e/cypress/e2e/app/explore.cy.ts:9-46`). | Executes metric queries and creates query-history/result-cache state; no saved content. | Virtualized tree; auto-fetch/default-sort ordering commentary; column menu; async query; 10-second cell timeout. | `packages/e2e/playwright/app/explore.spec.ts` |
| `Should save chart` | Active | Builds an Orders query, saves `My chart`, enters saved-chart edit mode, changes Bar to Horizontal bar, saves a new version, and checks both success toasts (`packages/e2e/cypress/e2e/app/explore.cy.ts:50-92`). | Persistently creates one chart plus initial version, then another chart version; no deletion. | Two-step modal, redirect/edit transition, chart rendering, fixed 500/300 ms waits. | `packages/e2e/playwright/app/explore.spec.ts`, with unique name and `finally` API cleanup. |
| `Should change chart config type` | Active | Selects fields, runs a query, then cycles Bar → Horizontal bar → Line → Area → Scatter → Pie → Table → Big value (`packages/e2e/cypress/e2e/app/explore.cy.ts:96-156`). | Query-history/result-cache state only; chart changes remain client-side. | Mantine portal menu, repeated fixed 500 ms waits, visualization rendering. | `packages/e2e/playwright/app/explore.spec.ts` |
| `Keeps chart config after updating table calculation` | Skipped by `it.skip` | Creates Ace-authored calculation `TC`, assigns it to both axes, renames it `TC2`, reruns, and expects both axis values to follow the rename (`packages/e2e/cypress/e2e/app/explore.cy.ts:160-235`). | Query-history/result-cache state only; unsaved calculation/config remains client-side. | Ace focus, escaped braces, slow typing, arrow-key select, four fixed waits. | Frontend unit test in `packages/frontend/src/hooks/cartesianChartConfig/useCartesianChartConfig.test.ts`; the rename mapping is implemented at `packages/frontend/src/hooks/cartesianChartConfig/useCartesianChartConfig.ts:912-999`. |
| `Should change chart config layout` | Skipped by `it.skip` | Enables top value labels and infers success by changing global SVG text-node count from `<30` to `>30` (`packages/e2e/cypress/e2e/app/explore.cy.ts:239-263`). | Query-history/result-cache state only; client config only. | ECharts/SVG internals and arbitrary global node-count thresholds. | Unit test in `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.test.ts`; do not port the DOM-count assertion. |
| `Sort > should sort multisort results` | Skipped through `describe.skip` at line 267 | Adds numeric and descending text sorts, opens the sort popover, adds another sort, and expects a `2 fields` badge (`packages/e2e/cypress/e2e/app/explore.cy.ts:267-340`). | Multiple query-history/result-cache records; no content mutation. | Inherited skip, auto reruns, Mantine classes, portal select. | Component/unit test in a new `packages/frontend/src/components/SortButton/Sorting.test.tsx`; retain one Playwright sort journey only if UI wiring is considered critical. |
| `Chart type > Table > Config > should hide table names from the header according to the config` | Skipped through outer `describe.skip` at line 344 | Switches to Table, verifies hidden table prefixes, toggles `Show table names`, and verifies the prefix appears (`packages/e2e/cypress/e2e/app/explore.cy.ts:344-389`). | Query-history/result-cache state only; client config only. | Inherited skip, force-clicked control, table rendering. | Component test in a new `packages/frontend/src/components/VisualizationConfigs/TableConfigPanel/GeneralSettings.test.tsx`. |
| `Chart type > Table > Config > should show header overrides according to the config` | Skipped through outer `describe.skip` at line 344 | Switches to Table, types a custom header, and expects the visualization header to update (`packages/e2e/cypress/e2e/app/explore.cy.ts:392-435`). | Query-history/result-cache state only; client config only. | Inherited skip, positional `th.eq(1)`, blur-driven update. | Same `GeneralSettings.test.tsx` component target as the preceding case. |
| `Should open SQL Runner with current query` | Skipped by `it.skip` | Compiles Explore SQL, reads the first Monaco model, navigates to SQL Runner, reads its first model, and compares normalized SQL (`packages/e2e/cypress/e2e/app/explore.cy.ts:441-464`). | No content write; compile request only. | Monaco global API, first-model assumption, route-state transfer. | Unit/component test in a new `packages/frontend/src/components/Explorer/SqlCard/OpenInSqlRunnerButton.test.tsx`; the button passes SQL through router state at `packages/frontend/src/components/Explorer/SqlCard/OpenInSqlRunnerButton.tsx:19-27`. |
| `Should clear query using hotkeys` | Skipped by `it.skip` | Runs a query, presses Ctrl+Alt+K, and checks that Orders remains selected while fields/results clear (`packages/e2e/cypress/e2e/app/explore.cy.ts:468-489`). | Query-history/result-cache state only; reset is client-side. | Browser hotkey and OS modifier semantics. | Component test in a new `packages/frontend/src/pages/Explorer.test.tsx`; the product binding is `mod + alt + k` and clears URL search at `packages/frontend/src/pages/Explorer.tsx:41-52`. |
| `Should search tables and select fields` | Skipped by `it.skip` | Searches `First name`, selects it, queries, and checks nonempty result rows (`packages/e2e/cypress/e2e/app/explore.cy.ts:492-526`). | Query-history/result-cache state only. | Virtualized/search-filtered tree and broad table locators. | Unit/component test alongside `packages/frontend/src/components/Explorer/ExploreSideBar/exploreTree.test.ts`; remove the warehouse-result assertions as duplicate active-query coverage. |
| `Should add a custom dimension` | Skipped by `it.skip` | Creates unsaved SQL dimension `A custom dimension` with SQL `true`, runs it, and checks a populated column (`packages/e2e/cypress/e2e/app/explore.cy.ts:529-568`). | Query-history/result-cache state contains custom SQL; dimension is not saved as chart content. | Ace editor, duplicate Run Query buttons, custom-SQL permission. | Component test in a new `packages/frontend/src/components/Explorer/CustomDimensionModal/CustomSqlDimensionModal.test.tsx`; if backend custom-SQL execution coverage is missing, add an API-only case to `packages/api-tests/tests/customDimensions.test.ts`. |

## Cypress command expansion

- `cy.login()` is called before every test, including skipped declarations if enabled (`packages/e2e/cypress/e2e/app/explore.cy.ts:4-6`). Its implementation uses `cy.session` keyed by the seeded admin email, POSTs `api/v1/login` with seeded credentials, requires status 200, and validates restored sessions with GET `api/v1/user` status 200 (`packages/e2e/cypress/support/commands.ts:152-171`). The Playwright suite already provides equivalent request-based admin authentication and writes request storage state (`packages/e2e/playwright/auth.setup.ts:10-23`), consumed by the Firefox project (`packages/e2e/playwright.config.ts:35-40`); no new login helper is needed.
- `cy.scrollTreeToItem(text)` waits up to 10 seconds for `[data-testid="virtualized-tree-scroll-container"]`, resets `scrollTop`, scans rendered descendants after each 200 ms wait, advances by half a viewport, and falls back to `findByText` at the bottom (`packages/e2e/cypress/support/commands.ts:773-821`). This exists because the product uses `useVirtualizer` with five-item overscan and absolutely positioned rows (`packages/frontend/src/components/Explorer/ExploreTree/TableTree/Virtualization/VirtualizedTreeList.tsx:69-110`). Port as a file-local Playwright function; do not create shared infrastructure for this one target file.
- `cy.getMonacoEditorText()` is used only by the skipped SQL Runner case (`packages/e2e/cypress/e2e/app/explore.cy.ts:455-461`). It waits 200 ms, requires `.monaco-editor`, reads `window.monaco.editor.getModels()[0]`, and normalizes newlines/whitespace (`packages/e2e/cypress/support/commands.ts:751-766`). A unit test of router state avoids carrying this unsafe first-model/global-browser helper into Playwright.
- `findBy*`/`findAllBy*` commands come from the repository's Testing Library Cypress registration (`packages/e2e/cypress/support/commands.ts:45`). Playwright replacements should use `getByRole`, `getByTestId`, `getByLabel`, and scoped locators with exact names where practical.

## State, seed, and environment assumptions

- Every case assumes seeded admin `demo@lightdash.com` with role `ADMIN` (`packages/common/src/index.ts:474-481`). There is no editor/viewer authorization coverage. The active save flow consequently assumes permission to create charts in at least one accessible root space and update chart versions.
- All routes use fixed `SEED_PROJECT`: UUID `3675b69e-8324-4110-bdca-059031aa8da3`, name `Jaffle shop` (`packages/common/src/index.ts:550-558`). The project must expose `Orders`/`orders`, joined `Order Customer`, dimensions `First name` and `Is completed`, metric `Unique order count`, and seeded first-name data containing `Aaron` (`packages/e2e/cypress/e2e/app/explore.cy.ts:10-46,97-111,442-446`).
- `/tables` requires the explores list; selecting Orders requires its explore metadata. The frontend requests `/projects/{projectUuid}/explores?...` and `/projects/{projectUuid}/explores/{exploreId}` (`packages/frontend/src/hooks/useExplores.tsx:6-16`; `packages/frontend/src/hooks/useExplore.tsx:7-14`). This requires the full Lightdash app/backend/database and a working seeded warehouse; there are no third-party SaaS calls required by this spec.
- Unsaved Explore queries POST v2 `/projects/{projectUuid}/query/metric-query` (`packages/frontend/src/hooks/useQueryResults.ts:81-92`) and fetch v2 `/projects/{projectUuid}/query/{queryUuid}` pages (`packages/frontend/src/hooks/useQueryResults.ts:278-299`). The expected response assumptions are successful execution, result metadata/rows, stable sort semantics, and `Aaron` sorting first.
- The skipped SQL case POSTs `/projects/{projectUuid}/explores/{tableId}/compileQuery` (`packages/frontend/src/hooks/useCompiledSql.ts:31-54`). It assumes the generated SQL is passed unchanged as React Router state; that transfer is explicit in `OpenInSqlRunnerButton.tsx:19-27`.
- Saving POSTs `/projects/{projectUuid}/saved` (`packages/frontend/src/hooks/useSavedQuery.ts:27-50`); updating POSTs `/saved/{uuid}/version` (`packages/frontend/src/hooks/useSavedQuery.ts:100-119`). The backend inserts a saved-query row and initial version (`packages/backend/src/models/SavedChartModel.ts:466-501`). The modal preselects the configured default space or first root space (`packages/frontend/src/components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard.tsx:233-251`) and creates the chart there (`packages/frontend/src/components/common/modal/ChartCreateModal/SaveToSpaceOrDashboard.tsx:505-535`).
- `My chart` is fixed (`packages/e2e/cypress/e2e/app/explore.cy.ts:67`) and never deleted. Regular creation derives a unique slug (`packages/backend/src/models/SavedChartModel.ts:466-473`), so duplicate names accumulate and concurrent discovery/port runs can race or pollute shared content even though this test follows the returned chart UUID.
- Tests share no JavaScript variables or aliases. `newTCName` is local to one skipped test (`packages/e2e/cypress/e2e/app/explore.cy.ts:220-235`). There are no `beforeAll`, `afterEach`, or `afterAll` hooks; each test revisits a project URL, while authentication is the only restored Cypress session state (`packages/e2e/cypress/e2e/app/explore.cy.ts:3-10`). No prior suite should be required beyond seed/auth setup, but the fixed chart write currently leaves state for later suites.
- The source claims auto-fetch is enabled and relies on a query/default sort after each field click (`packages/e2e/cypress/e2e/app/explore.cy.ts:18-24`). Current application defaults are key `lightdash-explorer-auto-fetch-enabled` and value `false` (`packages/frontend/src/components/RunQuerySettings/defaults.ts:1-2`); reactive execution only runs when that storage value is enabled (`packages/frontend/src/hooks/useExplorerQueryEffects.ts:207-221`). The Cypress support file only imports commands and does not initialize this key (`packages/e2e/cypress/support/e2e.ts:14-18`). This dependency must be made explicit in the port.
- No timezone or test-specific environment variable is read. The relevant runner environment is `PLAYWRIGHT_BASE_URL`, defaulting to `http://localhost:3000` (`packages/e2e/playwright.config.ts:21`).

## Synchronization and timeout requirements

- Cypress's default command timeout is 10 seconds with 1920×1080 viewport (`packages/e2e/cypress.config.ts:16-18`); the Playwright Firefox project matches that viewport and has 10-second action/assertion timeouts plus 30-second navigation timeout (`packages/e2e/playwright.config.ts:20-23,38-40`).
- Async metric execution returns a query UUID and is polled while status is pending/queued/executing with 250 → 500 → 1000 ms backoff (`packages/frontend/src/features/queryRunner/executeQuery.ts:12-35`). Do not add equivalent sleeps in the test. Pair explicit Run Query clicks with the POST response and then assert a scoped result row/loading transition.
- `page-spinner should not.exist` and `Loading results/chart should not.exist` are absence-only checks (`packages/e2e/cypress/e2e/app/explore.cy.ts:11,40,76,99,120`). They can pass before a spinner appears. The port should wait for a causative request or enabled control first, then assert the final rendered state.
- The save test uses 500 ms after Edit and 300 ms after Configure (`packages/e2e/cypress/e2e/app/explore.cy.ts:78-87`). Replace both with URL/edit-control readiness and exact selected-chart-type visibility. Wait for POST create/version responses around Save clicks, not toast text alone.
- The chart-type test has seven 500 ms sleeps intended to let state mutate (`packages/e2e/cypress/e2e/app/explore.cy.ts:123-149`). After each menu selection, assert the `VisualizationCardOptions` button's exact new name before opening the next menu.
- The skipped calculation test explicitly documents modal stabilization, Firefox focus handling, delayed typing, and post-clear waits (`packages/e2e/cypress/e2e/app/explore.cy.ts:176-194`). These are further evidence for moving the reducer/config behavior to a unit test rather than reproducing sleeps.
- Save cleanup must run in `finally` after the create response/redirect yields the created chart UUID, including when update assertions fail. The existing frontend delete route is v2 DELETE `/projects/{projectUuid}/saved/{id}` (`packages/frontend/src/hooks/useSavedQuery.ts:63-72`).

## Locator and strictness risks

- Unscoped text such as `Orders`, `Dimensions`, `First name`, `Configure`, `Bar chart`, `Table`, `Save`, and `Save changes` can have multiple matches (`packages/e2e/cypress/e2e/app/explore.cy.ts:13-37,54-90,102-155`). Playwright strict mode requires scope: Explore tree container, Results table header, visualization config panel, active modal, or open menu.
- `cy.get('button').contains(...)` and `.findByText(...).parent().click()` depend on DOM ancestry instead of accessible button identity (`packages/e2e/cypress/e2e/app/explore.cy.ts:37,78,90,114`). Use `getByRole('button', { name, exact: true })` and assert enabled state.
- Column headers should be scoped to the results table, then locate their button. Global `th` searches can also match visualization-table headers (`packages/e2e/cypress/e2e/app/explore.cy.ts:27-32,110-111`).
- The `Aaron` assertion says “first row in first column,” but `get('table').find('td').eq(1)` is the second cell across every table (`packages/e2e/cypress/e2e/app/explore.cy.ts:42-46`). Preserve observed intent as `tbody > tr:first-child > td:nth(1)` only after confirming the first cell is a row selector/index; otherwise clarify which data column owns `Aaron`.
- The chart menu already has stable `data-testid="VisualizationCardOptions"` (`packages/frontend/src/components/Explorer/VisualizationCardOptions/index.tsx:236-247`). Scope menu entries by `role=menuitem` and exact text; do not use global button text or raw `[role="menuitem"]` chains.
- The skipped tests use implementation classes `.mantine-Select-item`, `.mantine-Badge-inner`, `div.ace_content`, and global SVG `g > text` (`packages/e2e/cypress/e2e/app/explore.cy.ts:191-194,253-263,295-339`). These are unsuitable strict Playwright contracts and support the unit-test recommendations.
- Positional selectors (`th.eq(1)`, first Run Query button, first Monaco model) conceal duplicate controls/models (`packages/e2e/cypress/e2e/app/explore.cy.ts:417-434,455-461,554`). Prefer semantic scope or test IDs; record an open question if no unique product contract exists.

## Nonstandard or surprising behavior

- The suite is heavily skewed toward skipped coverage: 9 of 12 tests are skipped, and three skips are inherited rather than visible on the individual `it` declarations (`packages/e2e/cypress/e2e/app/explore.cy.ts:267-347`).
- Active query behavior is coupled to an auto-fetch comment that contradicts the current default storage value. The seemingly unnecessary “Unique order count before First name” sequence is intended to avoid an already-applied default sort (`packages/e2e/cypress/e2e/app/explore.cy.ts:18-24`).
- Chart type selection changes only unsaved client configuration in the active type-cycling test; it never saves or validates plotted data (`packages/e2e/cypress/e2e/app/explore.cy.ts:117-156`).
- The save flow persists data but contains commented-out disabled-state assertions because Save Changes behavior was broken (`packages/e2e/cypress/e2e/app/explore.cy.ts:72-74,89-90`). Do not revive those assertions without a separate product fix.
- The SQL Runner test compares whitespace-normalized SQL from whatever Monaco model is first, not a specifically identified editor (`packages/e2e/cypress/support/commands.ts:751-766`). The product behavior under test is simpler: router location state carries `sql` (`packages/frontend/src/components/Explorer/SqlCard/OpenInSqlRunnerButton.tsx:19-27`).
- The hotkey source uses Mantine's cross-platform `mod + alt + k`, while Cypress sends literal Ctrl+Alt+K (`packages/e2e/cypress/e2e/app/explore.cy.ts:482`; `packages/frontend/src/pages/Explorer.tsx:52`).
- There are no downloads/uploads, popups, iframes, clipboard operations, drag-and-drop, canvas assertions, or test-specific timezone handling. SVG appears only in a skipped implementation-detail count; Ace and Monaco appear only in skipped tests.

## Coordination requirements

- Do not dual-run the Cypress source and its Playwright port against a shared preview until the Playwright save test uses a unique name and guaranteed cleanup. The Cypress source will still leave `My chart` behind (`packages/e2e/cypress/e2e/app/explore.cy.ts:67-92`).
- Coordinate ownership of `packages/e2e/playwright/app/explore.spec.ts`; it does not currently exist. No existing Playwright helper covers Explore virtualization, and a shared helper is not justified by this single target. Keep navigation, field selection, and query waiting local to the file.
- Reuse existing admin storage state rather than adding another auth fixture (`packages/e2e/playwright/auth.setup.ts:10-23`; `packages/e2e/playwright.config.ts:35-40`).
- The nine skipped cases should not silently become Playwright skips. Their destination tests need separate frontend/API ownership, or explicit removal decisions, before Cypress deletion.
- The fixed seed project and labels are shared with the broader suite. Do not rename seed content, toggle project-wide settings, or rely on chart-name lookup. Capture created UUIDs from the save response/redirect.

## Exact port plan

1. Create only `packages/e2e/playwright/app/explore.spec.ts` for the active browser coverage; import `SEED_PROJECT`, `expect`, and `test`. Rely on the configured Firefox admin storage state.
2. Add file-local helpers for: navigating directly to `/projects/${SEED_PROJECT.project_uuid}/tables/orders`; waiting for the Explore tree; incrementally scrolling `[data-testid="virtualized-tree-scroll-container"]`; selecting an exact field within that container; opening a result-column menu; and running a query while awaiting the v2 metric-query response. Do not add a shared fixture/helper yet.
3. Initialize `lightdash-explorer-auto-fetch-enabled` explicitly before navigation after resolving the source/default contradiction. To preserve the source's stated scenario, set it to `true` and await each causative query transition; never inherit arbitrary storage from a developer browser.
4. Port `Should query orders` with scoped tree/header/table locators. Select metric before first name as the source does, choose exact `Sort A-Z`, await the explicit Run Query response/final rows, and assert `Aaron` in the first row's customer-name data cell rather than globally using `td[1]`.
5. Port `Should save chart` with a per-run unique name such as `pw-explore-${testInfo.workerIndex}-${Date.now()}`. Await chart creation POST, capture the UUID from response or redirect, verify saved toast/view state, enter Edit, change the stable `VisualizationCardOptions` control to exact `Horizontal bar chart`, await version POST, and verify the update toast. In `finally`, DELETE the captured UUID through Playwright's authenticated request context.
6. Port `Should change chart config type` as one browser test. After the query is ready, iterate an explicit ordered list of exact menu names and assert the options button text after every selection. Keep Table's special trigger behavior semantic by always reopening `VisualizationCardOptions`; remove all 500 ms waits.
7. Do not copy the nine skipped bodies. Add separate follow-up unit targets exactly as listed in Test inventory: `useCartesianChartConfig.test.ts`, `useEchartsCartesianConfig.test.ts`, new `Sorting.test.tsx`, new `GeneralSettings.test.tsx`, new `OpenInSqlRunnerButton.test.tsx`, new `Explorer.test.tsx`, existing `exploreTree.test.ts`, and new `CustomSqlDimensionModal.test.tsx`; add `packages/api-tests/tests/customDimensions.test.ts` only if backend custom-SQL execution lacks coverage.
8. Once the Playwright active tests pass in isolation and the save test cleans up, run a controlled legacy/port comparison sequentially. Do not run both save cases concurrently on a shared preview.

## Verification plan

Run from repository root:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e exec eslint -c .eslintrc.js playwright/app/explore.spec.ts
pnpm -F e2e exec oxfmt --ignore-path ./../../.gitignore playwright/app/explore.spec.ts --check
pnpm -F e2e playwright:run -- playwright/app/explore.spec.ts --project=firefox
```

After unit/API dispositions are implemented, run only their exact targets, then package checks:

```bash
pnpm -F frontend test -- \
  src/hooks/cartesianChartConfig/useCartesianChartConfig.test.ts \
  src/hooks/echarts/useEchartsCartesianConfig.test.ts \
  src/components/SortButton/Sorting.test.tsx \
  src/components/VisualizationConfigs/TableConfigPanel/GeneralSettings.test.tsx \
  src/components/Explorer/SqlCard/OpenInSqlRunnerButton.test.tsx \
  src/pages/Explorer.test.tsx \
  src/components/Explorer/ExploreSideBar/exploreTree.test.ts \
  src/components/Explorer/CustomDimensionModal/CustomSqlDimensionModal.test.tsx
pnpm -F frontend typecheck:fast
pnpm -F frontend lint
pnpm -F frontend format
pnpm -F api-tests test:api -- tests/customDimensions.test.ts
```

For sequential parity only, while Cypress still exists:

```bash
pnpm -F e2e cypress:run --spec cypress/e2e/app/explore.cy.ts
pnpm -F e2e playwright:run -- playwright/app/explore.spec.ts --project=firefox
```

After each save-test run, verify the created UUID is no longer active rather than querying by non-unique name.

## Open questions

1. Where is `lightdash-explorer-auto-fetch-enabled` set to `true` in the environment where this Cypress test currently passes? The source relies on enabled auto-fetch (`packages/e2e/cypress/e2e/app/explore.cy.ts:18-24`), but the application default is false (`packages/frontend/src/components/RunQuerySettings/defaults.ts:1-2`) and Cypress support does not set it (`packages/e2e/cypress/support/e2e.ts:14-18`).
2. In `Should query orders`, is `td.eq(1)` intentionally skipping a row-selector/index column, or is the “first row in first column” comment stale (`packages/e2e/cypress/e2e/app/explore.cy.ts:42-46`)?
3. Should the active chart-type cycling remain a broad Playwright smoke test, or is component coverage preferred once the migration is stable? It currently checks labels/state only, not rendered series correctness (`packages/e2e/cypress/e2e/app/explore.cy.ts:117-156`).
4. Are the nine skipped tests known to fail, obsolete, or merely awaiting unit ports? Their comments state destination but no skip reason or issue reference (`packages/e2e/cypress/e2e/app/explore.cy.ts:159-160,238-239,266-267,343-344,440-441,467-468,491-492,528-529`).
5. Is soft deletion through the public v2 chart endpoint sufficient cleanup for shared-preview policy, or does migration infrastructure provide an approved hard-cleanup path for test-created charts?

## Port history

Not started.
