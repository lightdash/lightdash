# packages/e2e/cypress/e2e/app/dates.cy.ts

## Classification

Recommended runner: Playwright for the sole active UI/timezone test; unit tests or removal/clarification for the nine skipped tests.
Execution lane: Firefox, serial, dedicated client-timezone matrix against the shared preview.
Active tests: 1
Skipped tests: 9 (all explicit `it.skip`; the parent `describe` is active at `packages/e2e/cypress/e2e/app/dates.cy.ts:31-37`).
Persistent mutation: No saved Lightdash content. Query execution can create query-history/cache state, but uses unique query UUIDs and does not mutate the seed project.
Shared-preview dual-run safe: Yes. The test only reads seed metadata and executes an isolated metric query; Cypress and Playwright have no shared names or cleanup targets.
Difficulty total: 8/18 (persistent/shared state 0, browser interaction 2, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 1, cross-file infrastructure 1).
Coordination keys: `playwright-dates-spec`, `playwright-timezone-ci`.
Analysis status: coordination-required

The active test genuinely needs a browser because it checks three different rendered representations of one timestamp—UTC filter text, server-formatted result data, and client-local filter text—before checking rendered SQL (`packages/e2e/cypress/e2e/app/dates.cy.ts:156-193`). The port itself is local, but preserving its current four-timezone coverage requires CI-lane ownership: the Cypress workflow has a dedicated non-UTC matrix (`.github/workflows/pr.yml:596-635`) while Playwright smoke currently receives only `PLAYWRIGHT_BASE_URL` (`.github/workflows/pr.yml:491-524`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
| --- | --- | --- | --- | --- | --- |
| `Check current timezone` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:36-79`) | Compares the browser/Node offset, formatted GMT offset, and Day.js conversion for UTC, Madrid, New York, and Tokyo. | None. | `Cypress.env('TZ')`, process timezone, fixed winter date, exhaustive runtime switch. | Remove. The source explicitly says `todo: delete` at line 36; this validates the harness rather than product behavior. If harness validation is still wanted, make it a small Playwright config/setup test, not an app test. |
| `Should get right month on filtered chart` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:81-105`) | Opens the seeded saved chart `How many orders did we get in June?`, checks June result cells and generated month-filter SQL. | No content save; compile request only. | Seeded chart/data, broad table-cell text, `compileQuery` alias. | Unit/API split, not Playwright: month filter compilation in `packages/common/src/compiler/filtersCompiler.test.ts`; retain seeded result-value coverage only if needed in `packages/api-tests`. The source explicitly marks it for a unit test at line 81. |
| `Should use dashboard month filter` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:107-154`) | Opens seeded `Jaffle dashboard`, applies June 2024 as a temporary dashboard filter, and expects one tile value to change from `1,961.5` to `468`. | Temporary dashboard view state only; no save action. | React Grid Layout scoping, two dialogs with `.eq(1)`, seeded dashboard/chart names, async tile reruns. | Frontend dashboard-filter component/integration unit test, primarily `packages/frontend/src/features/dashboardFilters/FilterConfiguration/index.test.tsx`; use Playwright only if the product team explicitly wants full tile rerun coverage. Source says unit test at line 107. |
| `Should use UTC dates` | Active (`packages/e2e/cypress/e2e/app/dates.cy.ts:156-198`) | Loads an `events` explore from URL state with a `+02:00` equality filter, runs it, and verifies UTC filter display, UTC result display, timezone-dependent local display, and UTC SQL literal. | Executes a metric query and may create query history/cache; no saved chart/filter/content. | Opaque encoded JSON URL, client/server timezone split, four-way env switch, async query/chart, exact timestamp and SQL formatting. | `packages/e2e/playwright/app/dates.spec.ts`, one Playwright test run under each supported timezone. Do not port the commented SVG-tooltip TODO at lines 195-197. |
| `Should filter by date on results table` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:200-272`) | Runs an orders query, invokes cell context actions for year/month/week/day, checks picker values and corresponding SQL. | Query history/cache and transient explore filters only. | Positional table CSS, context menus, four compile waits; the day assertion expects the week input to remain `June 9, 2025` even after selecting June 15 (`lines 260-270`). | Frontend results-cell/filter unit tests plus compiler unit cases, not a direct Playwright port. Clarify the suspicious day-input expectation first. Source says unit test at line 200. |
| `Should filter by datetimes on results table` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:274-365`) | Applies raw/millisecond/second/minute/hour result-cell filters and checks local picker values and SQL. | Query history/cache and transient filters only. | Server/client timezone dependence, positional CSS, repeated compile requests, known millisecond limitation, and an explicit broken-cell-selection FIXME (`lines 305-319`). | Clarification first, then frontend unit tests for cell-to-filter values and common compiler tests. Do not port a known-broken sequence. Source says unit test at line 274. |
| `Should change dates on filters` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:367-447`) | Adds year and month filters, changes picker values, checks compiled SQL, and deletes each transient filter. | Transient explore filter/query compilation only. | Defaults depend on the current date; picker popovers; repeated requests from default and selected values. | Frontend date-filter component unit tests, extending the existing date-input test area under `packages/frontend/src/components/common/Filters/FilterInputs/`; compiler assertions belong in common. Source says unit test at line 367. |
| `Should keep value when changing date operator` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:449-515`) | Adds today's day filter, changes `is` to `is not`, and verifies both the preserved input and changed SQL operator. | Query history/cache and transient filter only. | Current date/local date boundary, combobox internals, compile waits. | Frontend filter component unit test for value preservation; compiler test for `!=`. Source says unit test at line 449. |
| `Should filter by date on dimension` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:517-627`) | Uses dimension-tree menus to add current year/month/week/day filters and checks SQL. | Query history/cache and transient filters only. | Current date, Sunday-based local week calculation, tree test IDs/menu items, two consecutive initial compile waits at lines 547-550. | Frontend dimension-menu/filter unit tests plus common compiler cases. Source says unit test at line 517. |
| `Should filter by datetime on dimension` | Skipped (`packages/e2e/cypress/e2e/app/dates.cy.ts:629-720`) | Adds raw through hour datetime filters from the dimension tree and checks current input/Monaco SQL. | Compile/query state and transient filters only. | One-second race allowance, direct Monaco global access, untyped callback values, and obsolete-looking Blueprint `.bp4-*` selectors (`lines 640-719`). | Remove or rewrite as focused frontend units after product-owner clarification; do not port the stale selector flow to Playwright. |

The nine newly annotated skips were introduced together by commit `d5a8253a5b` (`test: skip and mark e2e tests for removal or migration to unit tests (#18665)`); the repository evidence is the explicit delete/unit comments at `packages/e2e/cypress/e2e/app/dates.cy.ts:36,81,107,200,274,367,449,517`. The final datetime-dimension test is skipped without a rationale at line 629 and therefore needs clarification rather than an assumed port.

## Cypress command expansion

- `cy.login()` is the only project custom command exercised by the active test. The suite calls it in `beforeEach` (`packages/e2e/cypress/e2e/app/dates.cy.ts:31-34`). It creates/reuses a Cypress session keyed by the seeded organization-admin email, POSTs seeded credentials to `api/v1/login`, requires status 200, and validates reuse with `GET api/v1/user` status 200 (`packages/e2e/cypress/support/commands.ts:152-172`). The Playwright repository already has the equivalent setup: POST `/api/v1/login`, GET `/api/v1/user`, and write request storage state (`packages/e2e/playwright/auth.setup.ts:10-23`), consumed by the Firefox project (`packages/e2e/playwright.config.ts:28-40`). Use that existing storage state; add no dates-specific auth helper.
- `cy.getMonacoEditorText()` occurs only in the skipped datetime-dimension test (`packages/e2e/cypress/e2e/app/dates.cy.ts:640-656`). It sleeps 200 ms, requires `.monaco-editor`, reads `window.monaco.editor.getModels()[0].getValue()`, and normalizes whitespace (`packages/e2e/cypress/support/commands.ts:751-765`). If that test is ever revived, prefer a user-visible SQL-region assertion or a component-level model test; do not create shared Playwright Monaco infrastructure for this sole stale use.
- `findByText`, `findAllByText`, `findByTestId`, `findByRole`, and related commands come from `@testing-library/cypress/add-commands` (`packages/e2e/cypress/support/commands.ts:46`). They map to Playwright locators directly and are not project helpers.
- `cy.intercept`, `cy.wait`, `cy.visit`, `cy.contains`, and `cy.session` are Cypress built-ins. Only skipped tests alias `**/compileQuery`; the active test does not wait on a request.
- The support layer globally suppresses uncaught exceptions according to a broad regular expression (`packages/e2e/cypress/support/commands.ts:128-141`). Playwright will not inherit this. Do not add a blanket page-error suppression; any active-test page error should fail and be investigated.

## State, seed, and environment assumptions

- All tests inherit admin authentication from `beforeEach` (`packages/e2e/cypress/e2e/app/dates.cy.ts:31-34`). This is organization admin, not editor/viewer; the command uses `SEED_ORG_1_ADMIN_EMAIL` and password (`packages/e2e/cypress/support/commands.ts:152-162`). The active behavior requires explore/query access but does not test authorization boundaries.
- Every app route targets `SEED_PROJECT.project_uuid`. Its fixed UUID is `3675b69e-8324-4110-bdca-059031aa8da3`, name `Jaffle shop` (`packages/common/src/index.ts:550-558`). The active test additionally assumes an `events` explore with `events_timestamp_tz_raw` and `events_count`, plus a row at `2020-08-11 22:58:00 UTC` (`packages/e2e/cypress/e2e/app/dates.cy.ts:157-169`).
- Active URL state contains hard-coded filter-group UUIDs, an equality value `2020-08-12T00:58:00+02:00`, descending timestamp sort, limit 500, and cartesian config (`packages/e2e/cypress/e2e/app/dates.cy.ts:157-160`). It is browser URL state, not a saved-chart mutation. The frontend parses `create_saved_chart_version` from search params (`packages/frontend/src/hooks/useExplorerRoute.ts:162-177`).
- Running the query calls the v2 metric-query endpoint (`POST /api/v2/projects/{projectUuid}/query/metric-query`) and polls by query UUID (`packages/frontend/src/hooks/useQueryResults.ts:81-92,202-223,276-297`). This can leave query-history/cache records, but unique query UUIDs prevent Cypress/Playwright collision. There are no created names, so duplicate-name risk is absent.
- The active test requires two aligned client settings: the browser timezone and the expected timezone key used by the switch (`packages/e2e/cypress/e2e/app/dates.cy.ts:171-190`). Cypress CI supplies both `TZ` and `CYPRESS_TZ` (`.github/workflows/pr.yml:633-635`); Cypress maps the latter to `Cypress.env('TZ')`. Playwright should use one validated environment variable and set the BrowserContext `timezoneId` locally in the spec so browser emulation is explicit.
- Supported expectations are exactly `UTC`, `Europe/Madrid`, `America/New_York`, and `Asia/Tokyo` (`packages/e2e/cypress/e2e/app/dates.cy.ts:173-189`). Unknown or absent values intentionally error. Current dedicated Cypress matrix covers only the three non-UTC zones (`.github/workflows/pr.yml:604-608`); the ordinary Cypress lane supplies UTC (`.github/workflows/pr.yml:570-586`).
- The result assertion explicitly assumes server-formatted UTC (`packages/e2e/cypress/e2e/app/dates.cy.ts:169`). Changing only the Playwright browser context must not imply changing the remote preview server timezone.
- Skipped tests additionally assume seeded saved chart `How many orders did we get in June?`, dashboard `Jaffle dashboard`, chart titles, and orders/customers data values (`packages/e2e/cypress/e2e/app/dates.cy.ts:84-103,109-152`). They create none of those fixtures and have no cleanup, so they depend on seeding outside this spec.
- No uploads, downloads, popups/windows, iframes, clipboard, drag-and-drop, external SaaS, or browser permission APIs are used. The only chart mechanic is waiting for rendered loading state; the commented SVG hover is not a test (`packages/e2e/cypress/e2e/app/dates.cy.ts:195-197`).

## Synchronization and timeout requirements

- Cypress globally allows 10 seconds per command and two run-mode retries by default (`packages/e2e/cypress.config.ts:12-21`). Playwright has 10-second assertion/action timeouts, 30-second navigation, CI retries, and one worker (`packages/e2e/playwright.config.ts:4-13,20-26`). No source test overrides a timeout.
- The active test clicks Run query and then waits only for `Loading chart` to have count zero (`packages/e2e/cypress/e2e/app/dates.cy.ts:161-163`). That can pass before a spinner appears. The Playwright test should start a response waiter for the metric-query POST before clicking, require an OK response, then wait for the loading indicator to disappear and assert the result timestamp. Do not use a fixed sleep.
- Opening Filters and SQL cards is synchronous only at the click level (`packages/e2e/cypress/e2e/app/dates.cy.ts:165-167,192-193`). Follow each click with a scoped visible-content assertion rather than relying on click completion.
- Compilation itself is a POST after frontend date conversion (`packages/frontend/src/hooks/useCompiledSql.ts:34-54`). The active test does not intercept it, so the rendered SQL assertion is the final readiness signal. If a request waiter is needed, use a predicate that matches the `events` compile endpoint rather than a broad `**/compileQuery` alias that could catch an initial/background compile.
- The skipped tests expose known flake patterns that should not be copied: positional cells (`packages/e2e/cypress/e2e/app/dates.cy.ts:219-264,291-355`), current-time defaults (`lines 388-443,452-511,520-623`), duplicate compile waits (`lines 547-550`), a one-second race window (`lines 640-649`), and fixed `cy.wait(200)` inside the Monaco helper (`packages/e2e/cypress/support/commands.ts:751-752`).

## Locator and strictness risks

- Replace `cy.get('button').contains('Run query')` (`packages/e2e/cypress/e2e/app/dates.cy.ts:161`) with exact role/name lookup and assert one match. The chained Cypress form can select descendants or multiple buttons.
- `cy.contains('SQL')` at line 162 is only a vague readiness probe. Remove it or scope it to the SQL accordion button/region; it can collide with navigation, panel headings, and rendered SQL.
- `findAllByText('Loading chart').should('have.length', 0)` at line 163 is intentionally global. In Playwright, use exact text and pair absence with the query response/result assertion. The text comes from the standard loading component (`packages/frontend/src/components/common/LoadingChart.tsx:18-27`).
- Scope `1 active filter` and `11 Aug 2020 22:58:00` to the Filters card (`packages/e2e/cypress/e2e/app/dates.cy.ts:165-167`), the server timestamp to the results table (`line 169`), the local timestamp to the filter/input representation (`lines 171-190`), and the SQL literal to the SQL card/editor (`lines 192-193`). Page-wide `contains` calls can satisfy the wrong representation, especially in UTC where the local text and UTC clock value are identical.
- Prefer stable roles/test IDs over CSS internals. If skipped tests are later re-owned, do not carry over `.react-grid-layout`, `.react-grid-item`, positional `tbody > :nth-child(...)`, Mantine class names, `.bp4-*`, or `findAllByRole('dialog').eq(1)` (`packages/e2e/cypress/e2e/app/dates.cy.ts:116-152,219-265,291-357,629-719`).
- The long hand-encoded URL at lines 157-160 is hard to review and easy to corrupt. In the target spec, define the minimal typed object locally and pass `encodeURIComponent(JSON.stringify(...))`; do not introduce shared infrastructure for one URL.

## Nonstandard or surprising behavior

- One test intentionally checks three timezone domains: the incoming `+02:00` filter normalizes to UTC (`11 Aug 2020 22:58:00`), result data is server-formatted with `(+00:00)`, and another filter representation is client-local (`packages/e2e/cypress/e2e/app/dates.cy.ts:157-193`). Collapsing these to one assertion would lose the behavior under test.
- The dedicated timezone job runs Firefox in Madrid, New York, and Tokyo (`.github/workflows/pr.yml:604-635`), while UTC coverage comes from the normal Cypress job. A Playwright-only port that runs once in the default container would silently reduce coverage.
- The fixed SQL expectation includes `+00:00` (`packages/e2e/cypress/e2e/app/dates.cy.ts:192-193`). It is not equivalent to older expectations without an explicit offset.
- The source imports Day.js and defines local date helpers (`packages/e2e/cypress/e2e/app/dates.cy.ts:2-29`), but the active test uses none of them. They belong only to skipped tests and should not be copied into the active Playwright target.
- The skipped results-table date test appears internally inconsistent: after choosing day `2025-06-15`, it expects the date input still to equal `June 9, 2025` while SQL uses June 15 (`packages/e2e/cypress/e2e/app/dates.cy.ts:260-270`). Preserve neither behavior without clarification.
- The skipped datetime results test documents that selecting a different cell is not working and calls millisecond truncation a known limitation (`packages/e2e/cypress/e2e/app/dates.cy.ts:305-319`). The skipped dimension datetime flow still uses Blueprint 4 selectors (`lines 661-719`) while other flows use Mantine selectors, another sign that it is stale.

## Coordination requirements

1. Reserve `packages/e2e/playwright/app/dates.spec.ts` to avoid duplicate port work.
2. Coordinate `playwright-timezone-ci` before deleting the Cypress source. The current Playwright smoke job has no timezone matrix or explicit `TZ` (`.github/workflows/pr.yml:491-524`), while the Cypress source is directly selected by the dedicated timezone job (`.github/workflows/pr.yml:596-635`). Either convert that lane to Playwright or add an equivalent Playwright matrix; do not depend on container defaults.
3. No new shared helper is justified. Existing admin storage state already covers login (`packages/e2e/playwright/auth.setup.ts:10-23`), and the URL/timezone expectation logic is used by one target file only.
4. No seed lock or exclusive preview lease is required. Dual-run query execution uses unique query UUIDs and does not save content.
5. The nine skipped tests should be handled separately from the active migration. Their explicit destination is unit/removal for eight tests (`packages/e2e/cypress/e2e/app/dates.cy.ts:36,81,107,200,274,367,449,517`); the unannotated datetime-dimension skip needs an owner decision.

## Exact port plan

1. Create only `packages/e2e/playwright/app/dates.spec.ts` for the active behavior. Import `SEED_PROJECT`, Playwright `expect/test`, and no Day.js helpers.
2. Read and validate `process.env.TZ` against the four supported zones. Set `test.use({ timezoneId: timezone })` in this file and map each zone exhaustively to its expected local timestamp from `packages/e2e/cypress/e2e/app/dates.cy.ts:173-189`.
3. Build the minimal `create_saved_chart_version` object locally and encode it with `encodeURIComponent(JSON.stringify(...))`; retain the filter value, fields, sort, limit, and chart layout from lines 157-160.
4. Navigate to `/projects/${SEED_PROJECT.project_uuid}/tables/events?...` using the existing admin storage-state project (`packages/e2e/playwright.config.ts:28-40`). Do not add login code.
5. Register the metric-query response waiter, click the exact `Run query` button, require a successful response, wait for exact `Loading chart` text to disappear, and then assert the result timestamp in the results region.
6. Open and scope assertions to the Filters and SQL cards. Assert `1 active filter`, UTC filter display, zone-specific local display, server result display, and exact UTC-offset SQL. Do not port the commented tooltip lines 195-197.
7. Do not port skipped tests into this file. Create separate frontend/common/API follow-ups only after the recommendations and ambiguities in the inventory are accepted.
8. In a separately coordinated CI change, replace or mirror the Cypress timezone matrix with Playwright invocations for `UTC`, `Europe/Madrid`, `America/New_York`, and `Asia/Tokyo`. Keep Firefox and `--workers=1`, matching the existing Playwright project and source lane.
9. After all four timezone runs pass and CI coverage is live, the orchestrator may remove `packages/e2e/cypress/e2e/app/dates.cy.ts` in its own authorized migration change; this discovery task must not remove it.

## Verification plan

Targeted static checks after the port:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
```

Run the exact target once per supported client timezone against the same preview/server:

```bash
for timezone in UTC Europe/Madrid America/New_York Asia/Tokyo; do
  TZ="$timezone" PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" \
    pnpm -F e2e exec playwright test playwright/app/dates.spec.ts \
      --project=firefox --workers=1
done
```

Before Cypress deletion, compare the active legacy behavior in at least UTC and one offset zone (the existing CI matrix remains the authoritative full baseline):

```bash
TZ=UTC CYPRESS_TZ=UTC \
  pnpm -F e2e exec cypress run --browser firefox \
    --spec cypress/e2e/app/dates.cy.ts
```

If approved unit-test follow-ups are implemented, run only their package-specific targets while iterating, then package checks:

```bash
pnpm -F frontend test -- src/components/common/Filters/FilterInputs/DateFilterInputs.utils.test.ts src/components/common/Filters/FilterInputs/FilterDateTimePicker.utils.test.ts
pnpm -F common test -- src/compiler/filtersCompiler.test.ts
pnpm -F frontend typecheck:fast
pnpm -F common typecheck:fast
```

No install, migration, seed, browser run, or test command was executed during discovery.

## Open questions

1. Should Playwright retain all four zones in one explicit matrix, or should UTC remain covered by smoke and only the three non-UTC zones use the dedicated lane? The current split is implicit across two Cypress jobs (`.github/workflows/pr.yml:570-586,596-635`).
2. Is the preview server's UTC formatting a guaranteed environment contract? The test says the result depends on server timezone (`packages/e2e/cypress/e2e/app/dates.cy.ts:169`) but the dedicated job changes only its test container timezone, not the remote preview.
3. Should the eight `todo: move to unit test` cases be deleted immediately as already superseded, or are separate frontend/common/API coverage tickets required? Their comments establish direction but not exact acceptance criteria.
4. Is the results-table day input expected to preserve `June 9, 2025` after selecting `June 15, 2025` (`packages/e2e/cypress/e2e/app/dates.cy.ts:260-270`), or is that stale/incorrect?
5. Why is `Should filter by datetime on dimension` skipped without the December 2025 migration comment (`packages/e2e/cypress/e2e/app/dates.cy.ts:629`)? Its Blueprint selectors and race workaround suggest removal, but evidence does not establish intent.
6. Which stable regions/test IDs distinguish UTC filter text, local filter text, result text, and SQL in the current DOM? The Cypress source uses only page-wide text matching (`packages/e2e/cypress/e2e/app/dates.cy.ts:165-193`); the porter should inspect the live DOM rather than guess.

## Port history

Not started.
