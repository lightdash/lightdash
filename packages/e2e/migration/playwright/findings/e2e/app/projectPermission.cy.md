# packages/e2e/cypress/e2e/app/projectPermission.cy.ts

## Classification

- Recommended runner: unit-or-remove; the permission behavior is mostly already in API tests, and the skipped UI smoke assertions need an explicit keep/remove decision before any Playwright port.
- Execution lane: unit-or-remove
- Active tests: 0
- Skipped tests: 5 (all inherit `describe.skip` at `packages/e2e/cypress/e2e/app/projectPermission.cy.ts:4`)
- Persistent mutation: none while skipped; if enabled, four invited users plus their emails/passwords/org memberships/verification state, one project-access grant, invite/OTP state, and sessions are created without cleanup (`packages/e2e/cypress/support/commands.ts:335-353`).
- Shared-preview dual-run safe: No if enabled or ported. Cypress and another runner can create the same role-and-millisecond email, and all generated users remain in the shared database (`packages/e2e/cypress/support/commands.ts:339-351`). The currently skipped Cypress suite itself is inert.
- Difficulty total: 12/18 — persistent/shared state 3, browser interaction 1, environment/external dependencies 2, synchronization/flakiness 2, authentication/authorization 3, cross-file infrastructure 1.
- Coordination keys: none for the recommended remove/API-triage path; require a shared-preview auth-user isolation decision if a browser port is requested.
- Analysis status: clarification-required

The file's own skip comment says to move it to API tests or remove it if API coverage already exists (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:3-4`). Existing API coverage already checks a member with editor project access (`packages/api-tests/tests/projectPermissions.test.ts:339-390`) and a member with no project access (`packages/api-tests/tests/projectPermissions.test.ts:1110-1158`). Because all five cases have long been skipped, a Playwright port would introduce new browser coverage rather than preserve active coverage.

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Organization admin can see projects` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:5-12`) | Skipped via parent | Restores the seeded org-admin session, visits the seeded project home, and expects a settings control, global `Browse` text, and the seeded first name David. | Session only; no durable domain mutation. | API login through `cy.session`; rendered navbar/home assertions. | Remove as skipped smoke coverage unless the settings-menu contract is explicitly wanted. If wanted, cover the menu's ability branches in a focused frontend unit test rather than copy the unrelated greeting and Browse assertions. |
| `Organization members without project permission cannot see projects` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:14-19`) | Skipped via parent | Creates a member with no project grant and expects the project home to render “You don't have access.” | Creates/invites/verifies a user and related auth state; no cleanup. | Registration changes the current authenticated session; forbidden UI appears after project data loading. | Remove: API coverage already expects 403 from `GET /projects/{seedUuid}` for this exact role shape (`packages/api-tests/tests/projectPermissions.test.ts:1110-1158`). Keep a browser case only if rendering `ForbiddenPanel` is a separately required contract. |
| `Organization members with project permission can see project` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:21-33`) | Skipped via parent | Creates an org member with editor access to the seed project; expects no settings menu, Browse, and greeting for first name `test`. | Creates/invites/verifies a user and grants editor access to the seed project; no cleanup. | Dynamic identity plus pending-email project grant before registration. | Remove: API coverage already creates a member/editor-project user and expects project endpoints to return 200 (`packages/api-tests/tests/projectPermissions.test.ts:339-390`). A menu-only unit test is optional pending clarification. |
| `Organization editors without project permission can still see projects` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:34-41`) | Skipped via parent | Creates an org editor with no explicit project grant; expects project access, no settings menu, Browse, and greeting. | Creates/invites/verifies a user; no cleanup. | Tests additive org-level authorization despite an empty project-grant list. | API tests if this policy is not already covered: add a focused `GET /api/v1/projects/{seedUuid}` 200 assertion for a dynamically created org editor in `packages/api-tests/tests/organizationPermissions.test.ts`; do not retain generic home smoke assertions. |
| `Organization admins without project permission can still see projects` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:43-50`) | Skipped via parent | Creates an org admin with no explicit project grant; expects project access, settings menu, Browse, and greeting. | Creates/invites/verifies a user; no cleanup. | Tests additive org-level authorization and admin-only settings visibility. | API tests for the project-access policy if missing; optionally a focused SettingsMenu unit test for the browser-only ability branch. Do not port the greeting/Browse smoke assertions. |

There are no active tests, nested skips, hooks, aliases, or explicit cleanup in this file. There is no declared dependence on test order or a prior spec. If the parent skip were removed, each dynamic case starts by restoring the admin session before creating its own user (`packages/e2e/cypress/support/commands.ts:335-341`), so logical setup does not depend on the preceding case; only accumulated database state is shared.

## Cypress command expansion

- `cy.login()` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:6` and indirectly all `loginWithPermissions` calls):
  - Uses `cy.session` keyed only by seeded admin email (`packages/e2e/cypress/support/commands.ts:152-155`).
  - Session setup sends `POST api/v1/login` with `SEED_ORG_1_ADMIN_EMAIL` and password, requiring status 200 (`packages/e2e/cypress/support/commands.ts:156-165`).
  - Cached-session validation sends `GET api/v1/user`, also requiring status 200 (`packages/e2e/cypress/support/commands.ts:167-170`).
  - Seed credentials are `demo@lightdash.com` / `demo_password!`, and the seeded first name is David (`packages/common/src/index.ts:465-481`).

- `cy.loginWithPermissions(orgRole, projectPermissions)` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:15,22-27,35,44`):
  - First calls `cy.login()` as the seed admin (`packages/e2e/cypress/support/commands.ts:335-337`).
  - Builds `demo+<role>-<Date.now()>@lightdash.com` (`packages/e2e/cypress/support/commands.ts:339`). This is not collision-proof across concurrent processes.
  - Calls `cy.invite`: creates an expiry one day ahead, sends `POST api/v1/invite-links` with role/email/expiry, requires 201, and yields `results.inviteCode` (`packages/e2e/cypress/support/commands.ts:286-302`).
  - For every requested project permission, calls `cy.addProjectPermission`: sends `POST api/v1/projects/<projectUuid>/access` with role, email, and `sendEmail: false`, requiring 200 (`packages/e2e/cypress/support/commands.ts:305-320`). Only the member/editor-project case supplies an entry (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:22-27`).
  - Calls `cy.registerWithCode`: sends `POST api/v1/user` with invite code, first/last name `test`, and password `test1234`, requiring 200 (`packages/e2e/cypress/support/commands.ts:257-271`). The backend calls `req.login`, so registration replaces the admin identity in the current session with the new user (`packages/backend/src/controllers/userController.ts:134-148`).
  - Calls `cy.verifyEmail`: sends `GET api/v1/user/me/email/status?passcode=000000`, requiring 200 (`packages/e2e/cypress/support/commands.ts:274-283`).
  - Wraps the generated email, but this spec does not consume the returned subject (`packages/e2e/cypress/support/commands.ts:350-352`).

- `cy.findByTestId('settings-menu')` is provided by the side-effect import of `@testing-library/cypress/add-commands` (`packages/e2e/cypress/support/commands.ts:46`), not by a repository-local implementation. It targets the explicit `data-testid="settings-menu"` on the settings button (`packages/frontend/src/components/NavBar/SettingsMenu.tsx:51-59`). The component returns no button unless the current user can update either the organization or active project (`packages/frontend/src/components/NavBar/SettingsMenu.tsx:22-39`).

`cy.visit`, `cy.contains`, and `.should` are Cypress built-ins. The global support file imports all commands before specs (`packages/e2e/cypress/support/e2e.ts:15-17`). It also suppresses a class of ResizeObserver exceptions globally (`packages/e2e/cypress/support/commands.ts:128-140`), although this spec has no explicit resize mechanics.

## State, seed, and environment assumptions

- The target project is the deterministic `Jaffle shop` project UUID `3675b69e-8324-4110-bdca-059031aa8da3` (`packages/common/src/index.ts:550-558`). Every case visits `/projects/<that UUID>/home` (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:8,17,29,37,46`).
- The seed must contain org 1, the David admin account, and the seed project associated with that organization. The development seed inserts users, verified emails, passwords, and org memberships (`packages/backend/src/database/seeds/development/01_initial_user.ts:67-117`) and inserts the project for the seed admin/org (`packages/backend/src/database/seeds/development/01_initial_user.ts:186-196`).
- Cypress uses `http://localhost:3000` unless its config is overridden (`packages/e2e/cypress.config.ts:23-26`). The source reads no environment variable directly.
- Hardcoded verification code `000000` assumes DEV/PR OTP behavior; the shared OTP utility documents that those modes use `000000` to avoid a real inbox (`packages/backend/src/utils/oneTimePasscode.ts:19-26`). A production-like backend mode can make `cy.verifyEmail` fail or require email delivery.
- The classic home route fetches `GET /projects/<uuid>`, with React Query retry disabled (`packages/frontend/src/hooks/useProject.ts:49-54,82-94`), plus `GET /org/onboardingStatus` (`packages/frontend/src/hooks/useOnboardingStatus.ts:9-22`) and `GET /projects/<uuid>/most-popular-and-recently-updated` (`packages/frontend/src/hooks/useProject.ts:204-218`). The denial case relies on the project result producing a user ability that cannot view the project, after which `Home` renders `ForbiddenPanel` (`packages/frontend/src/pages/Home.tsx:80-94`).
- Existing API evidence establishes the principal response assumptions: member/no-project receives 403 from the seed project endpoint (`packages/api-tests/tests/projectPermissions.test.ts:1141-1158`), while member/editor-project receives 200 from project endpoints (`packages/api-tests/tests/projectPermissions.test.ts:339-390`).
- The greeting assumes classic homepage rendering and an organization onboarding state with `ranQuery`; `Home` passes `user.firstName` to `LandingPanel` (`packages/frontend/src/pages/Home.tsx:178-191`), which renders `Welcome, <name>!` (`packages/frontend/src/components/Home/LandingPanel/index.tsx:14-25`). Homepage-builder flags can instead redirect home to a dashboard (`packages/frontend/src/pages/Home.tsx:100-109`), so the greeting is feature/configuration-sensitive.
- No project/chart/dashboard names are created, so there is no content duplicate-name risk. Generated email uniqueness relies only on role plus millisecond time; concurrent same-role creation can collide. First/last names intentionally duplicate `test test`.
- There are no downloads, uploads, object storage, warehouse queries, browser popups, iframes, clipboard, canvas/SVG assertions, Monaco, virtualization, drag-and-drop, timezone handling, or direct third-party calls. Registration/verification does rely on the configured authentication/email subsystem, though DEV/PR verification does not require reading a real inbox.

## Synchronization and timeout requirements

- The file has no `cy.intercept`, aliases, fixed sleeps, debounce waits, or explicit timeout overrides. Cypress queues each API setup step before navigation; each custom command asserts its expected response status.
- Cypress's package config gives commands/assertions 10 seconds and run-mode tests two retries by default (`packages/e2e/cypress.config.ts:12-21`). `cy.contains` and `.should` retry until the DOM settles, masking the home page's several asynchronous queries.
- `cy.session` can reuse the admin login across cases, but validates it with `GET api/v1/user` before reuse (`packages/e2e/cypress/support/commands.ts:152-172`). Test isolation must not be replaced with an assumption that the page already holds the correct user: registration explicitly changes the current session (`packages/backend/src/controllers/userController.ts:134-148`).
- A Playwright equivalent must await every setup response and establish the dynamic user's cookies before `page.goto`. It must wait on a role-specific terminal UI state (forbidden heading or visible home heading/navbar), not merely `domcontentloaded`.
- The current Playwright config is serialized (`workers: 1`, `fullyParallel: false`) with 10-second expectations/actions and 30-second navigation (`packages/e2e/playwright.config.ts:6-13,20-26`), but this does not protect a shared preview from another Cypress/API process.

## Locator and strictness risks

- `cy.contains('Browse')` is global and substring-based (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:10,31,39,48`). It can match both the navbar's exact Browse button (`packages/frontend/src/components/NavBar/BrowseMenu.tsx:115-125`) and classic-home copy containing “browse your data” (`packages/frontend/src/components/Home/LandingPanel/index.tsx:23-25`). A strict Playwright text locator may match multiple nodes. If retained, use `page.getByRole('button', { name: 'Browse', exact: true })`.
- `cy.contains('Welcome, David')` and `cy.contains('Welcome, test')` are substring assertions; the actual classic heading includes punctuation and an emoji (`packages/frontend/src/components/Home/LandingPanel/index.tsx:19-22`). Prefer a heading-role assertion such as `/^Welcome, David!/` or `/^Welcome, test!/` only if greeting behavior remains in scope.
- The denial copy should be located as a heading/title, not global text. `ForbiddenPanel` constructs the title `You don't have access` when no subject is passed (`packages/frontend/src/components/ForbiddenPanel.tsx:8-18`).
- `settings-menu` is a unique explicit test id and should remain `page.getByTestId('settings-menu')`. For negative checks, first wait for a terminal home element; otherwise an immediate count of zero can pass while user/project abilities are still loading. The positive/negative condition is “can update Organization or Project,” not literally an org-role-name check (`packages/frontend/src/components/NavBar/SettingsMenu.tsx:22-39`).
- The route is nested under `ProjectLayout`, which renders the navbar before the home outlet (`packages/frontend/src/components/common/ProjectLayout/index.tsx:20-35`); navbar and page content can therefore settle at different times.

## Nonstandard or surprising behavior

- The whole suite is skipped, not merely individual tests (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:3-4`). None of its setup, assertions, or persistent mutations currently execute.
- `loginWithPermissions` is named like a login helper but actually provisions and verifies a durable user. It begins as admin, assigns project access to the email before registration, then relies on registration's `req.login` to switch identity; it never calls `loginWithEmail` (`packages/e2e/cypress/support/commands.ts:335-353`; `packages/backend/src/controllers/userController.ts:134-148`).
- The generated email includes `Date.now()` but no worker/process/random component (`packages/e2e/cypress/support/commands.ts:339`). This lowers ordinary duplicate risk but is insufficient for concurrent shared-preview runners.
- The test titles say “can see projects,” but each test opens one known project directly. They do not assert project-list membership or discovery.
- The settings-menu expectations encode a second policy beyond project visibility. The menu appears when either organization-update or project-update ability is present (`packages/frontend/src/components/NavBar/SettingsMenu.tsx:22-39`), so treating all assertions as one API authorization test would lose that UI contract.
- `Browse` is not a reliable navbar assertion because the classic homepage itself includes lowercase browse copy (`packages/frontend/src/components/Home/LandingPanel/index.tsx:23-25`).

## Coordination requirements

- No shared helper is justified for the recommended API/remove path. `packages/api-tests/helpers/auth.ts:59-102` already provides `loginWithPermissions`, including explicit login as the generated user, and the relevant member permission suites already use it.
- Do not add a Playwright-wide dynamic-role helper solely for this skipped file. If the UI contract is explicitly retained, keep provisioning local to the one target spec unless a coordinator proves multiple migrated specs need the same API/storage-state contract.
- A browser port cannot join `playwright-read-only`: it provisions users and grants project access. It must use an isolated mutation lane or a coordinator-approved unique identity and cleanup contract before sharing a preview with Cypress/API runs.
- No source deletion should happen during dual-run; the migration control plane keeps Cypress authoritative until cleanup. The immediate decision is whether this inert source deserves replacement coverage at all.

## Exact port plan

1. Do not create `packages/e2e/playwright/app/projectPermission.spec.ts` yet. Resolve the source comment's move-or-remove question first (`packages/e2e/cypress/e2e/app/projectPermission.cy.ts:3-4`).
2. Treat the member/no-project and member/editor-project cases as already covered and remove them from the migration queue: `packages/api-tests/tests/projectPermissions.test.ts:339-390,1110-1158` exercises the same live-backend authorization outcomes.
3. In `packages/api-tests/tests/organizationPermissions.test.ts`, confirm or add one parameterized live-API test for dynamically provisioned org roles `editor` and `admin`, each with `[]` project permissions, asserting `GET /api/v1/projects/${SEED_PROJECT.project_uuid}` returns 200. Reuse `loginWithPermissions` from `packages/api-tests/helpers/auth.ts:59-102`; do not create new infrastructure.
4. Do not port the generic `Browse` or greeting assertions. They do not isolate project authorization and are feature-sensitive/ambiguous.
5. Decide separately whether SettingsMenu visibility is a required UI contract. If yes, add a focused frontend component test at `packages/frontend/src/components/NavBar/SettingsMenu.test.tsx` covering: neither update ability => absent; organization update => present; project update => present. If no, document that the skipped browser-only assertions are intentionally retired.
6. Once API coverage and the SettingsMenu decision are accepted, leave this findings history intact and let the later cleanup phase remove the skipped Cypress source. No Playwright manifest entry or shared helper is needed.

If stakeholders instead require the full integrated browser behavior, reclassify to `mutating-isolated`, create only `packages/e2e/playwright/app/projectPermission.spec.ts`, provision role users through local `page.request` setup, and use role/heading locators described above. That is a different, coordination-gated plan—not the recommended default.

## Verification plan

For the recommended API/remove plan after any missing API assertion is added:

```bash
pnpm -F api-tests exec vitest run --config vitest.config.ts tests/projectPermissions.test.ts tests/organizationPermissions.test.ts
pnpm -F api-tests lint
pnpm -F api-tests typecheck
```

If a focused SettingsMenu frontend unit test is approved and added:

```bash
pnpm -F frontend test -- SettingsMenu.test.tsx
pnpm -F frontend lint
pnpm -F frontend typecheck:fast
```

If clarification instead mandates a Playwright port:

```bash
pnpm -F e2e playwright:run -- playwright/app/projectPermission.spec.ts
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/projectPermission.spec.ts
pnpm -F e2e formatter ./playwright/app/projectPermission.spec.ts --check
```

No verification commands were run during discovery, as required by the discovery-only contract.

## Open questions

1. Is settings-menu visibility an intentional browser contract worth activating, or was the entire skipped suite superseded by API authorization tests?
2. Do current API tests already cover the exact “org editor/admin with no explicit project membership can GET the seed project” matrix elsewhere, or should the focused parameterized assertion be added to `organizationPermissions.test.ts`?
3. Can the test environment ever run in a mode other than DEV/PR? If yes, the hardcoded `000000` verification flow is not portable without an email/OTP test contract.
4. Can homepage-builder flags be enabled in the target preview? If yes, `/home` may redirect to a dashboard and cannot reliably support the classic greeting assertions (`packages/frontend/src/pages/Home.tsx:100-109`).
5. If integrated browser coverage is required, what coordinator-owned isolation/cleanup policy permits dynamic user creation against the shared preview?

## Port history

Not started.

### 2026-07-18 — API replacement implemented

- Target: `packages/api-tests/tests/organizationPermissions.test.ts`.
- Replacement: added one read-only test using the seeded organization editor and `SEED_PROJECT`; `GET /api/v1/projects/{projectUuid}` returns 200 without creating a user or project grant.
- Disposition: no Playwright test was added and none of the five skipped Cypress bodies was activated. Existing API tests remain authoritative for member access and denial. Settings-menu, greeting, and `Browse` assertions are intentionally retired.
- Verification:
  - `SITE_URL=http://127.0.0.1:3000 pnpm -F api-tests exec vitest run --config vitest.config.ts tests/organizationPermissions.test.ts` — passed, 50/50 tests.
  - `pnpm -F api-tests lint` — passed with five pre-existing disabled-test warnings in unrelated files.
  - `pnpm -F api-tests typecheck` — passed.
  - `pnpm -F api-tests format` — passed.
- Remaining risk: the focused test requires the standard development seed, including `demo2@lightdash.com` as the organization editor.
- Commit: pending serialized signing lease.
