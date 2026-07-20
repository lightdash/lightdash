# packages/e2e/cypress/e2e/app/space.cy.ts

## Classification

- Recommended runner: Playwright. All active tests assert rendered navigation, menus, modals, tree visibility, or role-dependent DOM state; keep the three direct 403 checks in the same browser test via the member context's request client.
- Execution lane: mutating-isolated
- Active tests: 10
- Skipped tests: 2
- Persistent mutation: Yes. The private-content test leaves a private space, chart, dashboard, invitation/user, project access, email verification, and onboarding changes; the dashboard cleanup test also does not verify deletion completed (`packages/e2e/cypress/e2e/app/space.cy.ts:15-155`, `packages/e2e/cypress/e2e/app/space.cy.ts:330-352`).
- Shared-preview dual-run safe: No. Cypress and Playwright would mutate the same seed project and generate names/emails from wall-clock milliseconds; cleanup is absent or incomplete.
- Difficulty total: 16/18 — persistent/shared state 3; browser interaction complexity 3; environment/external dependencies 2; synchronization/flakiness 3; authentication/authorization 3; cross-file infrastructure 2.
- Coordination keys: isolated-e2e-database
- Analysis status: coordination-required

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Space > Another non-admin user cannot see private content` (`packages/e2e/cypress/e2e/app/space.cy.ts:119-155`) | Active | As admin, creates a restricted space, chart, and dashboard; provisions a new organization member/project editor; completes onboarding; checks the private space is absent from Browse and All Spaces; expects space/chart/dashboard GETs to return 403. | Persistent restricted space, saved chart, dashboard, invite, user, project permission, verified email, and onboarding profile; no cleanup (`:15-117`, `:122-151`). | Conditional Escape for an omnibar, explore field-tree virtualization, chart-save modal, URL UUID extraction, direct dashboard POST expecting 201, runtime auth switch, onboarding modal, and three direct API authorization checks. | Playwright in isolated mutation lane; preserve UI visibility checks and use context-bound API requests for setup/assertions. |
| `Admin access to spaces > can see all public spaces and private spaces w/ direct access` (`:163-172`) | Active | Admin sees Jaffle shop and all `SPACE_TREE_1` roots on the spaces page. | None. | Assertions are broad text containment over seed-derived names. | Playwright read-only test, but run with this file's isolated lane. |
| `Admin access to spaces > can see all the spaces on Admin content view` (`:174-186`) | Skipped via `it.skip` | Would switch the spaces page to Admin Content View and expect Jaffle shop plus all roots from both trees. | None. | No skip comment or issue reference exists; overlaps the active dashboard-space-selector coverage at `:197-221`. | Clarify/remove if obsolete duplication; if retained, port as explicitly skipped Playwright coverage until the skip reason is resolved. |
| `Admin access to spaces > can see nested spaces` (`:188-195`) | Skipped via `it.skip` | Would switch to Admin Content View, open Parent Space 4, and find Child Space 4.1. | None. | No skip rationale; overlaps the nested admin selector assertions at `:219-220`. | Clarify/remove if obsolete duplication; otherwise port as explicitly skipped Playwright coverage. |
| `Admin access to spaces > can see all public and private spaces in admin Tree view` (`:197-221`) | Active | Opens dashboard creation, advances to the space selector, verifies normal admin-visible roots, switches to Admin Content View, verifies both trees, and expands Parent Space 4. | No persisted dashboard: a name is typed, but Create is never clicked. | Multi-step modal/tree selector; generated ISO name; leaves an open unsaved modal. | Playwright. Scope assertions to the dashboard dialog/tree. |
| `Editor access to spaces > can see all public spaces and private spaces w/ access` (`:236-244`) | Active | Editor sees expected public/direct/group/creator-access roots and does not see Parent Space 2. | None. | Positive and negative permission assertions derived partly from hard-coded names. | Playwright. |
| `Editor access to spaces > can see nested spaces` (`:246-251`) | Active | Editor opens editor-owned Parent Space 4 and sees Child Space 4.1. | None. | Seed permission dependency. | Playwright. |
| `Editor access to spaces > can see all public and private spaces w/ access in Tree view` (`:253-270`) | Active | From Child Space 1.1, opens dashboard creation, advances to its tree selector, checks editor-visible roots, and expands Parent Space 4. | No persisted dashboard: Create is never clicked. | Nested-space navigation and modal tree selector; generated ISO name. | Playwright. Scope the tree assertions to the dialog. |
| `Viewer access to spaces > can see all public spaces and private spaces w/ access` (`:280-289`) | Active | Viewer sees Jaffle shop and Parent Space 1, but not Parent Spaces 2 or 5. | None. | Role-dependent negative DOM assertions. | Playwright. |
| `Viewer access to spaces > can see nested spaces` (`:291-298`) | Active | Viewer opens Parent Space 1 and sees Child Spaces 1.1, 1.2, and 1.3. | None. | Seed hierarchy dependency. | Playwright. |
| `Editor can create content > can create a new space` (`:306-328`) | Active | Editor creates a timestamp-named child under Child Space 1.1, opens its action menu, confirms deletion by typing its name, and checks disappearance. | Temporary space; intended UI cleanup is asserted. A failed/interrupted test leaves it behind. | Dynamic test id includes the generated resource name; destructive confirmation input. | Playwright in isolated mutation lane with `try/finally` cleanup where an established API permits it. |
| `Editor can create content > can create/delete a new dashboard` (`:330-352`) | Active | Editor creates a dashboard in Child Space 1.1, waits, navigates back, locates it, and requests deletion. | Temporary dashboard; delete completion is not asserted, and interruption leaves it behind. | Two fixed 1.5-second sleeps, browser back navigation, dynamic-name test id. | Playwright in isolated mutation lane; replace sleeps with URL/response/readiness assertions and verify deletion. |

No inherited `describe.skip` exists; the only effective skips are the two direct `it.skip` declarations at `packages/e2e/cypress/e2e/app/space.cy.ts:174` and `:188`.

## Cypress command expansion

- `cy.login()` is used by the first and admin suites (`packages/e2e/cypress/e2e/app/space.cy.ts:11-13`, `:159-161`). It uses `cy.session` keyed by `demo@lightdash.com`, POSTs `api/v1/login` with the seeded admin password, expects 200, and validates restored sessions with GET `api/v1/user` expecting 200 (`packages/e2e/cypress/support/commands.ts:152-173`). The seed credentials are `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-480`).
- `cy.loginAsEditor()` is used in both editor suites (`packages/e2e/cypress/e2e/app/space.cy.ts:232-234`, `:302-304`). It has the same `cy.session`/login/user-validation behavior using `demo2@lightdash.com` / `demo_password!` (`packages/e2e/cypress/support/commands.ts:175-196`; `packages/common/src/index.ts:492-498`).
- `cy.loginAsViewer()` is used by the viewer suite (`packages/e2e/cypress/e2e/app/space.cy.ts:276-278`). It logs in and validates a session for `demo3@lightdash.com` / `demo_password!` (`packages/e2e/cypress/support/commands.ts:198-218`; `packages/common/src/index.ts:510-516`).
- `cy.loginWithPermissions('member', [{ role: 'editor', projectUuid }])` is called after private content is created (`packages/e2e/cypress/e2e/app/space.cy.ts:122-127`). Its implementation first restores admin login, generates `demo+member-<milliseconds>@lightdash.com`, creates an invite, adds each requested project permission, registers with the invite, verifies email, and yields the email (`packages/e2e/cypress/support/commands.ts:330-354`). Expanded nested commands:
  - `cy.invite` POSTs `api/v1/invite-links` with the organization role, generated email, and a 24-hour expiry; it expects 201 and yields `results.inviteCode` (`packages/e2e/cypress/support/commands.ts:286-303`).
  - `cy.addProjectPermission` POSTs `api/v1/projects/{projectUuid}/access` with role/email and `sendEmail: false`, expecting 200 (`packages/e2e/cypress/support/commands.ts:305-321`).
  - `cy.registerWithCode` POSTs `api/v1/user` with the invite code, names `test test`, and password `test1234`, expecting 200 (`packages/e2e/cypress/support/commands.ts:257-272`).
  - `cy.verifyEmail` GETs `api/v1/user/me/email/status?passcode=000000`, expecting 200 (`packages/e2e/cypress/support/commands.ts:274-284`). The test assumes registration replaces the admin session with the new user's authenticated session; there is no subsequent explicit login.
- `cy.scrollTreeToItem` is used for `Total order amount` and `Status` (`packages/e2e/cypress/e2e/app/space.cy.ts:54-57`). It finds the virtualized scroll container with a 10-second timeout, resets scrollTop, advances by half a viewport, waits 200 ms after every move, searches rendered descendants by text, and falls back to the bottom plus `findByText` (`packages/e2e/cypress/support/commands.ts:773-826`). The application uses TanStack virtualization with five-item overscan and exposes that container test id (`packages/frontend/src/components/Explorer/ExploreTree/TableTree/Virtualization/VirtualizedTreeList.tsx:75-97`).
- `findByText`, `findByPlaceholderText`, and related queries come from `@testing-library/cypress`, not repository-defined commands. Other calls (`visit`, `contains`, `request`, `session`, `go`, `wait`) are Cypress built-ins.

## State, seed, and environment assumptions

- Every route and permission assignment targets seed project `3675b69e-8324-4110-bdca-059031aa8da3`, named `Jaffle shop` (`packages/common/src/index.ts:550-558`; source import/use at `packages/e2e/cypress/e2e/app/space.cy.ts:2-8`). The root Jaffle shop space is assumed to share the project name.
- `SPACE_TREE_1` contains Parent Spaces 1, 2, 3, and 5. Parent Space 2 disables inherited permissions; Parent Space 3 grants the seeded editor direct editor access; Parent Space 5 grants the editor's group access (`packages/common/src/index.ts:1002-1095`). `SPACE_TREE_2` is restricted Parent Space 4 with Child Space 4.1 (`packages/common/src/index.ts:1097-1108`).
- Seed creation is identity-sensitive: tree 1 is created by the admin and tree 2 by the editor (`packages/backend/src/database/seeds/development/05_nested_spaces.ts:88-116`), and the creator receives explicit space-admin access on each created node (`packages/backend/src/database/seeds/development/05_nested_spaces.ts:61-65`). This explains admin/editor visibility expectations; the viewer depends on inherited public access only.
- Parent Space 1 must retain Child Spaces 1.1, 1.2, and 1.3 (`packages/common/src/index.ts:1004-1046`). The mutation tests both require Child Space 1.1 to remain writable by the seeded editor (`packages/e2e/cypress/e2e/app/space.cy.ts:306-350`). Prior suites or parallel workers that rename/delete/change access on these seed spaces will break this file.
- Private chart creation requires a compiled `Orders` explore exposing `Total order amount` and `Status` (`packages/e2e/cypress/e2e/app/space.cy.ts:50-58`), plus functioning backend/database/warehouse query services. No third-party service, file upload/download, or environment variable is referenced directly.
- Cypress assumes `http://localhost:3000`, a 1920x1080 viewport, and a 10-second default command timeout (`packages/e2e/cypress.config.ts:15-26`). Existing Playwright also defaults to `http://localhost:3000`, Firefox, 1920x1080, one worker, and admin storage state (`packages/e2e/playwright.config.ts:6-13`, `:20-40`).
- Existing Playwright setup only authenticates the admin by API and saves that storage state (`packages/e2e/playwright/auth.setup.ts:10-23`). Editor, viewer, and dynamic-member authentication must therefore be local to the target file unless a separately coordinated general multi-role fixture already exists.
- Generated names use ISO timestamps or millisecond epochs (`packages/e2e/cypress/e2e/app/space.cy.ts:16`, `:202`, `:260`, `:312`, `:335`); the generated member email also uses milliseconds (`packages/e2e/cypress/support/commands.ts:339`). They reduce ordinary duplicate-name risk but can collide when dual runners generate in the same millisecond. UUID/random suffixes are safer in the port.
- Explicit request assumptions are: dashboard creation returns 201 and `body.results.uuid` (`packages/e2e/cypress/e2e/app/space.cy.ts:85-100`), while inaccessible space, chart, and dashboard GETs each return exactly 403 (`:144-151`). UI-generated create/delete requests have no aliases or status assertions.

## Synchronization and timeout requirements

- Cypress retries ordinary commands for 10 seconds and retries failed run-mode tests twice by default (`packages/e2e/cypress.config.ts:12-21`). Playwright currently has 10-second expect/action timeouts and 30-second navigation timeout (`packages/e2e/playwright.config.ts:11-13`, `:20-23`).
- Private space creation synchronizes on the new heading and a UUID-shaped `/spaces/{uuid}` URL; chart save synchronizes on a success toast and `/saved/{uuid}/view` (`packages/e2e/cypress/e2e/app/space.cy.ts:41-48`, `:78-83`). Preserve both semantic readiness checks before parsing identifiers.
- The explore fields are not initially guaranteed to be rendered. A normal `scrollIntoViewIfNeeded` cannot locate an unmounted virtual row; the port needs a file-local bounded scroll/poll routine against `virtualized-tree-scroll-container`, modeled on `packages/e2e/cypress/support/commands.ts:773-826`, with a clear failure bound.
- Typing the private space name deliberately uses a 50 ms key delay (`packages/e2e/cypress/e2e/app/space.cy.ts:35-38`). No debounce is documented, so Playwright should first try normal `fill`; retain delayed typing only if runtime evidence shows the component requires key events.
- The dashboard create/delete test uses unconditional 1.5-second sleeps before and after browser-back navigation (`packages/e2e/cypress/e2e/app/space.cy.ts:342-345`). Replace these with a confirmed created-dashboard URL/readiness signal, `goBack()` navigation completion, the named resource becoming visible, and final deletion/disappearance confirmation.
- There are no `cy.intercept` aliases. All UI requests rely on DOM/URL retrying. Add response waits only for the exact mutation initiated by the click; avoid page-wide request races.
- Negative checks need a loaded anchor before asserting absence. The All Spaces check already finds Jaffle shop before its negative assertion (`packages/e2e/cypress/e2e/app/space.cy.ts:139-142`); the Browse-menu negative check does not (`:135-137`) and should wait for the menu/list to be visibly open first.
- Modal Next/Save/Create button enablement matters during chart save (`packages/e2e/cypress/e2e/app/space.cy.ts:61-76`). Use scoped enabled-button assertions, not force clicks.

## Locator and strictness risks

- Most `cy.contains` calls are unscoped and substring-based: `New`, `All`, `Next`, `Create`, `Delete`, `Private space`, and seed names can match navigation, modal, toast, or hidden content. Playwright strict mode will expose ambiguity. Scope to the active dialog/menu/resource list and prefer `getByRole(..., { name, exact: true })`.
- `.mantine-8-Modal-body` is a generated/versioned CSS class (`packages/e2e/cypress/e2e/app/space.cy.ts:61-75`). Replace it with the active dialog role and named controls.
- Stable application test ids exist for the Add button (`packages/frontend/src/pages/Space.tsx:260-271`), dashboard Next, chart name, virtualized tree, and resource menus. The resource action menu test id embeds the raw item name (`packages/frontend/src/components/common/ResourceView/ResourceActionMenu.tsx:290-300`); random unique names keep it usable, but an accessible row-scoped Menu button is preferable.
- Root and child names may appear in breadcrumbs, nav, resource cards, and modal selectors. Constrain spaces-page expectations to the resource list, and dashboard-selector expectations to the open dialog.
- `cy.contains('Private space').should('not.exist')` checks a generic prefix, not the exact created name (`packages/e2e/cypress/e2e/app/space.cy.ts:135-142`). The port should retain the generated full name and assert that exact name is absent.
- The omnibar close check reads all body text and sends Escape to `body` (`packages/e2e/cypress/e2e/app/space.cy.ts:25-30`). Prefer checking a visible omnibar dialog/input and pressing Escape there; body text can contain stale or unrelated `Search Jaffle shop` text.
- `cy.contains(/^Orders$/)` is already exact (`packages/e2e/cypress/e2e/app/space.cy.ts:53`). Preserve exact matching for explore and field labels.
- The admin filter is a segmented control whose visible labels are `Shared with me` and `Admin Content View` (`packages/frontend/src/components/common/ResourceView/AdminContentViewFilter.tsx:41-84`). Locate the exact control rather than arbitrary page text.

## Nonstandard or surprising behavior

- `createPrivateSpace` mixes UI setup with a direct dashboard API POST and captures UUIDs by parsing browser URLs into mutable outer variables (`packages/e2e/cypress/e2e/app/space.cy.ts:15-20`, `:43-47`, `:79-100`). The Playwright helper should return validated identifiers directly and fail clearly if URL parsing fails.
- `loginWithPermissions` is named like a login helper but never explicitly logs in as the generated user. It relies on invitation registration establishing that user's session (`packages/e2e/cypress/support/commands.ts:334-354`), after redundantly restoring admin login even though this test is already admin-authenticated.
- The new user is expected to see a role-completion modal and chooses `Product` before permission checks (`packages/e2e/cypress/e2e/app/space.cy.ts:129-133`). This onboarding mutation is part of setup, not the feature assertion.
- The active admin/editor “Tree view” tests inspect the space picker inside an unfinished dashboard-creation flow rather than the spaces page (`packages/e2e/cypress/e2e/app/space.cy.ts:197-220`, `:253-269`). They intentionally do not create dashboards.
- The two skipped admin spaces-page tests have no nearby reason, issue, or expiry (`packages/e2e/cypress/e2e/app/space.cy.ts:174-195`). Their behavior is substantially duplicated by the active dashboard-selector test, but removal cannot be concluded without ownership clarification.
- The source disables `no-restricted-syntax` to use `for...of` (`packages/e2e/cypress/e2e/app/space.cy.ts:1`, `:144-152`). Playwright can use data-driven loops or grouped assertions without a shared abstraction.
- No downloads/uploads, popups, iframes, clipboard, drag-and-drop, browser timezone API, Monaco, canvas/SVG assertion, or external service interaction occurs. The only special rendering mechanic is the virtualized explore tree.

## Coordination requirements

- `isolated-e2e-database`: provision a database/preview reset boundary for this mutating file before dual-running Cypress and Playwright. The private-content test has no teardown, and generated users/content survive successful runs (`packages/e2e/cypress/e2e/app/space.cy.ts:15-155`). One Playwright worker (`packages/e2e/playwright.config.ts:13`) prevents only intra-Playwright concurrency; it does not isolate Cypress or other jobs.
- The coordinator must define whether isolation means a dedicated preview/database per runner or a reset before each authoritative run. Do not run Cypress and Playwright versions concurrently against the same seed project until that contract exists.
- No shared code helper is proven necessary. Keep role login, dynamic-member provisioning, URL parsing, and virtual-tree scrolling local to `space.spec.ts`; this assigned file alone is evidence for them. Existing shared admin authentication can remain unchanged.
- Tests have no intended cross-test ordering dependency. Preserve independent contexts and fresh authentication per test/describe; do not rely on the persistent private content created by the first test. The common dependency is only immutable seeded users/project/tree.
- The read-only role-visibility tests could technically use a shared preview, but splitting execution infrastructure for subsets of one target is not justified while the same target also mutates shared state.

## Exact port plan

1. Create only `packages/e2e/playwright/app/space.spec.ts`; do not change shared config/auth/helpers for this port.
2. Import `SEED_PROJECT`, `SPACE_TREE_1`, `SPACE_TREE_2`, and seeded role credentials from `@lightdash/common`. Define test data and small helpers locally; use UUID/random suffixes for resource names and the invited email rather than millisecond-only uniqueness.
3. Keep the existing admin storage state for admin tests. For editor/viewer tests, clear the test context's cookies and POST `/api/v1/login` through `browserContext.request`, assert success and `/api/v1/user`, then use the page from that same context. Do not add global editor/viewer storage files for this one spec.
4. Port `createPrivateSpace` as a local async helper: close the omnibar only if visibly open; create a restricted space; assert its exact name and UUID URL; create the chart through the Orders virtualized tree; assert modal state, save toast, and saved-chart URL; create the dashboard through the admin context request and validate the 201 response shape; return exact name/UUID values.
5. Implement a file-local bounded virtual-tree scroll helper for the two explore fields. Scroll the known container incrementally and poll for an exact rendered label; include a finite attempt/position bound and diagnostic failure.
6. In the private-content test, provision the invite and project access with the admin request context, register/verify in a separate clean member browser context, complete onboarding there, and perform both DOM absence checks and the three exact 403 requests from that member context. Keep admin and member cookie jars separate instead of replacing one page's session implicitly.
7. Port admin/editor/viewer space visibility as role-scoped Playwright describes. Scope text assertions to the spaces resource view. Scope dashboard tree assertions to the active creation dialog and close/cancel the unfinished modal after assertions.
8. Carry the two skipped admin tests as explicit `test.skip` entries only if migration policy requires one-to-one inventory; annotate that the Cypress source gives no reason. Do not activate or delete them until the owner answers the skip-history question.
9. Port editor create/delete flows with exact generated names. For space deletion, assert the confirmation dialog and final disappearance. For dashboard deletion, remove both sleeps, wait for created-dashboard navigation/readiness, navigate back deterministically, delete from the named resource row, and assert the dialog closes plus the resource disappears.
10. Track resources created by mutating tests and use `try/finally` cleanup through an established authenticated API only where endpoint behavior is confirmed during implementation. Because invited-user cleanup is not established by the source, retain the isolated-database gate even if content cleanup is added.

## Verification plan

Run against the coordinator-provided isolated/reset preview; do not dual-run on a shared database.

```bash
# Authoritative Cypress baseline (isolated database)
pnpm -F e2e cypress:run -- --spec cypress/e2e/app/space.cy.ts

# Focused Playwright port
pnpm -F e2e playwright:run -- playwright/app/space.spec.ts --project=firefox

# Type, lint, and format checks for the target
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/space.spec.ts
pnpm -F e2e formatter ./playwright/app/space.spec.ts --check

# Full Playwright regression after focused success
pnpm -F e2e playwright:run
```

Expected focused inventory is 10 passed and 2 skipped, unless owners explicitly decide to remove or re-enable the two source skips. Repeat the focused Playwright command once on a freshly reset isolated database to expose leaked-state/order assumptions; do not use retries to mask failures.

## Open questions

1. Why are the two admin spaces-page tests skipped at `packages/e2e/cypress/e2e/app/space.cy.ts:174-195`? Are they obsolete duplicates, known product failures, or coverage that should be re-enabled?
2. Is there an approved API/fixture for deleting the dynamically invited user and all private content, or is database reset the intended cleanup contract? The source provides none.
3. Is the `Select your role` onboarding modal and `Product` option guaranteed for invite registration, or should test setup complete the profile by API before testing space permissions?
4. Which exact network/UI signal is authoritative for dashboard creation and deletion? The source uses fixed sleeps and never verifies deletion (`packages/e2e/cypress/e2e/app/space.cy.ts:342-352`); identify the request during implementation rather than guessing.
5. Should the three direct 403 assertions remain integrated with the UI scenario, or does the API-test owner already cover these authorization contracts independently? The UI absence assertions still require Playwright.

## Port history

Not started.

### 2026-07-20 — static port implementation

- Target: `packages/e2e/playwright/app/space.spec.ts`.
- Ported exactly the 10 active browser contracts. The two direct Cypress `it.skip` cases were not copied or activated, per the port contract and owner disposition.
- Added only the three approved `@mutating` tags: private-content authorization, space create/delete, and dashboard create/delete.
- Added independent admin/editor/viewer/member contexts, exact seeded identity checks, separate private-flow cookie jars, strict local JSON/UUID parsing, bounded render-synchronized virtual-tree scrolling, exact dialog/tree/row locators, cancellation of unfinished dashboard dialogs, response/URL UUID capture, and fresh disposable admin API fallback cleanup with UUID-specific absence/404 verification.
- Static verification after fixes:
  - `pnpm -F e2e typecheck:playwright` — passed.
  - `pnpm -F e2e linter ./playwright/app/space.spec.ts` — passed.
  - `pnpm -F e2e formatter ./playwright/app/space.spec.ts --check` — passed.
  - Scope/inventory checks — 10 tests, exactly 3 `@mutating`; forbidden-pattern scan clean; Cypress source unchanged; owned-path scope clean; `git diff --check` passed before this history append.
- Iteration evidence: the first static pass exposed browser `Response` versus `APIResponse` typing, 17 ESLint findings, and formatting drift. These were fixed with a shared response protocol, recursive bounded scrolling, capture callbacks, destructuring, and oxfmt; the final static pass is green.
- Runtime risk: no Playwright, Cypress, browser discovery, or API mutation command was run because the sole mutation lease has not been granted. Live selector semantics, onboarding-modal availability, response timing, and cleanup behavior remain execution-gated.
- Commit: pending (not staged or committed by instruction).

### 2026-07-20 — execution lease verification

- Runtime repairs stayed within `packages/e2e/playwright/app/space.spec.ts`: dialogs are scoped by role plus exact rendered title because the live Mantine dialog has no accessible name; resource rows use exact rendered names because link accessible names include count metadata; admin tests establish fresh exact admin identities; Save Chart uses keyboard activation to avoid the ambient-AI hover side effect while preserving empty-name validation; the visible `All` segment is clicked instead of its hidden radio; and member setup follows the parsed `isSetupComplete` response while still API-logging in and validating the exact dynamic identity. In this environment, absent Rudder configuration intentionally makes new users setup-complete.
- Playwright execution (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`, Firefox, one worker, direct `pnpm -F e2e exec playwright test`):
  - Focused `playwright/app/space.spec.ts` — 11 passed (setup + 10 active ports).
  - `playwright/app/space.spec.ts --repeat-each=3` — 31 passed (setup + all 10 ports repeated three times).
  - `playwright/app/space.spec.ts --grep @mutating` — 4 passed (setup + exactly 3 mutation-tagged tests).
  - Full branch Firefox — 16 passed.
- Unchanged Cypress parity command: `CYPRESS_BASE_URL=http://127.0.0.1:3000 pnpm -F e2e exec cypress run --spec cypress/e2e/app/space.cy.ts` — 12 tests: 9 passing, 2 pending direct skips, 1 failing after all 3 configured attempts. The sole failure is `Space > Another non-admin user cannot see private content` at source line 131: the unchanged source requires the `Select your role` onboarding control, while this no-Rudder environment creates invitees with `isSetupComplete: true`, so the modal is correctly absent. Cypress screenshots for all three attempts and command output establish the same root cause. Per supervisor disposition this is a documented legacy-parity failure, not a replacement blocker; Cypress remains unchanged and authoritative.
- Exact Cypress retry cleanup:
  - Attempt 1: space `f7043fb1-e72f-4677-93aa-63a1219c573e`, chart `2f532d1d-3d5b-4c3b-8209-86badf4da9ca`, dashboard `337fd6a0-6898-4c0c-afd5-fe45203a5c62`, user `76472367-182b-41ce-bd10-7c9d805bb307`, email `demo+member-1784559652822@lightdash.com`.
  - Attempt 2: space `1cf04d99-f6c6-407e-8be3-39ed5fe67707`, chart `ea336094-7fd2-48ae-934a-6d07b9de4e4d`, dashboard `15c248a4-b89e-48c1-a516-8fbe48b5d029`, user `f563d213-9e59-49d2-9ebf-ae82f7eaae6f`, email `demo+member-1784559676895@lightdash.com`.
  - Attempt 3: space `edce2251-80d8-4f37-b29b-174f727ebad9`, chart `d7b6f43b-0712-4f58-93f7-42c13f1ad85f`, dashboard `8884ca01-a898-4fc5-ad3d-c06001abbd4a`, user `301b52d3-7e93-47ea-ae32-41726145e81a`, email `demo+member-1784559701572@lightdash.com`.
  - Each exact content UUID, project access, and user was deleted through the authenticated API; every exact content/user/access GET returned 404 afterward, and each exact email count is zero.
- Final static verification passed: `pnpm -F e2e typecheck:playwright`; targeted ESLint; targeted oxfmt check.
- Final resource audit: zero active `Private space/chart/dashboard`, `PW space/dashboard`, `TS`, or `TD` resources; zero `space-member-*`/`demo+member-*` users and project accesses; all four seed users remain active. The only run-owned rows are expected soft-delete tombstones (14 private spaces, 8 PW spaces, 1 Cypress TS space, 12 private charts, 12 private dashboards, 8 PW dashboards, 1 Cypress TD dashboard). All 56 exact run-owned resource UUIDs return 404.
- Commit: pending (not staged or committed by instruction).
