# packages/e2e/cypress/e2e/app/embed.cy.ts

## Classification

- Recommended runner: Playwright for the 3 active browser tests; frontend unit-test/clarification triage for the 4 skipped tests.
- Execution lane: `mutating-isolated`
- Active tests: 3
- Skipped tests: 4
- Persistent mutation: Yes — every test body would replace the seed project's embedding allowlist through `PATCH /api/v1/embed/{projectUuid}/config` (`packages/e2e/cypress/e2e/app/embed.cy.ts:9-20`). There is no restore/cleanup hook.
- Shared-preview dual-run safe: Yes only for this Cypress/Playwright source pair if the port sends the identical dashboard/config payload; both writers are then idempotent. It is not safe alongside a test that needs a different embed config, and a teardown restore would itself race.
- Difficulty total: 13/18 — persistent/shared state 3, browser interaction complexity 2, environment/external dependencies 2, synchronization/flakiness 3, authentication/authorization 2, cross-file infrastructure 1.
- Coordination keys: `seed-project-embed-config`
- Analysis status: coordination-required

The active assertions need a rendered direct embed, hover/menu behavior, and inspection of requests initiated by the browser, so they belong in Playwright rather than API tests. The project-wide embedding row is the blocking coordination concern: the model updates all supplied dashboard/chart/app allowlist fields on one row selected only by project UUID (`packages/backend/src/ee/models/EmbedModel.ts:145-165`).

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `I can view embedded dashboard and all interactivity options` (`packages/e2e/cypress/e2e/app/embed.cy.ts:39-102`) | Active | Finds the seed Jaffle dashboard, allowlists it, mints a JWT with all filter/export/date-zoom options, logs out, opens the direct embed, checks seeded tile/filter text, hovers a chart, opens its menu, and checks export/date-zoom controls (`:40-98`). | Replaces the seed project's dashboard allowlist with one UUID, empties the chart allowlist, and disables allow-all flags (`:9-20`, `:44`). Query execution may also populate normal async-query caches. | JWT in URL hash; direct unauthenticated embed; asynchronous chart rendering; hover-only menu; SVG test id; chart/table content; no actual download/PDF is attempted despite export claims (`:54-57`, `:89-98`). | Playwright, isolated by embed-config coordination. |
| `forwards the ?timezone= session override into embed tile queries` (`packages/e2e/cypress/e2e/app/embed.cy.ts:104-136`) | Active | Adds `timezone=America/Los_Angeles` to the minted embed URL and verifies the first matching tile-query request body carries it (`:116-132`). | Same embedding-row PATCH (`:108`); browser tile query/cache side effects. | Interception must be armed before navigation; many tiles can issue the same endpoint concurrently; query must be inserted before the JWT hash (`:116-128`). | Playwright request-observation test, isolated by embed-config coordination. |
| `omits the timezone from embed tile queries when ?timezone= is absent` (`packages/e2e/cypress/e2e/app/embed.cy.ts:138-163`) | Active | Opens the unmodified embed URL and verifies the first matching tile-query body has no `timezone` property (`:150-159`). | Same embedding-row PATCH (`:142`); browser tile query/cache side effects. | Same first-of-many request race; absence must be checked on the serialized wire body. | Playwright request-observation test, isolated by embed-config coordination. |
| `I can use "Explore from here" in embedded dashboard and view the correct elements` (`packages/e2e/cypress/e2e/app/embed.cy.ts:165-241`) | Skipped by `it.skip`; the `beforeEach` does not run | Would enable `canExplore`, open a chart menu, navigate to embedded Explore, check allowed and forbidden controls, and return to the dashboard (`:174-237`). | None while skipped; if enabled, same persistent allowlist PATCH (`:171`) and query/cache side effects. | Hover menu; client routing; broad positive and negative text assertions; permission-sensitive UI. The only skip rationale is `todo: move to unit test` (`:165`). | Clarification required. If the end-to-end navigation contract is still valuable, retain one focused Playwright test; move control-visibility permutations to frontend unit/component tests rather than copying the broad skipped body. |
| `URL syncs for dashboard filters in direct mode` (`packages/e2e/cypress/e2e/app/embed.cy.ts:243-289`) | Skipped by `it.skip` | Would edit the seeded boolean filter in a dialog, assert serialized URL state, reset filters, and assert URL cleanup (`:261-285`). | None while skipped; if enabled, same persistent allowlist PATCH (`:248`). UI changes are session-local. | Mantine dialog/portal, forced Apply click, URL serialization, and reset button. The skip comment says to move it to a unit test (`:243`). | Frontend unit test around direct-embed dashboard filter URL synchronization; clarify whether any one browser smoke test remains necessary. |
| `URL filter overrides apply for embedded dashboard with all filters allowed` (`packages/e2e/cypress/e2e/app/embed.cy.ts:291-350`) | Skipped by `it.skip` | Would inject a JSON filter override into the URL, verify `False`, reset, and verify the seeded `True` value (`:310-346`). | None while skipped; if enabled, same persistent allowlist PATCH (`:296`). UI reset is session-local. | Hard-coded filter UUID and field/table IDs; JSON-in-query-string; URL/hash handling. The skip comment says to move it to a unit test (`:291`). | Frontend unit test for parsing/applying/resetting direct-embed filter overrides. |
| `URL syncs for date zoom in direct mode` (`packages/e2e/cypress/e2e/app/embed.cy.ts:352-390`) | Skipped by `it.skip` | Would select Month from the date-zoom menu and assert `dateZoom=month` appears in the URL (`:368-386`). | None while skipped; if enabled, same persistent allowlist PATCH (`:357`). UI selection is session-local. | Mantine dropdown and URL synchronization. The skip comment says to move it to a unit test (`:352`). | Frontend unit test for date-zoom URL synchronization; no Playwright port unless product owners explicitly want a browser smoke test. |

## Cypress command expansion

- `cy.login()` is called by the suite `beforeEach` (`packages/e2e/cypress/e2e/app/embed.cy.ts:35-38`). Its implementation creates/restores a Cypress session keyed by the seed admin email, logs in with `POST api/v1/login`, asserts 200, and validates restored sessions with `GET api/v1/user` (`packages/e2e/cypress/support/commands.ts:152-170`). The imported credentials are the org-1 admin credentials (`packages/e2e/cypress/support/commands.ts:36-37`); the seed identifies that user as `demo@lightdash.com`, password `demo_password!`, organization admin (`packages/common/src/index.ts:474-481`).
- `cy.logout()` is called after config/JWT setup in every test body (`packages/e2e/cypress/e2e/app/embed.cy.ts:61`, `:114`, `:148`, `:185`, `:260`, `:308`, `:367`). It sends `GET api/v1/logout` and makes no explicit status assertion (`packages/e2e/cypress/support/commands.ts:323-328`). This proves subsequent page/API behavior uses the embed JWT rather than the admin browser session.
- `cy.findByTestId()` comes from `@testing-library/cypress/add-commands`, imported globally in `packages/e2e/cypress/support/commands.ts:46`; the support file imports all commands at `packages/e2e/cypress/support/e2e.ts:17`. The source uses it only for `tile-icon-more` (`packages/e2e/cypress/e2e/app/embed.cy.ts:93`, `:197`). The test id is on the inner dots icon, not its clickable `ActionIcon` button (`packages/frontend/src/components/DashboardTiles/TileBase/index.tsx:244-259`).
- `getJaffleDashboard`, `updateEmbedConfigDashboards`, and `getEmbedUrl` are file-local wrappers rather than registered Cypress commands. They issue, respectively, `GET /api/v2/content?pageSize=1&contentTypes=dashboard&search=jaffle`, project-wide config `PATCH`, and JWT `POST` (`packages/e2e/cypress/e2e/app/embed.cy.ts:7-33`).

## State, seed, and environment assumptions

- The fixed project is `Jaffle shop`, UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-558`). The embed API prefix is constructed from that UUID (`packages/e2e/cypress/e2e/app/embed.cy.ts:7`).
- Development seeds must contain a dashboard discoverable by the broad search `jaffle`. The intended seed is named `Jaffle dashboard` and contains the asserted markdown/chart tiles (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:200-215`). Its default boolean and relative-date filters match the assertions and the skipped hard-coded override (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:216-241`).
- Dashboard lookup is not deterministic enough: it requests only one fuzzy search result and does not assert response status, result count, name, or non-null UUID before using `data[0]?.uuid` (`packages/e2e/cypress/e2e/app/embed.cy.ts:30-33`, `:40-44`). A duplicate or newly matching dashboard can silently select the wrong record. The port should select exactly one result named `Jaffle dashboard` and fail explicitly on zero/multiple exact matches rather than hard-code a generated dashboard UUID.
- Every config/JWT setup request requires an authenticated session (`packages/backend/src/ee/controllers/embedController.ts:202-242`). Service authorization additionally requires the commercial Embedding feature and `update Project` permission (`packages/backend/src/ee/services/EmbedService/EmbedService.ts:181-210`, `:401-410`), which explains the seed admin role.
- The embedding row and encoded secret must already exist. `getEmbedUrl` reads that row before signing a one-hour-default JWT (`packages/backend/src/ee/services/EmbedService/EmbedService.ts:206-210`), while the test only calls `PATCH`, never the config-creation endpoint.
- After logout, dashboard and tile endpoints authenticate with the embed token. The JWT middleware documents that only `get-embed-url` requires a user and other embed endpoints use JWT auth (`packages/backend/src/middlewares/jwtAuthMiddleware/jwtAuthMiddleware.ts:55-63`); the tile controller enforces embedded auth (`packages/backend/src/ee/controllers/embedController.ts:324-365`).
- The direct embed URL carries the JWT in its hash. The provider captures that token before redirect/hash removal (`packages/frontend/src/ee/providers/Embed/EmbedProvider.tsx:135-145`). `URL.searchParams.set` in the timezone/filter cases must preserve the hash (`packages/e2e/cypress/e2e/app/embed.cy.ts:123-128`, `:327-334`).
- The intended dashboard includes a Loom tile with an external `https://www.loom.com/...` URL (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:70-80`). Cypress globally blocks `*.loom.com` (`packages/e2e/cypress.config.ts:27-33`), but current Playwright config has no equivalent (`packages/e2e/playwright.config.ts:20-27`). Add a test-local route abort for Loom; do not introduce shared infrastructure for this one local dependency.
- The rendered charts require working backend async-query execution and the seeded Jaffle warehouse/data. No uploads, downloads, clipboard access, popups, or filesystem sharing are exercised.
- Cypress uses `http://localhost:3000`, a 1920x1080 viewport, 10-second command timeout, and two run-mode retries by default (`packages/e2e/cypress.config.ts:13-26`). Playwright defaults to the same URL/viewport, Firefox, 10-second action/expect timeouts, 30-second navigation timeout, one worker, and CI-only retries (`packages/e2e/playwright.config.ts:4-13`, `:20-40`). `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_RETRIES` are the relevant Playwright environment overrides.

## Synchronization and timeout requirements

- Keep API setup sequential: resolve exactly one dashboard, await a successful config PATCH, await a successful JWT POST, then remove browser cookies and navigate. Cypress explicitly waits for the PATCH and status 200 before minting the URL (`packages/e2e/cypress/e2e/app/embed.cy.ts:44-59`, `:108-113`, `:142-147`). The port should also assert the content and JWT responses are OK, which the source currently omits.
- Do not call the logout endpoint from Playwright's shared admin storage state. The current setup logs in once and writes that server-backed session for all tests (`packages/e2e/playwright/auth.setup.ts:10-23`); destroying it in test 1 can invalidate the cookie restored by later tests. After authenticated setup requests, use `browserContext.clearCookies()` before direct-embed navigation. That preserves the server session for other test contexts while proving the page itself has no user cookie.
- For timezone tests, create the matching `page.waitForRequest` promise before `page.goto`. Match method `POST` and the exact pathname `/api/v1/embed/{projectUuid}/query/dashboard-tile`, then inspect the first matching serialized body, preserving Cypress's first-request semantics (`packages/e2e/cypress/e2e/app/embed.cy.ts:116-132`, `:150-159`). Avoid `networkidle`; dashboard tiles can issue many independent requests.
- The frontend parses the timezone query once on direct-embed mount (`packages/frontend/src/ee/providers/Embed/EmbedProvider.tsx:79-86`) and serializes `sessionTimezone ?? undefined` into every embed tile request (`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:297-315`). The absent case should assert the wire JSON has no `"timezone"` key, not merely an undefined JavaScript value.
- Use web-first visibility assertions on a stable dashboard marker before hover/menu assertions. The source relies on Cypress retryability for all bare `contains` calls (`packages/e2e/cypress/e2e/app/embed.cy.ts:67-98`). No custom timeout exceeds the configured 10 seconds; keep the standard Playwright timeouts unless focused execution demonstrates a specific query needs more.
- The skipped filter test's forced Apply click (`packages/e2e/cypress/e2e/app/embed.cy.ts:271-275`) signals an unresolved actionability/portal issue. Do not carry `{ force: true }` into Playwright; a future reactivation needs a root-cause locator/visibility fix.

## Locator and strictness risks

- Cypress `contains` is substring-based and often unscoped. Playwright strict mode may find duplicated text in a tile title, chart internals, menu, or hidden responsive copy. Use exact text where the seed text is exact and scope assertions to visible content; do not use `.first()` merely to suppress strictness.
- The export-menu opener is risky. Hovering the chart title is followed by a global `findByTestId('tile-icon-more')` (`packages/e2e/cypress/e2e/app/embed.cy.ts:89-95`), and the test id is attached to an SVG nested in the actual button (`packages/frontend/src/components/DashboardTiles/TileBase/index.tsx:244-259`). In Playwright, hover the exact chart title, assert one visible `tile-icon-more`, then click its parent button (or use a stable accessible button locator if the rendered icon exposes one). Scope to the hovered tile if more than one icon becomes visible.
- Text case is inconsistent across tests: the active test expects lowercase `true` (`packages/e2e/cypress/e2e/app/embed.cy.ts:83`), while skipped tests expect `True`/`False` (`:269`, `:340`, `:346`). Preserve each current contract; do not normalize without checking current UI.
- Negative skipped assertions such as global absence of `SQL`, `Share`, and `Error` (`packages/e2e/cypress/e2e/app/embed.cy.ts:215-229`) are broad and can match unrelated content. If revived, scope them to the embedded explorer header/navigation and use role/name locators.
- `Default zoom`, `Month`, `Filters`, `Chart`, and `Results` are generic labels (`packages/e2e/cypress/e2e/app/embed.cy.ts:205-213`, `:377-386`). Future ports of skipped behavior need role-scoped controls/regions rather than global text.
- Reset controls have an explicit accessible label (`packages/e2e/cypress/e2e/app/embed.cy.ts:282`, `:343`), so a future unit/browser test should prefer `getByRole('button', { name: 'Reset all filters' })` over raw CSS.

## Nonstandard or surprising behavior

- “Embedded” here is a direct top-level `/embed/...#jwt` route, not an iframe test. There is no frame locator requirement.
- Each test first authenticates as an admin only to mutate config and mint a JWT, then deliberately becomes anonymous before navigation (`packages/e2e/cypress/e2e/app/embed.cy.ts:35-38`, `:60-64`). The resulting access is a two-auth-mode flow, not a normal logged-in page test.
- The config helper is broader than its name: besides dashboard UUIDs, it empties `chartUuids` and disables all-dashboard/all-chart access (`packages/e2e/cypress/e2e/app/embed.cy.ts:9-20`). It can therefore break unrelated chart-embed tests and leaves the altered row behind.
- The first active test supplies `canExportPagePdf: true` but never checks a page-PDF control, and only checks that data/image export options exist without initiating downloads (`packages/e2e/cypress/e2e/app/embed.cy.ts:54-57`, `:89-98`). Do not add download mechanics during a behavior-preserving port.
- The timezone title says “tile queries” plural, but Cypress waits for only the first matching request (`packages/e2e/cypress/e2e/app/embed.cy.ts:130-132`, `:157-159`). The port should preserve that unless the owner confirms all tile requests must be checked.
- `parseEmbedTimezoneParam` trims empty values but otherwise forwards a non-empty string for backend validation (`packages/frontend/src/ee/providers/Embed/parseEmbedTimezoneParam.ts:1-12`). This test uses an IANA identifier and is independent of the test runner machine's local timezone.
- The skipped filter override duplicates the seed filter UUID and field identifiers exactly (`packages/e2e/cypress/e2e/app/embed.cy.ts:311-325`; `packages/backend/src/database/seeds/development/03_saved_dashboards.ts:216-227`), making it tightly coupled to development seed internals.
- There are no `afterEach`/`after` hooks, aliases shared between tests, or test-order dependencies in the spec. Each active test repeats lookup/config/JWT setup. The persistent embed row is shared external state, but no test depends on a prior test having run.

## Coordination requirements

- `seed-project-embed-config`: define serialization or isolated-preview/database ownership for tests that PATCH the embedding row for `SEED_PROJECT.project_uuid`. The row is keyed and updated by project UUID (`packages/backend/src/ee/models/EmbedModel.ts:156-165`), and this file does not restore its prior state.
- Exact Cypress/Playwright dual-run of this file can share a preview only while both versions write the same selected dashboard and flags. A different embed spec can overwrite the row between PATCH and page load, causing JWT/dashboard authorization failure because the service checks the dashboard against the current allowlist (`packages/backend/src/ee/services/EmbedService/EmbedService.ts:386-398`).
- Snapshot-and-restore is not sufficient for concurrent writers: one runner can restore stale config while another is using its config. Prefer an isolated database/preview lane or a coordinator-owned lock around the entire setup/navigation/assertion interval.
- No new shared Playwright helper is justified. The three active tests can use file-local typed API helpers and a local setup function. Existing admin auth setup already supplies the required role (`packages/e2e/playwright.config.ts:28-40`, `packages/e2e/playwright/auth.setup.ts:10-23`).

## Exact port plan

1. Create only `packages/e2e/playwright/app/embed.spec.ts` for the active browser coverage. Keep constants and typed response-validation helpers local to that file; do not add shared fixtures/config for one spec.
2. Import `CreateEmbedJwt`, `FilterInteractivityValues`, and `SEED_PROJECT`. Add local helpers to:
   - call `/api/v2/content` and require exactly one result whose name is exactly `Jaffle dashboard`;
   - PATCH `/api/v1/embed/{projectUuid}/config` with the source payload and assert OK;
   - POST `/api/v1/embed/{projectUuid}/get-embed-url`, validate the success envelope and URL, and return the URL.
3. Use the existing Firefox project/admin storage state. Perform API setup through the test context while authenticated, then call `context.clearCookies()` before `page.goto`; do not call `/api/v1/logout` and invalidate the suite's shared server session.
4. Abort Loom requests with a route declared in this spec because Cypress blocks that host globally but Playwright does not. Do not add a global helper solely for this file.
5. Port the first active test with web-first, exact visibility assertions. Hover the exact average-spend tile title, require a single visible `tile-icon-more`, click the owning button, and assert `Download data`, `Export image`, and `Default zoom`. Do not add an actual export/PDF download.
6. Port each timezone case as a separate test. Register an exact method/path `waitForRequest` before navigation. For the override, add `timezone=America/Los_Angeles` through `URL.searchParams` and assert the serialized request includes that exact key/value. For absence, assert the serialized body has no `timezone` key. Preserve the JWT hash.
7. Do not copy the four dormant Cypress bodies into active Playwright coverage. Record/retain their triage as follows: focused Playwright only if embedded Explore navigation is explicitly reinstated; frontend unit tests for filter URL sync, filter override/reset, and date-zoom URL sync. If migration policy requires skipped placeholders, add only `test.skip` titles with concise triage reasons—no duplicated dead implementation.
8. Keep Cypress authoritative and do not delete `packages/e2e/cypress/e2e/app/embed.cy.ts`. Run Cypress and Playwright sequentially or on isolated previews until the `seed-project-embed-config` contract is in place.

## Verification plan

Run from the repository root after the port exists:

```bash
# Authoritative source, isolated/sequential because it mutates embed config
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/embed.cy.ts

# Focused Playwright port (setup dependency included by the firefox project)
pnpm -F e2e playwright:run -- playwright/app/embed.spec.ts --project=firefox

# Playwright TypeScript and package quality checks
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format

# Full Playwright regression after focused success
pnpm -F e2e playwright:run -- --project=firefox
```

During focused verification, confirm all 3 Playwright tests execute and all 4 Cypress tests remain skipped. Do not use parallel Cypress/Playwright execution on a shared preview unless the coordinator confirms no different embed-config writer is active.

## Open questions

1. What isolation/locking contract will own `seed-project-embed-config` during the migration swarm? The current test cannot safely coexist with a different embedding allowlist writer.
2. Is the embedding row/config guaranteed to exist, and is `CommercialFeatureFlags.Embedding` enabled in every Playwright target environment? The source assumes both and has no creation fallback (`packages/backend/src/ee/services/EmbedService/EmbedService.ts:206`, `:401-410`).
3. Should the timezone contract cover every tile query rather than only the first matching request? The titles are plural but the current evidence checks one request (`packages/e2e/cypress/e2e/app/embed.cy.ts:130-132`, `:157-159`).
4. Are the four `todo: move to unit test` cases already covered elsewhere, or should dedicated frontend unit tests be created before Cypress removal? No reason for the skips is recorded beyond those comments (`packages/e2e/cypress/e2e/app/embed.cy.ts:165`, `:243`, `:291`, `:352`).
5. For embedded Explore, which contract is desired: one browser navigation smoke test, unit-level visibility/permission tests, or removal as obsolete? Its current skipped body mixes all three concerns (`packages/e2e/cypress/e2e/app/embed.cy.ts:193-237`).
6. Is there a stable tile-container/accessibility locator for the hover menu? The current only explicit hook is on the inner SVG (`packages/frontend/src/components/DashboardTiles/TileBase/index.tsx:244-259`).

## Port history

Not started.
