# packages/e2e/cypress/e2e/app/dateZoom.cy.ts

## Classification

Recommended runner: Playwright
Execution lane: mutating-isolated
Active tests: 2
Skipped tests: 0
Persistent mutation: Yes — each test creates a saved chart and dashboard, then creates another dashboard version via PATCH; there is no cleanup.
Shared-preview dual-run safe: No — returned UUIDs prevent direct cross-wiring, but Cypress and Playwright would both leave fixed-name content in the shared seed project.
Difficulty total: 12/18 (persistent/shared state 3, browser interaction complexity 2, environment/external dependencies 2, synchronization/flakiness 3, authentication/authorization 1, cross-file infrastructure 1)
Coordination keys: e2e-mutating-isolation
Analysis status: coordination-required

Both tests need a rendered browser: they operate Mantine portal menus and verify that ECharts SVG bar counts change after date-zoom controls are used (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:111-184`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:190-267`). API-only coverage would not preserve that behavior.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `applies the Default date zoom picker to a chart` | Active; parent `describe` is not skipped (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:106-111`) | Creates a day-grained bar chart and dashboard, visits it, records the day bar count, selects Month/Week/Year/None, and verifies strict relative counts plus restoration to day (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:118-184`). | POST saved chart, POST dashboard, PATCH dashboard; fixed names `Date zoom default chart` and `zoom test`; no deletion (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:112-140`). | Mantine menu rendered in a portal, React Query refetches, ECharts SVG `path` counting, mutable closure counters, implicit Cypress retries. | `packages/e2e/playwright/app/dateZoom.spec.ts` |
| `applies a named control grain to its attached tile and supports runtime override` | Active; parent `describe` is not skipped (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:106`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:190`) | Persists a named Month control attached to one tile, verifies Month on load, overrides it to Week, then resets to the persisted Month count (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:215-267`). | POST saved chart, POST dashboard, PATCH dashboard/config; fixed names `Date zoom control chart`, `control zoom test`, and `Revenue zoom`; random control UUID; no deletion (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:191-235`). | Browser/global `crypto.randomUUID()`, Mantine portal menu, per-control URL state, asynchronous ECharts SVG replacement/counting. | `packages/e2e/playwright/app/dateZoom.spec.ts` |

There are no `it.skip`, `describe.skip`, pending tests, or skip comments. Both tests should be ported to Playwright; neither is a candidate for API tests, CLI/Node, unit-only coverage, removal, or skip clarification.

## Cypress command expansion

The only custom Cypress command invoked directly is `cy.login()` in the suite's `beforeEach` (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:107-109`). Its implementation:

1. Keys a `cy.session` by the seed admin email (`packages/e2e/cypress/support/commands.ts:152-155`).
2. On a cache miss, POSTs `api/v1/login` with `SEED_ORG_1_ADMIN_EMAIL.email` and `SEED_ORG_1_ADMIN_PASSWORD.password`, requiring status 200 (`packages/e2e/cypress/support/commands.ts:156-165`).
3. On session reuse, validates the cookie/session with GET `api/v1/user`, requiring status 200 (`packages/e2e/cypress/support/commands.ts:167-171`).
4. The credentials resolve to `demo@lightdash.com` / `demo_password!`, and the user is the organization admin (`packages/common/src/index.ts:465-481`).

No other custom command is used. `createDateChart`, `chartTile`, `visitDashboard`, and `expectBarCount` are local functions, not Cypress commands (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:18-104`). The Playwright project already provides equivalent admin authentication: setup POSTs `/api/v1/login`, validates `/api/v1/user`, and writes storage state (`packages/e2e/playwright/auth.setup.ts:10-23`); the Firefox project consumes that state (`packages/e2e/playwright.config.ts:28-40`). No new shared authentication helper is required.

## State, seed, and environment assumptions

- The tests require seed project `3675b69e-8324-4110-bdca-059031aa8da3` (`Jaffle shop`) (`packages/common/src/index.ts:550-558`). They assume its compiled `orders` explore contains `orders_order_date_day` and `orders_total_order_amount`; those IDs are embedded throughout the chart request (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:27-71`).
- The authenticated seed admin must be allowed to create charts and dashboards and update/delete them. The explicit create/update routes require authentication and reject unauthorized demo mutations (`packages/backend/src/routers/projectRouter.ts:154-183`, `packages/backend/src/controllers/projectController.ts:959-1002`, `packages/backend/src/routers/dashboardRouter.ts:51-66`).
- Explicit requests per test are:
  - POST `/api/v1/projects/{SEED_PROJECT}/saved`; the source checks 200 and assumes `body.results.uuid` is a string (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:18-78`). The backend returns `{status: 'ok', results}` (`packages/backend/src/routers/projectRouter.ts:179-188`).
  - POST `/api/v1/projects/{SEED_PROJECT}/dashboards`; the source does not check status and assumes `body.results.uuid` exists (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:119-130`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:196-207`). The controller contract is 201 Created (`packages/backend/src/controllers/projectController.ts:964-975`).
  - PATCH `/api/v1/dashboards/{dashboardUuid}`; the source neither checks status nor response shape (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:130-140`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:207-236`). The route returns `{status: 'ok', results}` after update (`packages/backend/src/routers/dashboardRouter.ts:51-67`).
- Page load additionally fetches the dashboard and chart (the current frontend uses v2 project-scoped GETs at `packages/frontend/src/hooks/dashboard/useDashboard.ts:37-43` and `packages/frontend/src/hooks/useSavedQuery.ts:89-98`), loads the `orders` explore (`packages/frontend/src/hooks/useExplore.tsx:7-16`), and executes POST `/api/v2/projects/{projectUuid}/query/dashboard-chart` (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:29-38`). This needs the backend, application database, compiled seed metadata, and working seed warehouse/query execution. No third-party service is logically required.
- Cypress uses `http://localhost:3000`, a 1920x1080 viewport, 10-second command timeout, and two run-mode retries by default (`packages/e2e/cypress.config.ts:13-26`). Playwright has the same default origin and viewport, 10-second action/expect timeout, 30-second navigation timeout, Firefox only, one worker, and CI-only retries (`packages/e2e/playwright.config.ts:4-13`, `packages/e2e/playwright.config.ts:20-40`). `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_RETRIES` are the only relevant Playwright environment overrides.
- Cypress globally blocks analytics/chat hosts (`packages/e2e/cypress.config.ts:27-33`), while the Playwright config has no equivalent. Default date-zoom selection calls analytics tracking before changing state (`packages/frontend/src/features/dateZoom/components/DateZoom.tsx:264-272`). The test must not depend on analytics delivery.
- No pre-existing localStorage/sessionStorage value is required. Default and per-control runtime selections are represented in URL query parameters (`dateZoom` and `dateZoom.<controlUuid>`) (`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:687-714`, `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:716-734`). Resetting a named control removes its runtime map entry and falls back to persisted `control.granularity` (`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:357-375`, `packages/common/src/utils/dateZoom.ts:274-278`).
- The dashboard config omits `dateZoomGranularities`; the provider therefore defaults to all non-sub-day standard granularities, including Day, Week, Month, Quarter, and Year (`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:303-316`).
- There are no aliases, fixtures, uploads, downloads, filesystem artifacts, or assumptions about a prior suite. Each test logs in and creates its own UUID-addressed entities. Test order is not semantically required.

### Persistent and concurrent state

Each active test leaves at least one saved chart, one dashboard, and the dashboard update/version records in the shared seed project. Fixed display names make repeated and dual runs accumulate duplicates (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:112-140`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:191-235`). The tests continue to operate on returned UUIDs, so concurrent runs are unlikely to attach to each other's entities, but the absence of cleanup makes shared-preview execution unacceptable for the migration's mutating lane. Query execution may also populate normal result caches/history.

The port should clean up in `finally`: delete the dashboard first through the authenticated dashboard DELETE route (`packages/backend/src/routers/dashboardRouter.ts:93-106`), then delete the saved chart (`packages/backend/src/routers/savedChartRouter.ts:79-94`). Use unique name suffixes as defense in depth; do not find resources by name.

## Synchronization and timeout requirements

- Every setup mutation is serialized through nested Cypress `.then` callbacks (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:118-140`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:195-236`). The Playwright port must `await` login/setup responses, parse UUIDs only after successful status checks, PATCH before navigation, and navigation before UI assertions.
- Initial readiness is defined by at least one matching bar path (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:145-152`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:245-250`), not merely dashboard/title visibility. The page waits for chart metadata, explore metadata, and the async dashboard-chart query before ECharts can render (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:284-344`).
- A grain change enters the React Query key (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:249-281`) and causes a new dashboard-chart request carrying `dateZoom` (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:300-330`). Do not assert immediately after a click and do not use fixed sleeps.
- Replace Cypress callback retrying in `expectBarCount` (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:101-104`) with `expect.poll(async () => scopedBars.count())` or an equivalent retried assertion. Poll the complete predicate, because a stale previous SVG count can be observed before the request/render transition completes.
- Preserve the sequence within test 1: capture Day; wait for Month `< Day`; capture stable Month; wait for Week `> Month && < Day`; wait for Year `> 0 && < Month`; wait for None `=== Day` (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:145-184`). Test 2 must capture persisted Month, wait for Week `> Month`, then wait for reset `=== Month` (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:241-267`). These comparisons are ordering dependencies inside each test, not cross-test dependencies.
- No custom per-command timeout, debounce, interception, or explicit network wait exists in the source. Start with the configured 10-second Playwright expect timeout; raise only the focused polling timeout if observed warehouse latency demonstrates a need. CI retries are already configured (`packages/e2e/playwright.config.ts:4-13`).

## Locator and strictness risks

- `cy.contains('Default zoom')`, `cy.contains(grain)`, and the named-control `cy.contains` calls are global substring searches (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:113-116`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:243-264`). Playwright strict mode may find both a trigger whose text includes the current grain and a portal menu item. Use role-based trigger locators and exact menu-item names: `getByRole('button', { name: /Default zoom/ })`, the exact named-control button, then `getByRole('menuitem', { name: grain, exact: true })`/`Reset to default`.
- Mantine menus use `withinPortal`, so menu items are outside the dashboard/tile subtree (`packages/frontend/src/features/dateZoom/components/DateZoom.tsx:290-364`, `packages/frontend/src/features/dateZoom/components/DateZoomControlPills.tsx:154-185`). Scope the trigger to the toolbar where possible, but locate the opened menu at page level.
- Dashboard and chart title assertions are also global substring queries (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:142-143`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:238-239`). Unique per-run names and role/link scoping avoid strict-mode collisions.
- `path[fill="#5470c6"]` is a presentation-level locator for the default blue series (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:5-6`). Scope it to the created chart tile/chart container so legends or other charts cannot contribute. The chart normally chooses SVG, but switches to canvas above 500 series×row data points (`packages/frontend/src/components/SimpleChart/index.tsx:86-91`, `packages/frontend/src/components/SimpleChart/index.tsx:276-294`); the test assumes this one-series seed result remains at or below that threshold.
- The fill color depends on the chart's default ECharts palette. A palette/theme change could break the locator without breaking date zoom. There is no source-level semantic bar locator; preserve the selector locally for parity rather than adding shared infrastructure solely for this file.

## Nonstandard or surprising behavior

- The dashboard tile's `uuid` is deliberately set to the saved chart UUID, while `savedChartUuid` is also that UUID (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:80-87`). Date-zoom `tileTargets` are keyed by tile UUID, so the named-control config also uses `[chartUuid]` (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:225-231`); the resolver looks up `config.tileTargets[tileUuid]` (`packages/common/src/utils/dateZoom.ts:288-310`). A port that introduces a distinct tile UUID must key `tileTargets` by that new tile UUID, not by the chart UUID.
- `None` is not a granularity. It sets global date zoom to `undefined`, restoring the chart's native day grain (`packages/frontend/src/features/dateZoom/components/DateZoom.tsx:439-476`).
- The named control's Month is persisted in dashboard config, but viewer overrides are runtime-only. Its pill displays `control.name · activeGranularity` (`packages/frontend/src/features/dateZoom/components/DateZoomControlPills.tsx:163-183`), and `Reset to default` sets the override to `undefined` (`packages/frontend/src/features/dateZoom/components/DateZoomControlPills.tsx:243-254`). The UI interactions do not PATCH the dashboard.
- The source uses mutable `let` counters because Cypress builds a command queue and evaluates callback assertions later (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:145-183`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:245-266`). Straight `await` code should use immutable captured counts instead.
- `crypto.randomUUID()` is called in test code (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:192`). In the Playwright Node test, prefer `randomUUID` from `node:crypto` so the UUID source is explicit and does not depend on a page/browser global.
- Chart creation alone checks its status; dashboard create/PATCH silently rely on Cypress's default non-2xx failure behavior and unvalidated JSON shapes (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:75-77`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:128-140`). The port should explicitly check all responses and validate the UUID-bearing result before use.
- There are no popups, iframes, clipboard operations, Monaco, virtualization, drag-and-drop, file transfer, custom browser permissions, or explicit timezone manipulation. The only special rendering/browser mechanics are Mantine portals, URL replacement, `crypto.randomUUID`, and ECharts SVG paths.

## Coordination requirements

- **Required key: `e2e-mutating-isolation`.** Do not run this port against a shared preview concurrently with Cypress until the coordinator provides a dedicated database/preview or an approved serialization contract. The source's persistent fixed-name mutations are documented above.
- The isolation contract must allow authenticated API setup, normal warehouse query execution, and cleanup DELETEs. Cleanup should be best-effort in `finally` and must target only UUIDs created by the current test.
- No new shared Playwright helper, page object, auth fixture, selector utility, or config change is justified. Existing admin storage state is sufficient (`packages/e2e/playwright/auth.setup.ts:10-23`); chart/dashboard factories and bar-count polling are used only by this target file and should remain file-local.
- Analytics blocking is a migration-wide question, but this file alone should not introduce shared routing infrastructure. If telemetry causes focused-test failures, add a local route abort only after identifying the actual request; otherwise leave it alone.

## Exact port plan

1. Create only `packages/e2e/playwright/app/dateZoom.spec.ts`; keep the two original test titles and use the existing admin-authenticated Firefox project.
2. Import `SEED_PROJECT` and `randomUUID` from `node:crypto`. Define file-local constants for `/api/v1`, the blue-bar selector, empty filters, and the chart request payload equivalent to `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:18-73`.
3. Add file-local API helpers that use Playwright's authenticated `request` fixture to:
   - create a uniquely named saved chart, require HTTP 200, and return a validated UUID;
   - create a uniquely named dashboard, require HTTP 201, and return a validated UUID;
   - PATCH the tile/config, require HTTP 200;
   - cleanup dashboard then chart by UUID.
   Keep response-shape checks at the JSON boundary; do not use unsafe assertions.
4. Preserve tile identity exactly (tile UUID equals chart UUID), or explicitly create a separate tile UUID and use that same value as the `dateZoomConfig.tileTargets` key. Never confuse the target key with `savedChartUuid`.
5. For the Default test, navigate to `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`, verify unique dashboard/chart titles, scope the ECharts paths to the chart tile, and capture a positive Day count. Open the Default zoom button and select exact Month, Week, Year, and None menu items in sequence. Use retried/polled compound count predicates after each click.
6. For the named-control test, persist the random control with Month and the tile target, navigate, assert the exact control button includes `Revenue zoom` and `Month`, capture a positive Month count, select Week, poll for a larger count, select Reset to default, and poll for the original Month count.
7. Wrap each test's resources in `try/finally`; delete dashboard first and chart second even after assertion failure. Use per-run suffixes in chart/dashboard names so the UI title assertions remain strict and stale fixed-name content cannot collide.
8. Keep helpers and selectors local to this file. Do not modify Playwright config, auth setup, application code, Cypress, manifests, or shared fixtures for this port.

## Verification plan

Run only after `e2e-mutating-isolation` is available:

```bash
# Focused Playwright behavior
pnpm -F e2e playwright:run -- app/dateZoom.spec.ts

# Type and touched-file quality checks
pnpm -F e2e typecheck:playwright
pnpm -F e2e run linter ./playwright/app/dateZoom.spec.ts
pnpm -F e2e run formatter ./playwright/app/dateZoom.spec.ts --check

# Cypress remains authoritative during dual-run; run serially in the same isolated environment
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/dateZoom.cy.ts

# Full Playwright regression, still against isolated disposable state
pnpm -F e2e playwright:run
```

The package scripts backing these commands are defined at `packages/e2e/package.json:7-20`. Focused verification must confirm both tests pass in Firefox, cleanup removes only the current run's dashboard/chart UUIDs, and no fixed sleep is introduced.

## Open questions

1. Does the isolation coordinator provide a disposable database/preview, or only serialization? This must be resolved under `e2e-mutating-isolation` before port execution.
2. What seeded warehouse date span is contractually guaranteed? The source assumes strict `Day > Week > Month > Year` cardinality but only documents that counts depend on seed rows (`packages/e2e/cypress/e2e/app/dateZoom.cy.ts:99-100`, `packages/e2e/cypress/e2e/app/dateZoom.cy.ts:154-176`). If that distribution is not a supported seed contract, clarify the intended stable assertion rather than guessing.
3. Is the default `#5470c6` ECharts fill guaranteed in the Playwright Firefox project? If not, the application needs a stable chart-series test hook owned outside this one-file port; do not silently weaken the behavioral assertion.
4. Will date-zoom telemetry attempt a real blocked-host request under Playwright? Cypress blocks analytics globally (`packages/e2e/cypress.config.ts:27-33`) but current Playwright configuration does not (`packages/e2e/playwright.config.ts:20-27`). Confirm from a focused trace before adding any local route handling.

## Port history

Not started.

### 2026-07-20 — Static port ready for execution lease

- Target: `packages/e2e/playwright/app/dateZoom.spec.ts`.
- Behavior ported: both active browser contracts. The `@mutating` suite creates run-unique chart/dashboard/control names through the authenticated request fixture, preserves chart UUID = tile UUID and keys the named control target by that tile UUID, polls the scoped ECharts SVG bar count for Default Month/Week/Year/None ordering and named Month/Week/reset behavior, and cleans up dashboard then chart by exact UUID in `finally`.
- Skipped decisions: none; the source has no skipped tests, and both active tests were ported. Cypress remains unchanged.
- Cleanup contract: each DELETE must return 200, then an authenticated GET by the same dashboard/chart UUID must return 404 (inactive). Nested `finally` cleanup still attempts chart deletion if dashboard deletion or its verification fails.
- Static evidence:
  - `pnpm -F e2e typecheck:playwright` — passed.
  - `pnpm -F e2e run linter ./playwright/app/dateZoom.spec.ts` — passed.
  - `pnpm -F e2e run formatter ./playwright/app/dateZoom.spec.ts --check` — initially found formatting differences; `pnpm -F e2e run formatter ./playwright/app/dateZoom.spec.ts` formatted only the target, and the repeated check passed.
  - `git diff --check` plus an ownership/status check — passed before this history append with only the target spec untracked; final two-file ownership/diff checks are run immediately after the append.
- Execution deliberately not run: no Playwright browser test, Cypress test, full destination suite, test discovery, or direct API mutation was executed because the sole mutation execution lease has not been granted.
- Remaining risks for leased execution: seeded date cardinality must still satisfy strict `Day > Week > Month > Year`; Firefox must retain the default `#5470c6` SVG bar rendering; warehouse/query latency must fit the existing 10-second expect timeout; telemetry behavior remains unobserved; and cleanup 200/404 behavior is statically encoded but not yet exercised. A successful create whose response omits/corrupts its UUID cannot be cleaned because strict unknown parsing intentionally refuses an unusable identifier.
- Commit: `<pending>`; nothing staged or committed.
- Final diff evidence: `git diff --check`, the untracked-target whitespace check, and exact ownership/status assertions passed; status contains only this modified finding and the untracked target spec.

### 2026-07-20 — Mutation lease execution verified

- Lease: the sole mutation execution lease was explicitly granted. Commands used direct `pnpm --filter e2e exec ...`; Cypress and Playwright ran sequentially.
- Runtime root fixes from focused evidence:
  - The first focused run proved the chart-title UUID link was present but the minimal-dashboard-only wrapper excluded the normal dashboard grid. Bar scoping now starts from that exact title/UUID anchor and selects its nearest class-token-exact `react-grid-item` ancestor.
  - The next run reached Week in both tests but exposed ECharts SVG replacement between the successful poll and a fresh count. A diagnostic run observed Default `Day=111`, `Month=25`, and named `Week=47`, preserving `111 > 47 > 25`; failures were `Month (day=111): observed 0, 25, captured 0` and `Named Week (month=25): observed 0, 47, captured 0`.
  - `waitForBarCount` now requires two consecutive equal counts satisfying the complete predicate, stores that stable count inside `expect.poll`, and returns it after an explicit null check without a fresh post-poll count. Failure labels retain the relevant captured comparison counts.
- Selection: `pnpm --filter e2e exec playwright test app/dateZoom.spec.ts --project=firefox --list` listed setup plus exactly the two active Date zoom tests (3 total).
- Playwright execution gates:
  - Focused: `pnpm --filter e2e exec playwright test app/dateZoom.spec.ts --project=firefox` — 3/3 passed in 14.2s.
  - Repetition: `pnpm --filter e2e exec playwright test app/dateZoom.spec.ts --project=firefox --repeat-each=3` — 7/7 passed in 37.6s (setup plus both tests three times).
  - Explicit lane: `pnpm --filter e2e exec playwright test --project=firefox --grep @mutating` — 3/3 passed in 13.4s.
  - Full destination suite: `pnpm --filter e2e exec playwright test --project=firefox` — 8/8 passed in 42.7s.
- Exact Playwright resource audit (dashboard UUIDs first, then chart UUIDs):
  - Initial locator failure — dashboards `6500f4eb-e649-4a42-9b13-40378e2b533f`, `e7c5fb2d-2ba2-4175-adba-4086c30a9405`; charts `a1cfa299-73a4-4591-9837-5d77d607c317`, `f0110ceb-37ca-46ed-b752-aaefc2392236`.
  - Post-locator transient failure — dashboards `9e8d4c23-fbbf-47fd-9cd9-c4189af502c1`, `d2f21e5d-e33e-40f7-9732-debd57303912`; charts `ca0f1baa-6b30-47b3-a8db-a96cd13c3504`, `41aec452-47d9-4652-9fec-4249de45f2bd`.
  - Count diagnostic — dashboards `ce35d567-ed87-471d-8356-10377e5ae338`, `f9b96ef5-d173-48e1-8fa4-da46146163ad`; charts `52d499f1-450a-4197-b57c-9709c1c15672`, `0cae510a-c4df-4e1c-ae93-b2b1c6224a40`.
  - Green focused — dashboards `ebb3dac7-dabb-4a97-9e95-0f578209dadd`, `8b582ca3-7c06-42de-a42b-7d0f93517c93`; charts `9570c324-41b5-4e49-9c69-4670514cfdc3`, `4f5cf5e6-6103-4d3f-b9fc-86a248659d25`.
  - Repeat-each=3 — dashboards `58c7c82f-71ac-4a0e-9561-ae73fcc5e62a`, `4c668185-da8e-4c5d-8e20-b374118879e1`, `0f05a11e-51f6-428c-885a-7f3a474f7475`, `1c52d108-e5b0-46e7-b540-54af5aa17f5c`, `8c571f0e-c8bd-4290-863c-5c8830858d34`, `9d898451-47eb-422b-8ad7-4d13b0641b29`; charts `cfd984b8-a461-4905-917b-ab5b24489999`, `cd7ce3e2-555e-4c7d-ac18-51127b455508`, `7e3299e1-d0cf-4af5-b982-10433d49fa04`, `9ac60e1b-c086-4033-bd4b-2c6996e652ad`, `08ac20e2-3a0c-486b-a3ca-e3edb2c18bfe`, `7ee7a698-da84-40ab-8e7c-2fe1e47c0bb7`.
  - Explicit `@mutating` lane — dashboards `8ad038ea-0dcc-44c7-b58f-597459e2b3d2`, `4fc6e7b5-4092-4ccf-8850-e5eaf37ff044`; charts `b0ecc42a-221b-474e-b113-1a76c8d349a9`, `04ec1124-3066-4c86-b8be-4a11d321e081`.
  - Full Playwright suite — dashboards `b47418b3-5f59-4a03-bc23-2f04235b46d4`, `2a55790a-b0e0-4e40-8b75-e65c47a697e1`; charts `6112c30e-514f-48bb-bbf2-ecdaa8e4273b`, `e7ddad0a-9213-4c4d-8999-15ae9312dc45`.
  - For every UUID above, the DB row had `deleted_at` set, authenticated GET by exact UUID returned 404 in dashboard-then-chart order, and its gate had zero active run-unique names. Final expected Playwright soft-delete totals are 18 dashboard and 18 chart tombstones; these are inactive audit records, not leaked active content.
- Unchanged Cypress parity and delta cleanup:
  - Immediately before Cypress, complete baseline sets contained 35 dashboard UUIDs and 117 chart UUIDs.
  - `pnpm --filter e2e exec cypress run --spec cypress/e2e/app/dateZoom.cy.ts` — unchanged legacy source passed 2/2 in 10s (Electron, no retries used).
  - Exact post-run set difference contained only dashboards `b8b6d487-b88c-4722-9556-90aad415d6b9` (`zoom test`) and `ce0e2199-8c8b-4e2a-adc0-28b36ee56969` (`control zoom test`), then charts `12b9c3d1-ac53-4116-81af-006931f710e1` (`Date zoom control chart`) and `bd7d5f7d-1314-4c64-bdc5-8432c3fb6d03` (`Date zoom default chart`).
  - Only those four delta UUIDs were cleaned through the authenticated API, dashboards first then charts. Every DELETE returned 200 and immediate exact-UUID GET returned 404. DB verification shows `deleted_at` on all four and zero active delta/fixed-name leftovers.
  - All 35 baseline dashboards and 117 baseline charts remain present; final sets equal baseline plus the two expected dashboard and two expected chart soft-delete tombstones. No baseline UUID was deleted or altered by cleanup.
- Runtime invariants:
  - Before/after fingerprints matched exactly: users `4|cb13d257f0a703561fd879b04a07dc8c`; projects `1|c4f9de6a5ee614c2970ea72f6b51c5f6`; personal access tokens `1|6e66f2dc91bf68ad45b9a00edf353061`; embedding config `1|831603ca0d60026e82e4663dfa7f052a`.
  - `/api/v1/health` returned 200 before and after execution.
  - Source/fixture hashes remained unchanged across legacy execution: Cypress source `50e08aba8c6e04f46e0c2391edcea23a99dfbd4552512059b1f00d0239899a8b`; Cypress commands `9fdf1af6eecd92dee6863780240ba49121c4f3bfa6fcbeebaa6e93b536071c4e`; Cypress config `8ce937d7b27c763fc6087e57686071cd9911164dd3ec0f50f4136a662f19afb6`; final Playwright target `7e095436e18837cff3dcf7570d5d8888bd9d66225b1de2cca9edaae5b9cc615b`; auth setup `ec824636434ddc8042fcabe9dfd968b57e9864a42583feaa845ffd35c6bd67f3`; Playwright config `439269ba5daf2ec00ddb6c65826b4d4fad3635bd529bd73a74c6be96743d0aca`.
  - Process audit found no residual Cypress, Electron, Firefox, or Playwright process associated with this worktree.
- Final static evidence using direct executables:
  - `pnpm --filter e2e exec tsc --project tsconfig.playwright.json --noEmit` — passed.
  - `pnpm --filter e2e exec eslint -c .eslintrc.js --ignore-path ./../../.gitignore ./playwright/app/dateZoom.spec.ts` — passed.
  - `pnpm --filter e2e exec oxfmt --ignore-path ./../../.gitignore ./playwright/app/dateZoom.spec.ts --check` — passed.
  - `git diff --check` — passed; ownership remained exactly this finding plus the target spec.
- Remaining risk: soft-delete mode intentionally retains the 20 run-owned dashboard and 20 run-owned chart tombstones documented above; every one is inactive, and all active-name/UUID checks are clean. No live behavioral blocker remains.
- Commit: `<pending>`; nothing staged, committed, or pushed.
