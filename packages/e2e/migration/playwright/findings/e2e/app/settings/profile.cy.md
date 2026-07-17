# packages/e2e/cypress/e2e/app/settings/profile.cy.ts

## Classification

Recommended runner: Playwright
Execution lane: Exclusive mutating lane for the seeded organization-1 admin
Active tests: 1
Skipped tests: 0
Persistent mutation: Yes — updates the seeded admin's first and last names in PostgreSQL
Shared-preview dual-run safe: No
Difficulty total: 8/18
Coordination keys: `seed-user:b264d83a-9000-426a-85ec-3f9c20f368ce`, `user-profile:demo@lightdash.com`
Analysis status: coordination-required

The behavior needs a browser: it covers navbar-menu navigation, populated/enabled form controls, form submission feedback, and refreshed avatar initials (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:27-62`). API setup/cleanup should remain API-driven, but moving the whole test to API tests would lose the UI behavior.

Difficulty breakdown:

- persistent/shared state: 3 — the test rewrites the globally seeded admin row before, during, and after the test (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:3-15`, `packages/e2e/cypress/e2e/app/settings/profile.cy.ts:18-25`, `packages/backend/src/models/UserModel.ts:530-546`).
- browser interaction complexity: 1 — one menu, three standard text inputs, one submit button, one toast, and one avatar assertion.
- environment/external dependencies: 1 — requires the app/backend/database and non-demo mode, but no warehouse or required third-party service (`packages/e2e/cypress.config.ts:23-33`, `packages/backend/src/controllers/authentication/middlewares.ts:48-53`).
- synchronization/flakiness: 2 — the source uses three fixed 500 ms waits and the success callback waits for an email-status refetch (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:36-52`, `packages/frontend/src/hooks/user/useUserUpdateMutation.ts:33-40`).
- authentication/authorization: 1 — authenticated active-user access is required, using the shared seeded admin session; there is no admin-role check on the update route (`packages/e2e/cypress/support/commands.ts:152-172`, `packages/backend/src/routers/userRouter.ts:9-16`, `packages/backend/src/controllers/authentication/middlewares.ts:21-45`).
- cross-file infrastructure: 0 — existing Playwright authentication and built-in `request`/`page` fixtures are sufficient (`packages/e2e/playwright/auth.setup.ts:10-24`, `packages/e2e/playwright.config.ts:28-40`).

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
| --- | --- | --- | --- | --- | --- |
| `Settings - Profile should update user names` | Active; neither the test nor its enclosing `describe` is skipped (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:17-27`) | Logs in as the seeded admin, resets the profile, opens User settings through the avatar menu, checks the seeded email/name values, changes the names to Kevin Space, submits, checks the success toast, reloads home, and checks initials `KS` (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:18-62`) | PATCH reset to David Attenborough before and after; UI PATCH to Kevin Space (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:3-15`, `packages/e2e/cypress/e2e/app/settings/profile.cy.ts:21-24`, `packages/frontend/src/hooks/user/useUserUpdateMutation.ts:14-19`) | Three hard 500 ms waits, explicit blur calls, Mantine portal menu, async toast after email-status refetch | `packages/e2e/playwright/app/settings/profile.spec.ts` |

There are no skipped tests, inherited skips, skip comments, or removal candidates in this file.

## Cypress command expansion

### Repository custom command

- `cy.login()` at `packages/e2e/cypress/e2e/app/settings/profile.cy.ts:19` is implemented at `packages/e2e/cypress/support/commands.ts:152-173`.
  - It keys `cy.session` by `demo@lightdash.com`.
  - On a cache miss it POSTs `api/v1/login` with the seeded admin email/password and requires status 200 (`packages/e2e/cypress/support/commands.ts:153-166`).
  - On a cache hit it validates the session with GET `api/v1/user`, also requiring status 200 (`packages/e2e/cypress/support/commands.ts:167-170`).
  - The corresponding Playwright project already creates the same authenticated storage state with POST `/api/v1/login`, validates GET `/api/v1/user`, and writes `.auth/admin.json` (`packages/e2e/playwright/auth.setup.ts:10-24`, `packages/e2e/playwright/auth.ts:1-5`). No new login helper is needed.

### Local helper

- `resetUserName()` is local rather than a registered Cypress command. It PATCHes `api/v1/user/me` with seeded first name, last name, and email (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:3-15`). Cypress implicitly fails `cy.request` on a non-2xx response; the Playwright port should make this contract explicit with `expect(response).toBeOK()`.

### Testing Library commands

- `findByTestId`, `findByRole`, `findByPlaceholderText`, and `findByText` are provided by the package-level `@testing-library/cypress/add-commands` registration (`packages/e2e/cypress/support/commands.ts:39`) and dependency `@testing-library/cypress` (`packages/e2e/package.json:22-25`); there is no local command implementation to expand.
- Map them to Playwright `getByTestId`, `getByRole`, `getByLabel`, and `getByText`. Prefer labels over placeholders because the application supplies matching accessible labels for all three inputs (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:134-164`).

All other Cypress calls in the source (`request`, `session`, `visit`, `click`, `should`, `wait`, `clear`, `type`, and `blur`) are built-ins.

## State, seed, and environment assumptions

### Authentication and authorization

- The test uses organization-1 admin user UUID `b264d83a-9000-426a-85ec-3f9c20f368ce`, seeded as David Attenborough with primary email `demo@lightdash.com` and password `demo_password!` (`packages/common/src/index.ts:465-481`).
- The update endpoint requires an authenticated, active user and rejects unauthenticated/deactivated sessions (`packages/backend/src/routers/userRouter.ts:9-16`, `packages/backend/src/controllers/authentication/middlewares.ts:21-45`). It does not require an admin permission, even though this test authenticates as admin.
- The endpoint also uses `unauthorisedInDemo`, so the target must not run against a `LightdashMode.DEMO` backend (`packages/backend/src/routers/userRouter.ts:9-13`, `packages/backend/src/controllers/authentication/middlewares.ts:48-53`).
- Playwright's Firefox project depends on the admin auth setup and loads its storage state (`packages/e2e/playwright.config.ts:28-40`). The test should consume that existing state rather than log in again.

### Persistent state and cleanup

- The PATCH changes the shared user's database row transactionally, including `updated_at`, then invalidates the per-process user-session cache (`packages/backend/src/models/UserModel.ts:530-546`, `packages/backend/src/models/UserModel.ts:574-579`).
- `beforeEach` repairs dirty names before assertions, and `afterEach` restores them after success or ordinary test failure (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:18-25`). A killed worker can still leave Kevin Space behind; the next ordinary run repairs it in `beforeEach`.
- Names are not unique, so `Kevin Space` itself has no duplicate-name constraint risk. The reset also writes the canonical email. Normally it is unchanged; if another suite has changed it, the service treats restoration as an email change and may send a one-time passcode (`packages/backend/src/services/UserService.ts:1467-1471`, `packages/backend/src/services/UserService.ts:1516-1518`).
- No prior suite ordering is required when the setup succeeds. There are no aliases, fixtures, or state shared between tests inside this file.

### Requests and response assumptions

- Authentication: POST `api/v1/login` and validation GET `api/v1/user`, both expected to return 200 (`packages/e2e/cypress/support/commands.ts:152-170`).
- Setup/cleanup: PATCH `api/v1/user/me`; the body is the canonical seeded names/email (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:3-15`).
- Page bootstrap relevant to this flow includes GET `/api/v1/health?skipMigrationCheck=true` and GET `/api/v1/user` (`packages/frontend/src/hooks/health/useHealth.tsx:10-15`, `packages/frontend/src/hooks/user/useUser.ts:16-25`).
- Profile rendering also requests email status and the timezone feature flag (`packages/frontend/src/hooks/useEmailVerification.ts:11-17`, `packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts:10-22`). No email is sent in the normal path because the test preserves the seeded email.
- UI submit PATCHes `/api/v1/user/me` with the form data (`packages/frontend/src/hooks/user/useUserUpdateMutation.ts:14-19`). The route returns the updated user (`packages/backend/src/routers/userRouter.ts:14-21`).
- After PATCH success, the frontend replaces the cached `['user']` data with the response and refetches email status before invoking the toast callback (`packages/frontend/src/hooks/user/useUserUpdateMutation.ts:33-40`).
- The test does not depend on a warehouse, object storage, dbt, downloads, or a third-party API. The service emits a `user.updated` analytics event, but test correctness does not depend on delivery (`packages/backend/src/services/UserService.ts:1504-1514`); Cypress blocks common analytics hosts (`packages/e2e/cypress.config.ts:27-33`).

### Runtime configuration

- Cypress uses `http://localhost:3000`, a 10 s command timeout, and two run-mode retries by default (`packages/e2e/cypress.config.ts:12-26`).
- Playwright uses `PLAYWRIGHT_BASE_URL` or `http://localhost:3000`, 10 s action/assertion timeouts, a 30 s navigation timeout, one worker, and CI-only retries (`packages/e2e/playwright.config.ts:4-26`).

## Synchronization and timeout requirements

- The source waits 500 ms before editing first name, between the two name edits, and before submit (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:36-52`). The only rationale recorded is typing flakiness between inputs (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:44`). These are not evidence of an application debounce: the Mantine form receives ordinary input props and submits via `form.onSubmit` (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:60-82`, `packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:122-125`).
- Replace fixed sleeps with Playwright auto-waiting: assert each labeled textbox is enabled and has its seeded value, then use `fill`. `fill` supplies a complete value and does not need `click`, `clear`, character-by-character `type`, or `blur` unless blur is itself under test; it is not asserted here.
- The Update button is disabled until the form is dirty and shows loading while the mutation runs (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:219-231`). Wait for it to become enabled before clicking.
- Start a method-and-path-specific `page.waitForResponse` for PATCH `/api/v1/user/me` before clicking Update, assert the response is OK, then assert the success toast. Do not use `networkidle`: unrelated page requests are not part of the contract.
- The toast does not appear immediately at PATCH completion: the mutation updates the user cache and awaits the email-status refetch before calling the profile panel's success callback (`packages/frontend/src/hooks/user/useUserUpdateMutation.ts:33-40`, `packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:97-102`). The existing 10 s Playwright expectation timeout should be sufficient; no custom timeout is evidenced.
- After `page.goto('/')`, wait on the avatar text assertion. This verifies the persisted update through a fresh document load rather than only the mutation's in-memory query-cache update.

## Locator and strictness risks

- `data-testid="user-avatar"` is a deliberate application locator (`packages/frontend/src/components/UserAvatar.tsx:18-34`). Use `page.getByTestId('user-avatar')`; Playwright strictness will expose an unexpected duplicate rather than silently choosing one.
- `User settings` is an explicit `role="menuitem"` rendered in a Mantine portal (`packages/frontend/src/components/NavBar/UserMenu.tsx:20-43`). A page-scoped `getByRole('menuitem', { name: 'User settings', exact: true })` is appropriate after opening the menu.
- The source's placeholder locators are workable but less semantic. The fields have exact labels `First name`, `Last name`, and `Email`; use `getByLabel(..., { exact: true })` (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:134-164`).
- `Update` is a form-submit button and should be unique in the profile panel (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:219-231`). If future settings content introduces another Update button, scope it to the form/card headed `Profile settings` rather than adding `.first()`.
- The toast string is emitted exactly by the profile panel (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:97-102`). Use exact text to avoid substring ambiguity.
- The avatar computes initials from the first characters of current first/last names (`packages/frontend/src/components/UserAvatar.tsx:11-16`). Preserve the source's containment assertion (`toContainText('KS')`) rather than depending on Mantine's internal avatar markup.

## Nonstandard or surprising behavior

- Clicking User settings links to `/generalSettings`, not directly to `/generalSettings/profile` (`packages/frontend/src/components/NavBar/UserMenu.tsx:36-43`). The settings wildcard redirects to the profile route (`packages/frontend/src/pages/Settings.tsx:206-209`). The port should expect the final profile URL.
- The test deliberately sends the unchanged email in setup/cleanup and checks that email is editable (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:6-13`, `packages/e2e/cypress/e2e/app/settings/profile.cy.ts:32-34`); it does not test an email change or email verification.
- A timezone feature flag can add another form control (`packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:55-58`, `packages/frontend/src/components/UserSettings/ProfilePanel/index.tsx:204-217`). The name locators remain unambiguous, and submission carries the existing timezone value.
- There are no aliases, intercepts, custom timeouts, uploads/downloads, popups, iframes, clipboard operations, canvas/SVG assertions, Monaco, virtualization, drag-and-drop, timezone calculations, or direct browser API use.

## Coordination requirements

- Cypress and Playwright must not execute this test concurrently against the same preview/database. Both authenticate as the same seeded user; either runner's setup/cleanup can reset names while the other is checking initial values, waiting for the toast, or asserting `KS`.
- Playwright's `workers: 1` only serializes Playwright tests (`packages/e2e/playwright.config.ts:9-13`); it does not serialize a separate Cypress process.
- Schedule under both coordination keys in Classification, or disable the Cypress copy before enabling the Playwright copy in a shared-preview lane. Sequential Cypress-then-Playwright parity runs are safe because each performs setup and cleanup.
- No shared Playwright helper is justified for this one local reset operation. Keep a small reset function in the target spec and use the existing admin auth setup.

## Exact port plan

1. Create only `packages/e2e/playwright/app/settings/profile.spec.ts` for the port; do not add shared fixtures or change auth/configuration.
2. Import `SEED_ORG_1_ADMIN` and `SEED_ORG_1_ADMIN_EMAIL` from `@lightdash/common`, plus `expect` and `test` from `@playwright/test`.
3. Add a file-local async reset function that PATCHes `/api/v1/user/me` through the authenticated Playwright `request` fixture with the same three-field body as the Cypress helper, then asserts `toBeOK()`.
4. Register `test.beforeEach` and `test.afterEach` to call that reset function. Keep cleanup in `afterEach`, not at the end of the test body.
5. Port one test named `should update user names`:
   - navigate to `/`;
   - open `getByTestId('user-avatar')` and click the exact User settings menu item;
   - expect the final URL to be `/generalSettings/profile`;
   - assert exact labeled Email, First name, and Last name controls are enabled and contain the seed values;
   - `fill('Kevin')` and `fill('Space')` without fixed sleeps;
   - expect Update enabled;
   - arm a PATCH `/api/v1/user/me` response wait, click Update, and assert the response is OK;
   - assert the exact success toast;
   - navigate to `/` and assert the avatar contains `KS`.
6. Keep the test in Playwright rather than API tests because menu navigation, form state, toast behavior, and refreshed initials are the tested contract. Do not split out an API-only test.

## Verification plan

Run from repository root, with the app/backend/database already available. Do not run Cypress and Playwright concurrently against the same database.

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e linter ./playwright/app/settings/profile.spec.ts
pnpm -F e2e formatter ./playwright/app/settings/profile.spec.ts --check
pnpm -F e2e exec playwright test playwright/app/settings/profile.spec.ts --project=firefox
```

For sequential source/target parity while the Cypress source still exists:

```bash
pnpm -F e2e exec cypress run --spec cypress/e2e/app/settings/profile.cy.ts
pnpm -F e2e exec playwright test playwright/app/settings/profile.spec.ts --project=firefox
```

After either run, verify the seeded profile is restored through the authenticated API or by rerunning the Playwright test; do not introduce a concurrent dual-run check because the shared mutation is inherently unsafe.

## Open questions

- Does the migration scheduler already provide an exclusive lock for `demo@lightdash.com` profile mutations, or must this coordination key be added before enabling the target?
- Will the target ever run against a backend configured as `LightdashMode.DEMO`? If yes, the PATCH is intentionally forbidden and that lane cannot host this test (`packages/backend/src/controllers/authentication/middlewares.ts:48-53`).
- Should menu-to-profile routing remain part of this profile test? The source explicitly covers it (`packages/e2e/cypress/e2e/app/settings/profile.cy.ts:28-30`); the plan preserves it unless migration scope says navigation is covered elsewhere.

## Port history

Not started.
