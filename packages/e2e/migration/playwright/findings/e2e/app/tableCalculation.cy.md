# packages/e2e/cypress/e2e/app/tableCalculation.cy.ts

## Classification

Recommended runner: Backend/common/frontend unit tests plus API tests; do not port this file to Playwright
Execution lane: Retire skipped Cypress coverage after focused unit/API replacements
Active tests: 0
Skipped tests: 4 (all are directly `it.skip` and also inherit `describe.skip`)
Persistent mutation: No named content; if enabled, query execution creates query-history/result-cache records with generated query UUIDs
Shared-preview dual-run safe: Yes in its current fully skipped state; also expected safe if replaced with read-only API/unit coverage
Difficulty total: 11/18 (persistent/shared state 1, browser interaction complexity 3, environment/external dependencies 2, synchronization/flakiness 3, authentication/authorization 1, cross-file infrastructure 1)
Coordination keys: none
Analysis status: clarification-required

The source itself marks every case `todo: move to unit test` (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:8,37,67,118`). Its assertions primarily cover SQL/template compilation, result typing, and filter semantics, not browser-only behavior. The E2E package requires API-only behavior to move to `packages/api-tests` (`packages/e2e/CLAUDE.md:9-14`), and the API-test package explicitly supports authenticated async metric queries (`packages/api-tests/CLAUDE.md:23-37`). A Playwright recreation would preserve virtual-list, editor, positional-locator, and network timing fragility without adding meaningful coverage.

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `I can create a quick table calculation (rank in column)` | Skipped directly and by parent suite (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,9`) | Selects `payments_payment_method` and `payments_total_revenue`, adds Rank in column from the second table-header action, opens generated SQL, and checks a `RANK()` fragment plus `FROM metrics` (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:10-34`). | Unsaved Explorer Redux state only; compile-query POST if enabled. | Virtualized tree, positional header action, auto compile request, Monaco global model read. | Unit test. Add the missing direct rank-template compiler assertion to `packages/backend/src/tableCalculationTemplateQueryCompiler.test.ts`; optionally cover generated quick-template shape in a new `packages/frontend/src/components/Explorer/ResultsCard/tableCalculationTemplateGenerator.test.ts`. No Playwright test. |
| `I can create a quick table calculation (running total)` | Skipped directly and by parent suite (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,38`) | Selects the same payment fields, adds Running total, and checks generated SQL ordering by payment method plus `FROM metrics` (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:39-64`). | Unsaved Explorer state only; compile-query POST if enabled. | Same virtualized-tree, positional-action, and Monaco mechanics. | Remove as redundant after confirming existing backend unit coverage: ascending running-total SQL is already asserted at `packages/backend/src/tableCalculationTemplateQueryCompiler.test.ts:482-498`. Add a frontend template-generator unit only if quick-menu construction itself is considered a gap. |
| `I can create a string table calculation` | Skipped directly and by parent suite (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,68`) | Creates `Ranking` as a string SQL table calculation, runs it, expects `rank_1`/`rank_2`, verifies a string icon and `starts with` operator, filters to `rank_1`, and expects `rank_2` gone (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:69-115`). | Unsaved Explorer/filter state; two read-only warehouse queries create query-history/result records. No chart or table calculation is saved. | Virtualized tree, Ace editor, forced submit, Mantine select internals, keyboard selection, async query polling, broad global text assertions. | Split by concern: API integration in new `packages/api-tests/tests/tableCalculations.test.ts` for expression/result/filter behavior; pure mapping/compiler assertions in `packages/common/src/utils/filters.test.ts` and `packages/common/src/compiler/filtersCompiler.test.ts`; icon mapping in new `packages/frontend/src/components/common/Filters/utils/fieldIconUtils.test.ts`. No Playwright test. |
| `I can create a number table calculation` | Skipped directly and by parent suite (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,119`) | Creates numeric `Ranking`, expects rank-times-100 values, verifies numeric icon and `greater than`, waits for debounce, reruns, and expects only values over 2000 (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:120-165`). | Unsaved Explorer/filter state; two read-only warehouse queries create query-history/result records. No named content. | Same as string case plus a hard-coded 350 ms debounce sleep. | Same split as string case in `packages/api-tests/tests/tableCalculations.test.ts`, common filter unit files, and `fieldIconUtils.test.ts`. No Playwright test. |

## Cypress command expansion

- `cy.login()` is declared in the suite `beforeEach` (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:4-6`), but no hook runs while the suite/tests remain skipped. If enabled, it creates or restores a `cy.session` keyed by the seed admin email, POSTs `api/v1/login` with seed credentials, requires 200, and validates reuse with GET `api/v1/user` requiring 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The account is `demo@lightdash.com` / `demo_password!`, organization admin (`packages/common/src/index.ts:465-481`).
- `cy.scrollTreeToItem(text)` is used twice in each test (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:13,15,42,44,71,74,122,125`). It waits up to 10 seconds for `[data-testid="virtualized-tree-scroll-container"]`, resets scroll to zero, advances by half a viewport, sleeps 200 ms per step, scans all rendered descendants with several text heuristics, and falls back to `findByText` at the bottom (`packages/e2e/cypress/support/commands.ts:773-823`). The helper exists because the product renders only virtual items with five-item overscan and absolute positioning (`packages/frontend/src/components/Explorer/ExploreTree/TableTree/Virtualization/VirtualizedTreeList.tsx:76-110`).
- `cy.getMonacoEditorText()` is called twice in the rank test and three times in the running-total test (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:26-34,55-64`). Every call sleeps 200 ms, checks `.monaco-editor`, reaches through `window.monaco.editor.getModels()[0]`, reads the first model, and normalizes whitespace (`packages/e2e/cypress/support/commands.ts:751-765`). It assumes the relevant SQL is always Monaco model zero.
- `cy.findByText`, `cy.findByTestId`, and `cy.findByPlaceholderText` come from Testing Library, imported globally by `@testing-library/cypress/add-commands` (`packages/e2e/cypress/support/commands.ts:48`). They add retrying semantic queries but do not narrow the many global text matches in this source.
- All remaining commands (`visit`, `get`, `contains`, `click`, `type`, `clear`, `wait`, `should`, `within`, `wrap`, `window`) are built-in Cypress commands; this source invokes no fixture/task/upload/download helper.

## State, seed, and environment assumptions

- All routes hard-code the imported seed project: `SEED_PROJECT.project_uuid` is `3675b69e-8324-4110-bdca-059031aa8da3`, project name `Jaffle shop` (`packages/common/src/index.ts:550-558`). The project must expose `payments` and `orders` explores.
- The payment model must contain `payment_method` and `total_revenue`; those are defined in the full Jaffle Shop demo metadata (`examples/full-jaffle-shop-demo/dbt/models/payments.yml:3-4,44-46,64-81`). The order model must continue exposing `order_date` and `total_order_amount` (`examples/full-jaffle-shop-demo/dbt/models/orders.yml:273,370`). The exact result literals `rank_1`, `rank_2`, `100`, `1500`, `1800`, `2000`, and `2200` additionally depend on the seeded warehouse rows and grouping/order semantics, not only metadata (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:92-95,142-146,163-165`).
- Authentication is API/session-cookie based, not a UI login. The seed admin has `manage CustomSqlTableCalculations` at organization scope (`packages/common/src/authorization/organizationMemberAbility.ts:297-305`), which matters because the string/number cases author raw SQL.
- Cypress normally uses `http://localhost:3000`, 1920x1080, 10-second commands, two run-mode retries by default, and blocks analytics/support hosts (`packages/e2e/cypress.config.ts:13-33`). The source reads no environment variable directly. It requires the frontend, backend, PostgreSQL/query-history storage, and seeded warehouse; no third-party service is part of the asserted behavior.
- There are no aliases, fixtures, `before`/`after` hooks, explicit cleanup, or dependence on prior tests/suites. Cypress test isolation plus a new Explore route gives each enabled test fresh browser-local Explorer state. Reusing the display name `Ranking` in tests 3 and 4 cannot collide because neither calculation is saved.
- Query execution persists generated query-history/result-cache records, but UUID generation prevents name/key collision. Concurrent Cypress/Playwright/API execution reads the same seed project and warehouse without modifying modeled data. The development seed already contains distinct saved Rank and Running Total test charts (`packages/backend/src/database/seeds/development/11_table_calculation_charts.ts:280-350`), but this source neither looks them up nor changes them.
- The first two cases trigger compiled-SQL POSTs to `/api/v1/projects/{projectUuid}/explores/{tableId}/compileQuery`; the query body includes dimensions, metrics, sorts, filters, limit, and table calculations (`packages/frontend/src/hooks/useCompiledSql.ts:34-54,81-92`). The latter cases run async metric queries via POST `/api/v2/projects/{projectUuid}/query/metric-query` and poll GET `/api/v2/projects/{projectUuid}/query/{queryUuid}` (`packages/frontend/src/hooks/useQueryResults.ts:81-92,278-297`). The source asserts neither status nor response shape directly.

## Synchronization and timeout requirements

- Selection and calculation changes cause asynchronous compiled-SQL refreshes, but the source registers no intercept and waits only through `cy.getMonacoEditorText()`'s fixed 200 ms (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:30-34,60-64`; `packages/e2e/cypress/support/commands.ts:751-765`). A direct unit test removes that race.
- Each virtualized-tree search can perform multiple 200 ms sleeps and has a 10-second container timeout (`packages/e2e/cypress/support/commands.ts:773-821`). A Playwright port would need scrolling tied to rendered rows, not copied sleeps; this local use does not justify shared infrastructure.
- `Run query` starts asynchronous warehouse execution. The source relies on global `cy.contains` retries and the 10-second default command timeout rather than waiting on the metric-query lifecycle (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:89-95,110-115,139-146,161-165`; `packages/e2e/cypress.config.ts:18`). API replacements must poll the returned `queryUuid` until `ready`, allowing about 60 seconds as prescribed by `packages/api-tests/CLAUDE.md:35-37`; an existing direct-query polling pattern is at `packages/api-tests/tests/pivotQuery.test.ts:37-62`.
- The number filter intentionally sleeps 350 ms for a 300 ms component debounce (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:159-161`). The component confirms `onChange` is debounced by 300 ms (`packages/frontend/src/components/common/Filters/FilterInputs/FilterNumberInput.tsx:35-40,68-86`). A component unit test should use fake timers; an API test should construct the final filter directly.
- The source sets no custom test timeout. Cypress run retries can hide intermittent editor/query failures; `CYPRESS_RETRIES` defaults to two (`packages/e2e/cypress.config.ts:12-21`).

## Locator and strictness risks

- `cy.get('thead').find('.mantine-ActionIcon-root').eq(1)` identifies a quick-calculation menu by DOM order and Mantine implementation class, not accessible name (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:19,48`). Any inserted header action silently changes the target.
- `findByText`/`contains` calls are global and often non-unique: field labels can exist in the tree and elsewhere; `Month`, `string`, `starts with`, `greater than`, `Run query`, and result values can have multiple matches (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:14-20,72-77,83-90,104-114,123-140,156-164`). Playwright strict mode would reject many of these locators.
- Result assertions such as `cy.contains('100')` and `cy.contains('2000')` are substring/global-page assertions, not row/column cell assertions (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:142-146`). Negative assertions for `rank_2`/`1800` are likewise global and may pass or fail for unrelated UI text (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:114-115,164-165`). API assertions should inspect the named `ranking` result field.
- `.tabler-icon-abc` and `.tabler-icon-123` check only that an icon exists somewhere, without associating it with `Ranking` (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:103,155`). The pure icon mapping currently maps string to `citation` and number to `numerical` (`packages/frontend/src/components/common/Filters/utils/fieldIconUtils.ts:7-18`), so the old Tabler class names may already be stale.
- `.mantine-Select-input[value='number']`, `.mantine-Select-input[value='is']`, `form contains Create`, and forced submit depend on internal classes/values and bypass actionability (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:83-87,104-108,135-137,156-159`). Current accessible role/name locators would be required for browser coverage.
- `#ace-editor` assumes legacy SQL mode (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:79-82,130-133`). The current modal defaults a new calculation to Formula when the warehouse dialect supports it (`packages/frontend/src/features/tableCalculation/components/TableCalculationModal.tsx:125-132,162-186`); the SQL form is still Ace (`packages/frontend/src/features/tableCalculation/components/SqlForm.tsx:189-210`) but may not be mounted until the user switches modes.
- The Monaco helper's first-model access is not locator-strict and can read another editor if more than one model exists (`packages/e2e/cypress/support/commands.ts:751-758`).

## Nonstandard or surprising behavior

- Every test is doubly skipped: the parent suite is skipped and each test is skipped (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,9,38,68,119`). Consequently `beforeEach` does not authenticate and none of the described API/storage effects currently occur.
- The source's four identical comments request unit-test migration, but the suite-level skip has no reason or date beyond those comments (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:8,37,67,118`). There is no evidence in this file whether the expected product behavior was intentionally retired.
- Quick calculations now construct typed templates in frontend state (`packages/frontend/src/components/Explorer/ResultsCard/QuickCalculations.tsx:119-147`); rank/running-total template shape is a pure function (`packages/frontend/src/components/Explorer/ResultsCard/tableCalculationTemplateGenerator.ts:54-71`), and SQL generation is a backend pure switch (`packages/backend/src/tableCalculationTemplateQueryCompiler.ts:235-253`). This strongly supports unit coverage rather than browser SQL-editor inspection.
- Running-total SQL is already covered with ascending, descending, multiple, empty, mixed, and custom-bin sorts (`packages/backend/src/tableCalculationTemplateQueryCompiler.test.ts:482-570`). Porting the skipped running-total browser case would duplicate stronger existing coverage.
- The string/number cases call their expression a table calculation but enter warehouse SQL syntax (`'||'`, `RANK() OVER`) rather than current formula syntax (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:79-82,130-133`). Current supported warehouses default new calculations to Formula mode, so the old interaction is incomplete unless it first chooses `Use SQL instead` (`packages/frontend/src/features/tableCalculation/components/TableCalculationModal.tsx:169-186`).
- Declared type controls filter semantics: string types compile with string operators/case sensitivity, while number types compile numerically (`packages/common/src/compiler/filtersCompiler.ts:756-778`), and the shared filter type mapping selects string versus number operator sets (`packages/common/src/utils/filters.ts:119-154`). These are deterministic pure seams currently better suited to unit tests.
- There are no downloads/uploads, popups, iframes, clipboard operations, canvas/SVG assertions, drag-and-drop, timezone assertions, browser permission APIs, or file-system mechanics. Nonstandard mechanics are limited to virtualization, Ace, Monaco global access, asynchronous query polling, and debounce.

## Coordination requirements

- No shared Playwright helper is warranted because the recommended port creates no Playwright file. Do not add a shared virtualized-tree or Monaco helper for this retired, fully skipped source.
- Reuse the existing API-test `login()` and cookie-aware `ApiClient` (`packages/api-tests/helpers/auth.ts:13-27`; `packages/api-tests/CLAUDE.md:27-34`). Use the existing polling convention/helper rather than introducing table-calculation-specific shared infrastructure unless more than this file needs it.
- Unit additions touch existing compiler/filter seams; coordinate only if another worker is already modifying `packages/backend/src/tableCalculationTemplateQueryCompiler.test.ts`, `packages/common/src/utils/filters.test.ts`, or `packages/common/src/compiler/filtersCompiler.test.ts`. There is no runtime coordination key or cleanup contract.
- Direct async queries are read-only against seed warehouse data and use generated query UUIDs. Parallel dual-run does not create duplicate `Ranking` content because nothing is saved.

## Exact port plan

1. Do not create `packages/e2e/playwright/app/tableCalculation.spec.ts`.
2. In `packages/backend/src/tableCalculationTemplateQueryCompiler.test.ts`, add the missing focused `RANK_IN_COLUMN` case asserting `RANK() OVER (ORDER BY "table_revenue" ASC)`. Keep the existing running-total cases at lines 482-570; do not duplicate them.
3. If quick-menu state construction needs explicit coverage, create `packages/frontend/src/components/Explorer/ResultsCard/tableCalculationTemplateGenerator.test.ts` and assert that rank/running-total inputs return only the expected discriminated templates and field IDs. Test the exported pure function; do not mount Explorer.
4. Create `packages/api-tests/tests/tableCalculations.test.ts` for the two result/filter scenarios. Authenticate once with existing `login()`, use `SEED_PROJECT`, POST a direct `/api/v2/projects/{projectUuid}/query/metric-query` request for `orders_order_date_month`, `orders_total_order_amount`, and a typed string/number SQL table calculation, then poll the returned query UUID to `ready`. Assert raw values through the `ranking` field, rerun with a table-calculation `startsWith` or `greaterThan` filter, and assert included/excluded values. Do not create or save charts.
5. Add pure type assertions to `packages/common/src/utils/filters.test.ts` for `TableCalculationType.STRING -> FilterType.STRING` and `TableCalculationType.NUMBER -> FilterType.NUMBER`, and SQL assertions to `packages/common/src/compiler/filtersCompiler.test.ts` for string `startsWith` and numeric `greaterThan` table-calculation filters.
6. Create `packages/frontend/src/components/common/Filters/utils/fieldIconUtils.test.ts` only if preserving the old icon assertions is desired; assert the current semantic icon names (`citation`/`numerical`) rather than stale `.tabler-icon-*` classes.
7. After the replacement coverage lands, remove `packages/e2e/cypress/e2e/app/tableCalculation.cy.ts` from the migration branch. No manifest or shared helper registration is needed.

## Verification plan

Run targeted behavior first:

```bash
pnpm -F backend test -- src/tableCalculationTemplateQueryCompiler.test.ts
pnpm -F common test -- src/utils/filters.test.ts src/compiler/filtersCompiler.test.ts
pnpm -F frontend test -- src/components/Explorer/ResultsCard/tableCalculationTemplateGenerator.test.ts src/components/common/Filters/utils/fieldIconUtils.test.ts
pnpm -F api-tests test:api -- tests/tableCalculations.test.ts
```

Then package checks for whichever target files were actually added:

```bash
pnpm -F backend typecheck:fast
pnpm -F backend lint
pnpm -F backend format
pnpm -F common typecheck:fast
pnpm -F common lint
pnpm -F common format
pnpm -F frontend typecheck:fast
pnpm -F frontend lint
pnpm -F frontend format
pnpm -F api-tests typecheck:fast
pnpm -F api-tests lint
pnpm -F api-tests format
```

The API test requires the already-running Lightdash backend plus seeded project/warehouse; do not run a browser, migration, or seed specifically for this discovery. No `pnpm -F e2e playwright:run` verification is appropriate because no Playwright target should be created.

## Open questions

1. Was the suite skipped solely pending unit-test migration, or because raw SQL table calculations were being replaced by Formula mode? The source supplies only repeated `todo: move to unit test` comments and no suite-level explanation (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:3,8,37,67,118`). Confirm before deciding whether the string/number API tests should send legacy `sql` or current `formula` table calculations.
2. Are the exact seed-dependent values (`1500`, `1800`, `2000`, `2200`) contractual, or should replacement API tests assert rank ordering/filter predicates without coupling to the current Jaffle data? The source does not explain those literals (`packages/e2e/cypress/e2e/app/tableCalculation.cy.ts:142-165`).
3. Is UI-level proof that the result type changes the icon/operator menu still required? If yes, prefer focused component tests around current `fieldIconUtils` and filter-type mapping; if no, omit `fieldIconUtils.test.ts` and rely on common/API coverage.

## Port history

Not started.
