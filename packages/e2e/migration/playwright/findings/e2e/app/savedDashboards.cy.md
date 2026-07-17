# packages/e2e/cypress/e2e/app/savedDashboards.cy.ts

## Classification

- Recommended runner: Playwright. Every case exercises rendered navigation, menus, forms, modals, list updates, or browser routing; none is API-only.
- Execution lane: `mutating-isolated`.
- Active tests: 3.
- Skipped tests: 1 (direct `it.skip`; there is no inherited skipped suite).
- Persistent mutation: Yes. The suite creates a dashboard, renames it, then deletes or soft-deletes it (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:17-63`).
- Shared-preview dual-run safe: No. Fixed names, cross-test ordering, retries, and absent cleanup can collide with another Cypress/Playwright run.
- Difficulty total: 10/18 — persistent/shared state 3; browser interaction complexity 2; environment/external dependencies 1; synchronization/flakiness 2; authentication/authorization 1; cross-file infrastructure 1.
- Coordination keys: `shared-preview-mutation-isolation`.
- Analysis status: coordination-required.

The source itself asks to combine the cases (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:3`). That is the root fix for its create → rename → delete ordering dependency, but the migration still needs an isolated/resettable preview contract before entering the mutating lane.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should display dashboards` | Skipped by `it.skip` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:9-10`) | Opens Browse, follows `All dashboards`, and expects seeded `Jaffle dashboard` (`:11-14`). | None. | Skip comment says preview menu-navigation timing is flaky (`:9`); Browse is a portaled Mantine menu and lazily enables a spaces request on first open (`packages/frontend/src/components/NavBar/BrowseMenu.tsx:76-86,101-142`). | Playwright UI; remove the skip and fold the seeded-dashboard assertion into the beginning of the lifecycle test. Playwright role locators and web-first waiting should replace the timing-sensitive sequence. If independent read-only coverage is desired, keep it as a separate Playwright test instead; no API-test move is warranted. |
| `Should create a new dashboard` | Active (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:17`) | Navigates through Browse, opens the two-step create modal, fills name/description, creates, checks a dashboard UUID URL, and checks the title (`:18-32`). | Creates `Untitled dashboard` with description `Description`, empty tiles/tabs, and the modal-selected root space. | Multi-step portaled modal; destination spaces load only while open; route assertion is an unanchored UUID regex and accepts the actual trailing `/edit`. | Playwright UI, folded into one atomic CRUD lifecycle test. Use a run-unique name, scope to the create dialog, wait for the POST/navigation, and capture the dashboard UUID for cleanup. |
| `Should update dashboards` | Active (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:35`) | Finds the row named `Untitled dashboard`, opens its action menu, renames it to `e2e dashboard`, saves, and expects the new text (`:36-48`). | PATCHes the dashboard created by the preceding test. | Hard ordering/name dependency; row action is selected by `tr` text followed by any descendant `button` (`:40`); menu and modal are portaled. | Playwright UI, same atomic CRUD lifecycle test. Re-find the captured dashboard by its unique name/row, use the row’s accessible `Menu` button, scope the update dialog, wait for PATCH, and assert old name absent/new row visible. |
| `Should delete dashboards` | Active (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:51`) | Finds `e2e dashboard`, uses its action menu and delete confirmation, then implicitly requires one or more `Jaffle dashboard` elements (`:52-63`). | DELETEs or soft-deletes the dashboard renamed by the preceding test. | Hard ordering/name dependency; delete can be soft; the final assertion checks only that a seed dashboard remains and never checks that `e2e dashboard` disappeared. The comment explicitly acknowledges a non-reset DB and duplicate seed names (`:61-63`). | Playwright UI, same atomic CRUD lifecycle test. Wait for DELETE/modal close, assert the captured dashboard row is gone, and retain a non-strict “at least one Jaffle dashboard remains” assertion only if parity is wanted. Always attempt API cleanup in `finally`. |

## Cypress command expansion

- The suite-level `beforeEach` invokes the only project-defined command, `cy.login()` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:5-6`). Its implementation creates/restores a `cy.session` keyed by the seeded admin email, POSTs `api/v1/login` with the seeded admin email/password, requires HTTP 200, and validates restored sessions with `GET api/v1/user` requiring HTTP 200 (`packages/e2e/cypress/support/commands.ts:152-171`). The credentials are `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-480`). Hooks do not run for the directly skipped test.
- `findByRole`, `findByText`, `findByLabelText`, and `findAllByText` come from `@testing-library/cypress`, imported globally by `packages/e2e/cypress/support/commands.ts:46` and pinned in `packages/e2e/package.json:24`. The adapter registers every `find*` DOM query as a Cypress retryable query; singular variants throw when more than one result exists, while `*All*` variants permit multiple results (`packages/e2e/node_modules/@testing-library/cypress/dist/add-commands.js:3-10`, `packages/e2e/node_modules/@testing-library/cypress/dist/index.js:15-33,45-82`). There is no repository wrapper around these calls.
- `visit`, `contains`, `find`, `click`, `type`, `clear`, `url`, and `should` are Cypress built-ins, not custom project commands.
- Playwright already provides equivalent admin session infrastructure: setup POSTs `/api/v1/login`, verifies `/api/v1/user`, and writes storage state (`packages/e2e/playwright/auth.setup.ts:10-23`); the Firefox project consumes it (`packages/e2e/playwright.config.ts:33-40`). No new auth helper is needed.

## State, seed, and environment assumptions

- Every active test assumes the seeded admin and session-authenticated browser. The create control additionally requires create access in at least one space and is hidden in demo mode (`packages/frontend/src/pages/SavedDashboards.tsx:25-29,61-70`). Rename/delete actions require CASL `manage` permission for the dashboard’s space (`packages/frontend/src/components/common/ResourceView/ResourceActionMenu.tsx:179-231,271-295,351-388,652-680`). Admin satisfies the intended role; editor/viewer behavior is not covered.
- All navigation targets seed project UUID `3675b69e-8324-4110-bdca-059031aa8da3`, named `Jaffle shop` (`packages/common/src/index.ts:550-553`; source import/use at `packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:1,11,18,36,52`).
- The database seed creates `Jaffle dashboard` in that project (`packages/backend/src/database/seeds/development/03_saved_dashboards.ts:201-249`). The skipped display test assumes at least one; the delete test explicitly tolerates multiple because CI does not reset the DB (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:61-63`).
- Opening the create modal triggers `GET /api/v1/projects/{projectUuid}/spaces`; the form chooses `defaultSpaceUuid` when supplied, otherwise the first root space, and cannot submit without a space (`packages/frontend/src/hooks/useSpaces.ts:23-50`, `packages/frontend/src/components/common/modal/DashboardCreateModal.tsx:75-114,151-166`). The source does not select a destination itself.
- Relevant dashboard requests are:
  - list prefetch: `GET /api/v1/projects/{projectUuid}/dashboards?includePrivate=false` (`packages/frontend/src/hooks/dashboard/useDashboards.ts:9-16,30-43`);
  - virtual list: paged `GET /api/v2/content?...` (`packages/frontend/src/hooks/useContent.ts:54-79`, `packages/frontend/src/components/common/ResourceView/InfiniteResourceTable.tsx:435-446`);
  - create: `POST /api/v1/projects/{projectUuid}/dashboards` (`packages/frontend/src/hooks/dashboard/useDashboard.ts:45-50`), whose returned dashboard UUID drives navigation to `/dashboards/{uuid}/edit` (`packages/frontend/src/pages/SavedDashboards.tsx:82-91`);
  - rename modal load: `GET /api/v2/projects/{projectUuid}/dashboards/{uuid}` and save: `PATCH` to that URL (`packages/frontend/src/hooks/dashboard/useDashboard.ts:36-42,73-83`, `packages/frontend/src/components/common/modal/DashboardUpdateModal.tsx:40-48,78-84`);
  - delete modal load plus `DELETE /api/v2/projects/{projectUuid}/dashboards/{uuid}` (`packages/frontend/src/hooks/dashboard/useDashboard.ts:87-93`, `packages/frontend/src/components/common/modal/DashboardDeleteModal.tsx:35-48`).
- The create response must contain a dashboard with a UUID because the UI routes from `dashboard.uuid`; the source then assumes the edit page renders the created name (`packages/frontend/src/pages/SavedDashboards.tsx:86-90`, `packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:28-32`). Update/delete mutations invalidate dashboard/content caches before their success flow finishes (`packages/frontend/src/hooks/dashboard/useDashboard.ts:437-460,512-520,654-671`).
- Fixed names are collision-prone. A failed/retried create can leave extra `Untitled dashboard` rows; a failed update can leave `e2e dashboard`; subsequent row-by-name selection is then ambiguous (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:23,40,43,56`). Cypress run-mode retries default to two (`packages/e2e/cypress.config.ts:12-22`), increasing this risk.
- Delete semantics depend on `SOFT_DELETE_ENABLED`; it defaults false unless exactly `true` (`packages/backend/src/config/parseConfig.ts:3035-3041`). With it enabled, cleanup leaves a recoverable tombstone and the modal text changes (`packages/frontend/src/components/common/modal/DashboardDeleteModal.tsx:32-63`). Preview declares PR mode (`docker/docker-compose.preview.yml:39-47`), not demo mode, but the workflow does not explicitly set soft delete.
- No test-specific timezone, upload/download, warehouse, or third-party service is used. Cypress blocks analytics/chat hosts globally, but this suite does not assert them (`packages/e2e/cypress.config.ts:26-36`). Playwright uses `PLAYWRIGHT_BASE_URL` or local `http://localhost:3000`; `PLAYWRIGHT_RETRIES` is the only relevant retry override (`packages/e2e/playwright.config.ts:4-13,20-26`).

## Synchronization and timeout requirements

- The Cypress source has no intercepts, aliases, explicit network waits, custom timeouts, or fixed sleeps. It relies on retryable Testing Library queries and the global 10-second command timeout (`packages/e2e/cypress.config.ts:16-22`).
- The skipped test identifies a real synchronization point: wait for the Browse button, opened menu item, dashboard route, and content response rather than clicking immediately (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:9-14`). Browse lazily starts loading spaces when opened, although `All dashboards` itself is a static menu item (`packages/frontend/src/components/NavBar/BrowseMenu.tsx:78-86,101-142`).
- The create modal returns `null` while spaces are loading (`packages/frontend/src/components/common/modal/DashboardCreateModal.tsx:75-91,174-176`). The port must wait for the dialog/form, then for the destination step and enabled Create button. Pair Create with the POST response and then assert the exact `/edit` URL containing the captured UUID; do not reproduce the source’s unanchored URL regex (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:25-31`).
- The dashboard list is API-paged 25 at a time, sorted by most recently updated, and row-virtualized with scroll-triggered fetching (`packages/frontend/src/components/common/ResourceView/InfiniteResourceTable.tsx:383-388,435-446,490-515,537,565-573,834`). Newly created/renamed content should be near the top, but the port should still wait for the exact unique row and use the list search if isolation cannot guarantee visibility.
- Save awaits PATCH before closing through `onConfirm`, and delete awaits DELETE before its confirm callback (`packages/frontend/src/components/common/modal/DashboardUpdateModal.tsx:78-84`, `packages/frontend/src/components/common/modal/DashboardDeleteModal.tsx:45-48`). In Playwright, await the matching response plus the resulting row/modal state; text presence alone is insufficient proof of persistence.
- Playwright defaults to 10-second expectations/actions and 30-second navigation, with one worker and CI retries only (`packages/e2e/playwright.config.ts:9-13,20-26`). No per-test timeout should be needed once response waits and unique locators replace ordering races.
- A Cypress retry reruns only the failed case, not the prior create/rename case. Therefore update/delete retries can begin from the wrong lifecycle state; combining the lifecycle is required, not merely marking the Playwright describe serial.

## Locator and strictness risks

- Singular `findByText('Jaffle dashboard')` requires exactly one match, but the source itself reports duplicates (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:14,61-63`). Playwright strict mode will expose the same issue. Use a row locator with `.first()` only for the seed-presence check, or assert count is greater than zero; never identify the mutable test dashboard by this seed name.
- `findByText('Untitled dashboard')` and `findByText('e2e dashboard')` are unscoped (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:32,48`); dashboard title, breadcrumbs, toasts, or duplicate rows can make them non-unique. Scope list assertions to `getByRole('row').filter({ hasText: uniqueName })` and dashboard assertions to the page heading/title region.
- `cy.contains('tr', name).find('button').click()` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:40,56`) does not express which button is intended and can break as row controls evolve. The action button has accessible name `Menu` and a name-derived test id (`packages/frontend/src/components/common/ResourceView/ResourceActionMenu.tsx:285-296`); prefer the row-scoped `getByRole('button', { name: 'Menu' })`. A UUID-based test id would be stronger, but adding shared/app code solely for this port is not justified.
- Generic text clicks for `Next`, `Create`, and generic role buttons `Save`/`Delete` are page-global (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:25-26,45,60`). Scope each to its named dialog. The create dialog also supplies `DashboardCreateModal/Next` if the accessible name is unstable (`packages/frontend/src/components/common/modal/DashboardCreateModal.tsx:202-221`).
- Required Mantine labels render a star, which is why Cypress searches `Name your dashboard *` and `Name *` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:23,43`). Prefer Playwright `getByLabel('Name your dashboard', { exact: false })` / dialog-scoped `getByLabel('Name', { exact: false })`, rather than coupling to literal required-marker text.
- Menus and modals are rendered through portals. Do not scope menu items to the table row after opening; scope the trigger to the row, then locate the visible page-level menu item/dialog.
- The source URL regex is not end-anchored and does not mention `/edit` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:28-31`), while the application always navigates there after list creation (`packages/frontend/src/pages/SavedDashboards.tsx:86-90`). Assert the exact pathname shape.

## Nonstandard or surprising behavior

- Four nominal tests are one state machine. Update cannot pass without create, and delete cannot pass without update; the source acknowledges this with `todo: combine into 1 test` (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:3,17-63`).
- The skipped read-only case is skipped for menu timing, not unsupported product behavior (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:9-10`). It should be retried as Playwright coverage rather than preserved as skipped, moved to API tests, or removed without evidence.
- Creation silently chooses the first root space (`packages/frontend/src/components/common/modal/DashboardCreateModal.tsx:103-114`), so the test is partly dependent on space ordering and admin access despite never naming a space.
- The final delete check does not prove deletion. `findAllByText('Jaffle dashboard')` is an implicit “at least one result” query, but it only proves unrelated seeded content remains (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:60-63`). The migrated test must assert the captured dashboard is absent.
- The source fills `Description` but never verifies it (`packages/e2e/cypress/e2e/app/savedDashboards.cy.ts:24`). Preserve the input interaction for modal coverage; adding a description assertion is optional scope expansion.
- No aliases, shared variables, explicit cleanup, `after`/`afterEach`, canvas/SVG assertions, Monaco, drag-and-drop, iframe, popup, clipboard, browser API, upload/download, debounce interaction, or timezone-sensitive assertion appears in this spec.

## Coordination requirements

- Block port execution on coordination key `shared-preview-mutation-isolation`. The coordinator must provide an isolated/resettable database+preview lane for mutating Playwright tests, or an equivalent per-run namespace contract. The current shared preview cannot safely dual-run fixed-name Cypress and Playwright lifecycle mutations.
- Even in isolation, the port should generate a run-unique dashboard name and retain its captured UUID. This prevents retries and interrupted prior runs from selecting the wrong row. Use the authenticated Playwright `request` fixture in a local `finally` block to DELETE that UUID if UI deletion did not complete. If soft delete is enabled, the coordinator must decide whether a reset is required to remove tombstones.
- No shared Playwright helper or application locator change is genuinely required. Existing auth setup and direct role/dialog locators are sufficient (`packages/e2e/playwright/auth.setup.ts:10-23`, `packages/e2e/playwright.config.ts:33-40`). Keep the lifecycle/name/cleanup helpers local to the one target file.
- The seeded `Jaffle dashboard` is shared read-only state and must never be renamed or deleted. All mutation selectors must use the run-unique dashboard.

## Exact port plan

1. After the isolation coordination contract is ready, create exactly `packages/e2e/playwright/app/savedDashboards.spec.ts`; do not add shared helper files.
2. Import `SEED_PROJECT`, `expect`, and `test`. Use the existing admin storage state; do not implement UI login or another auth fixture.
3. Replace the four Cypress cases with one atomic test such as `admin can manage dashboards from the dashboard list`, matching the source TODO and eliminating cross-test ordering.
4. Generate a unique original name and unique renamed name inside that test. Keep `dashboardUuid: string | null` for exact routing and cleanup; avoid fixed `Untitled dashboard` / `e2e dashboard` selectors.
5. Navigate to `/projects/${SEED_PROJECT.project_uuid}/home`, open Browse by role, click the visible `All dashboards` menu item, assert the dashboard-list URL, and assert at least one exact `Jaffle dashboard` row/text is visible. This re-enables the skipped behavior with Playwright auto-waiting.
6. Click `Create dashboard`; scope all fields/actions to the `Create Dashboard` dialog. Fill name and `Description`, click Next, wait for the destination step/Create button to become enabled, pair Create with the v1 dashboard POST response, and assert the exact `/projects/{seedUuid}/dashboards/{dashboardUuid}/edit` pathname. Capture the UUID from the pathname and assert the created dashboard title.
7. Return directly to `/projects/${SEED_PROJECT.project_uuid}/dashboards`. Locate the exact unique-name row, click its `Menu` button, choose `Rename`, scope to the `Update Dashboard` dialog, replace the Name field, pair Save with the v2 PATCH response, and assert the old row is absent and renamed row is visible.
8. From the renamed row, open `Menu`, choose `Delete dashboard`, scope the confirmation to the delete dialog, pair its Delete button with the v2 DELETE response, then assert the dialog closes and the renamed row is absent. Optionally retain a non-strict seed-dashboard-presence assertion for parity.
9. Wrap mutation steps in `try/finally`. If a UUID was captured and UI deletion did not succeed, use the authenticated request context to issue the same v2 DELETE. Accept already-deleted/not-found cleanup explicitly; do not hide failures from the UI assertions.
10. Keep response waiting and row/dialog locator functions local. Do not add sleeps, `test.describe.serial`, a shared dashboard page object, or app test IDs for this single file.

## Verification plan

Run only against the coordinator-provided isolated/resettable preview. From repository root:

```bash
pnpm -F e2e exec oxfmt playwright/app/savedDashboards.spec.ts --check
pnpm -F e2e exec eslint -c .eslintrc.js playwright/app/savedDashboards.spec.ts
pnpm -F e2e typecheck:playwright
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test playwright/app/savedDashboards.spec.ts --project=firefox --workers=1
PLAYWRIGHT_BASE_URL="$PLAYWRIGHT_BASE_URL" pnpm -F e2e exec playwright test --project=firefox --workers=1
```

After the focused run, verify through the API or isolated DB that no active dashboard with the generated original/renamed name remains; if soft delete is enabled, verify the lane reset removes its tombstone. The full Playwright command is required because the package CI runs the Firefox project after typecheck (`.github/workflows/pr.yml:519-524`).

## Open questions

- What exact preview/database reset or namespace contract will satisfy `shared-preview-mutation-isolation` during the Cypress/Playwright dual-run period?
- Is `SOFT_DELETE_ENABLED=true` used in any intended Playwright lane? If yes, should successful lifecycle cleanup tolerate tombstones, or must the lane reset after each run?
- Does product ownership want the weak “a Jaffle dashboard still exists” post-delete assertion retained, or is the stronger captured-dashboard absence assertion sufficient once the skipped display coverage is re-enabled?

## Port history

Not started.
