# packages/e2e/cypress/e2e/app/downloadCsv.cy.ts

## Classification

Recommended runner: Playwright (Firefox browser E2E); do not port the two removal-marked skipped cases
Execution lane: App UI, serial, scheduler-backed export
Active tests: 1
Skipped tests: 2
Persistent mutation: Yes — async query history/results, Graphile job state, `scheduler_log`, and exported object storage; optionally a persistent-download DB row
Shared-preview dual-run safe: Yes for identity/state collisions because query/job/file identifiers are generated; shared warehouse, scheduler, and object-storage capacity can still cause timing contention
Difficulty total: 11/18 (persistent/shared state 2, browser interaction complexity 2, environment/external dependencies 3, synchronization/flakiness 3, authentication/authorization 1, cross-file infrastructure 0)
Coordination keys: `seed-project:3675b69e-8324-4110-bdca-059031aa8da3`, `seed-admin:demo@lightdash.com`, `jaffle-shop-warehouse`, `scheduler-worker`, `exports-storage`
Analysis status: analyzed

This remains a browser test because the active case verifies Explore tree interaction, query execution, export-popover state, and the browser download trigger (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:166-211`). The schedule/status API contract can be asserted through browser responses, but moving the whole case to API tests would lose the behavior under test.

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Download CSV on Dashboards Should download a CSV from dashboard` | Skipped through `describe.skip` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:105-106`) | Would open seeded `Jaffle dashboard`, wait for its table tile, open the tile menu, select Download data, schedule export, and poll for `fileUrl` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:121-146`). | If enabled: dashboard chart queries/results as needed, download job/log, export object, and possibly persistent-download row. No dashboard edit. | Entire suite and hook are skipped; table/SVG-like dashboard rendering, hover, modal, generated browser download, scheduler polling. | Removal. The inline `todo: remove` was added by commit `d5a8253a5b2` (“skip and mark e2e tests for removal or migration to unit tests”), and the same download component/API path is exercised by the active Explore case. Clarify only if dashboard-specific menu coverage is still required. |
| `Download CSV on Explore Should download CSV from results on Explore` | Active (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:150-166`) | Opens Orders, selects joined customer name and unique-order-count fields, runs a query, opens Results export, schedules CSV generation, and waits until the scheduler returns a completed job with `fileUrl` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:167-295`). | Creates query history/results, a download Graphile job and `scheduler_log` records, and a CSV object; persistent URL mode can also create a DB row. No named content is saved. | Virtualized tree scrolling, conditional duplicate-button handling, async query, popover, recursive network polling, generated anchor download, 60-second visit timeout. | `packages/e2e/playwright/app/downloadCsv.spec.ts` as one Playwright test, strengthened to observe an actual `.csv` download. |
| `Download CSV on Explore Should download CSV from table chart on Explore` | Explicit `it.skip`; inherited Explore `beforeEach` does not execute for the skipped test (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:150-164,298-299`) | Would repeat the active query setup, change the unsaved visualization from Bar chart to Table, open its export control, and use the shared schedule/poll helper (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:300-331`). | If enabled: query history/results and export job/object; chart-type change is local unsaved UI state. | Virtualization, conditional card expansion, menu selection, first-of-many export selector, scheduler polling, generated download. | Removal. It carries the same `todo: remove` from commit `d5a8253a5b2` and duplicates the active result-export backend/component path. Prefer focused component coverage if Table-chart-specific presentation needs coverage. |

## Cypress command expansion

- `cy.login()` is called by each suite’s `beforeEach` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:107-119,151-164`). It creates/restores a `cy.session` keyed by the seed admin email, logs in with `POST api/v1/login`, requires 200, and validates restored cookies with `GET api/v1/user`, also requiring 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The account is admin David Attenborough, `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:465-481`). Playwright already creates equivalent request storage state through those endpoints and applies it to Firefox (`packages/e2e/playwright/auth.setup.ts:10-23`; `packages/e2e/playwright.config.ts:33-40`); no new auth helper is needed.
- `cy.scrollTreeToItem(itemText)` is used for `Order Customer`, `First name`, and `Unique order count` in both Explore cases (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:170-175,305-310`). It resets the virtualized container to the top, advances by half a viewport, waits 200 ms after every movement, scans rendered descendants by text, and falls back to a final Testing Library lookup at the bottom (`packages/e2e/cypress/support/commands.ts:773-821`). The underlying list renders only virtual items with five-item overscan (`packages/frontend/src/components/Explorer/ExploreTree/TableTree/Virtualization/VirtualizedTreeList.tsx:75-99`). Keep any Playwright scrolling routine local to the target file; this migration has one active use-site and does not justify shared infrastructure.
- `findByText`, `findAllByText`, and `findByTestId` come from the third-party Testing Library Cypress command registration (`packages/e2e/cypress/support/commands.ts:35-46`), not another repository command.

## State, seed, and environment assumptions

- All cases use seed project `3675b69e-8324-4110-bdca-059031aa8da3` (`Jaffle shop`) (`packages/common/src/index.ts:550-558`) and the seed admin session. The Results export control requires `manage` on `ExportCsv` for that project (`packages/frontend/src/components/Explorer/ResultsCard/ResultsCard.tsx:169-186`). Scheduling also checks authenticated project view access (`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:1308-1344`).
- The active case assumes a compiled Explore labeled `Orders`, joined table label `Order Customer`, and `unique_order_count` count-distinct metric (`examples/full-jaffle-shop-demo/lightdash/models/orders.yml:1-23,50-57`), plus the customer `first_name` dimension (`examples/full-jaffle-shop-demo/dbt/models/customers.yml:105-111`). It also assumes queryable seeded warehouse data so export is enabled; no-data results render no useful ExportResults action.
- The skipped dashboard case assumes a seeded `Jaffle dashboard` containing the table chart “Which customers have not recently ordered an item?” (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:171-185,200-215`) and exactly six table headers (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:125-136`). The dashboard name is not created by this spec, so there is no duplicate-name risk, but name-based lookup can become ambiguous if other suites create a duplicate dashboard.
- Active API flow: Run query posts an async metric query to `/api/v2/projects/{projectUuid}/query/metric-query` (`packages/frontend/src/hooks/useQueryResults.ts:81-92`), with result polling/pages under `/api/v2/projects/{projectUuid}/query/{queryUuid}`. Default “Table rows” normally reuses the completed query UUID when its limit equals `totalResults`; otherwise export executes another async query (`packages/frontend/src/hooks/useExplorerQuery.ts:62-92`). Export posts `/api/v2/projects/{projectUuid}/query/{queryUuid}/schedule-download`, expecting HTTP 200 and `results.jobId` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:192-221`; controller contract at `packages/backend/src/controllers/v2/QueryController.ts:601-637`). The frontend then gets `/api/v1/schedulers/job/{jobId}/status` until completion (`packages/frontend/src/features/scheduler/hooks/useScheduler.ts:194-203,476-510`; controller at `packages/backend/src/controllers/schedulerController.ts:590-608`).
- The scheduler must be enabled and consuming Graphile Worker jobs. Scheduling inserts a generated job and a scheduled `scheduler_log` entry (`packages/backend/src/scheduler/SchedulerClient.ts:1617-1641`); status reads that job-specific log (`packages/backend/src/models/SchedulerModel/index.ts:1957-1970`). CSV transformation reads query-result storage and writes exports storage. The returned URL is a raw S3/MinIO URL by default, or `/api/v1/file/{nanoid}` plus a persistent-download row when persistent URLs are enabled (`packages/backend/src/services/PersistentDownloadFileService/PersistentDownloadFileService.ts:38-87`). Thus Postgres, the warehouse, scheduler worker, and S3/MinIO are all required external processes.
- There is no cleanup. Generated query UUIDs, job IDs, file names, and optional nanoids prevent direct concurrent identity collisions, but both Cypress and Playwright runs consume the same scheduler/warehouse/object-storage resources. The active test creates no reusable content name or saved chart/dashboard mutation.
- Cypress fixes the base URL at `http://localhost:3000`, defaults commands to 10 seconds, and uses a 1920×1080 viewport (`packages/e2e/cypress.config.ts:15-26`). Playwright accepts `PLAYWRIGHT_BASE_URL`, runs Firefox with the same viewport, one worker, and admin storage state (`packages/e2e/playwright.config.ts:6-13,20-40`). `PERSISTENT_DOWNLOAD_URLS_ENABLED` changes only the returned download URL form, not the asserted workflow. No timezone value is asserted, although the generated attachment filename includes the frontend’s current date (`packages/frontend/src/components/ExportResults/index.tsx:128-130,155-162`).

## Synchronization and timeout requirements

- Navigation has an explicit 60-second Cypress timeout and waits for `page-spinner` to disappear (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:159-164`). The port should use web-first visibility/absence assertions and a locally increased test timeout (90 seconds) because Playwright’s configured navigation timeout is only 30 seconds (`packages/e2e/playwright.config.ts:20-26`). Do not add fixed page-load sleeps.
- Query readiness is inferred from disappearance of `Loading chart` and `Loading results` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:177-182`). Preserve both UI readiness checks before opening export, and require the export action to be visible and enabled.
- The frontend itself polls status every two seconds until completed/error (`packages/frontend/src/features/scheduler/hooks/useScheduler.ts:476-510`). Cypress separately waits for each intercepted poll and inserts one-second delays, with up to 15 attempts and three-second per-interception waits (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:223-295`). This doubles synchronization logic and permits roughly a minute of waiting. Playwright should arm schedule-response and browser-download listeners before clicking, let the application own status polling, and use the download event as completion evidence rather than reimplement recursive polling.
- The active test tolerates non-200/non-304 status responses, missing bodies, and unknown states by retrying (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:242-290`). The skipped shared helper is stricter: it accepts 200/304 but immediately reads `response.body.results` and fails on missing/unknown state (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:55-96`). Do not port either bespoke loop. Assert schedule 200/`jobId`, then actual download completion; an error toast or download timeout should fail the test.
- Intercepts are correctly installed before the export click (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:190-211`), but the wildcard status route can consume an unrelated scheduler request. Any response assertion in Playwright must bind to the schedule response’s exact generated job ID.
- `cy.get('body').then(...)` inspects export-button count only once and conditionally collapses Chart (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:183-188`). Replace this race-prone branch by semantically scoping to the Results card rather than waiting for global count/state.

## Locator and strictness risks

- `findByText('Orders')`, `Order Customer`, `First name`, and `Unique order count` are global text queries (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:168-175`). These labels can appear in sticky headers, selected-field panels, chart labels, or the virtualized tree. Use exact text and scope field locators to `virtualized-tree-scroll-container`; click the returned in-container element rather than performing a second global lookup.
- The tree is virtualized, so a normal `scrollIntoViewIfNeeded()` cannot find an unrendered item. A local routine must scroll the container and retry locator visibility without arbitrary global selectors (`packages/e2e/cypress/support/commands.ts:773-821`).
- `cy.get('button').contains('Run query')`, `Configure`, `Bar chart`, and menu text are non-strict/global (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:178,322-324`). Use role/name locators. The two skipped cases should not be copied merely to preserve these locators.
- More than one `export-csv-button` can exist when Chart and Results are expanded, which the active test acknowledges (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:183-186`). The skipped chart case uses `.first()` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:325`), which hides ambiguity. In Playwright, scope to the Results card and assert exactly one export control in that scope.
- `Chart-card-expand` is dynamically derived from the card title (`packages/frontend/src/components/common/CollapsableCard/CollapsableCard.tsx:65-94`). Prefer a named card/heading relationship; retain the test ID only if no accessible relationship exists.
- The export trigger is an icon-only action with `data-testid="export-csv-button"` (`packages/frontend/src/components/Explorer/ResultsCard/ResultsCard.tsx:177-189`); the final Download button has stable text and `chart-export-results-button` (`packages/frontend/src/components/ExportResults/index.tsx:459-469`). Role/name is appropriate for Download; the scoped test ID is justified for the unlabeled icon.
- Seed dashboard lookup by visible name and assumptions like exactly six `thead th` elements are brittle (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:125-133`). This supports removing rather than reviving the skipped case.

## Nonstandard or surprising behavior

- Despite the test titles, no case validates downloaded bytes, filename, MIME type, or even a browser download event. Success is only a completed scheduler response containing `fileUrl` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:265-267`). The application then creates a temporary `<a download>` and clicks it (`packages/frontend/src/components/ExportResults/index.tsx:152-166`). The Playwright port should close this coverage gap by asserting a `.csv` download and non-empty file.
- Both hooks register `url:changed` and assign `window.location.href = '/'` whenever a URL contains `.csv` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:110-114,154-158`). This is a runner-global navigation workaround, not a download assertion, and may mask attachment/header failures by abandoning the tested page. Do not reproduce it; Playwright has first-class download events.
- The active test duplicates the local `waitForDownloadToComplete` helper instead of calling it. Its duplicate is more tolerant of transient/unknown scheduler responses and allows 15 rather than 10 polls (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:4-103,190-295`). The helper is now used only by skipped tests, so there is no reusable behavior to migrate.
- A 304 status is accepted even though a 304 commonly has no response body; the active loop explicitly retries missing `results` (`packages/e2e/cypress/e2e/app/downloadCsv.cy.ts:242-263`). This history explains the unusual response handling but should not become Playwright-side polling code.
- The source contains no uploads, popups, iframes, clipboard, Monaco, drag-and-drop, canvas assertions, timezone assertions, or explicit debounce. Nonstandard mechanics are virtualization, generated async downloads, direct browser-anchor APIs, and scheduler polling.

## Coordination requirements

- No new shared helper or configuration is required. Reuse `packages/e2e/playwright/auth.setup.ts` and existing Firefox storage state. Keep the virtual-tree scrolling and response predicates local to `packages/e2e/playwright/app/downloadCsv.spec.ts`; there is only one active migrated test.
- Shared-preview dual-running with the Cypress active case is collision-safe: neither run updates named content, and generated query/job/file IDs isolate records. Keep execution serial because the existing Playwright config uses one worker (`packages/e2e/playwright.config.ts:9-13`) and scheduler/warehouse capacity is the practical contention point.
- Do not coordinate on wildcard scheduler aliases. Capture the active run’s `jobId` from its schedule response. No cleanup key is needed, but retained query/job/export artifacts are an environment-lifecycle concern rather than test-owned named fixtures.
- The two skip decisions are not a shared-infrastructure blocker. Their `todo: remove` markers came from the same explicit removal/migration commit; only product-coverage clarification could justify restoring either.

## Exact port plan

1. Create only `packages/e2e/playwright/app/downloadCsv.spec.ts`; import `SEED_PROJECT` and Playwright `test`/`expect`. Do not change auth setup, config, or shared helpers.
2. Add one file-local virtualized-tree routine that targets `virtualized-tree-scroll-container`, advances its own `scrollTop`, and retries exact in-container text visibility for `Order Customer`, `First name`, and `Unique order count`. Avoid fixed one-second waits and do not export the helper.
3. Add one test for the active Explore Results case. Use the existing admin storage state, navigate to `/projects/${SEED_PROJECT.project_uuid}/tables`, wait for the page spinner to detach, choose `Orders`, select the same three fields from the tree, click the role-named Run query button, and wait for both loading labels to disappear.
4. Scope the unlabeled `export-csv-button` to the Results card instead of globally counting buttons. Open its popover and require the role-named Download button to be visible and enabled.
5. Before clicking Download, arm (a) a response promise restricted to `POST /api/v2/projects/${SEED_PROJECT.project_uuid}/query/*/schedule-download` and (b) `page.waitForEvent('download')`, both under a 60-second operation budget. Click once; assert schedule status 200 and a non-empty `results.jobId`. Let the application perform its own exact-job polling.
6. Await the browser download, assert the suggested filename ends in `.csv`, save it under Playwright’s test output path, and assert the file is non-empty. This proves the completed response’s `fileUrl` was consumed, not merely returned. Use a 90-second test timeout; no `url:changed` workaround or manual scheduler polling.
7. Do not add Playwright `test.skip` copies of the dashboard or Table-chart cases. Record their migration disposition as removal; if dashboard-menu or Table-chart-specific UI coverage is requested later, add focused tests separately rather than sharing this file’s local helper prematurely.
8. Leave Cypress cleanup/source removal and migration-manifest changes to the orchestrating migration phase; this target plan itself touches only the new Playwright spec.

## Verification plan

Run with the normal development stack already up, including backend, seeded warehouse, scheduler worker, and S3/MinIO. Do not seed or migrate as part of test execution.

```bash
pnpm -F e2e exec playwright test playwright/app/downloadCsv.spec.ts --project=firefox
pnpm -F e2e typecheck:playwright
pnpm -F e2e exec eslint -c .eslintrc.js --ignore-path ./../../.gitignore playwright/app/downloadCsv.spec.ts
pnpm -F e2e exec oxfmt --ignore-path ./../../.gitignore playwright/app/downloadCsv.spec.ts --check
```

For dual-run confidence after the isolated Playwright test passes:

```bash
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/downloadCsv.cy.ts
pnpm -F e2e exec playwright test playwright/app/downloadCsv.spec.ts --project=firefox
```

Expected results are one active passing test in each runner, two Cypress skips, a schedule response with generated `jobId`, and a non-empty `.csv` download in Playwright.

## Open questions

- The `todo: remove` comments provide no case-specific rationale beyond commit `d5a8253a5b2`’s broad removal-or-unit-test campaign. Confirm with the migration owner only if dashboard menu coverage or Table-chart export presentation is considered independently valuable; current evidence supports removal.
- Should migration parity require only scheduler completion, or the stronger actual-byte assertion proposed here? The source does not prove a file downloads, so actual download is recommended.
- If a shared preview exposes raw presigned URLs whose hostname is not reachable from Firefox, that is an environment/S3 public-endpoint defect, not a reason to fall back to asserting only `fileUrl`.

## Port history

Not started.
