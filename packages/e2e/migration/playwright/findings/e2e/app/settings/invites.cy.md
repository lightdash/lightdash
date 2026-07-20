# packages/e2e/cypress/e2e/app/settings/invites.cy.ts

## Classification

- Recommended runner: Playwright
- Execution lane: `mutating-isolated`
- Active tests: 2
- Skipped tests: 0
- Persistent mutation: Yes — creates a pending organization user and invite, activates the user, creates email-verification state/session state, then relies on the second test to delete the user.
- Shared-preview dual-run safe: No — the fixed `demo+marygreen@lightdash.com` identity and ordered cleanup collide with Cypress, retries, reruns, or another port run.
- Difficulty total: 14/18 (`persistent/shared state` 3, `browser interaction complexity` 2, `environment/external dependencies` 2, `synchronization/flakiness` 3, `authentication/authorization` 3, `cross-file infrastructure` 1)
- Coordination keys: `isolated-preview-org-user-mutations`
- Analysis status: coordination-required

Both tests require rendered UI and browser session transitions, so they belong in Playwright rather than API tests. The migration control plane explicitly reserves `mutating-isolated` for tests that need a separate database/preview strategy (`packages/e2e/migration/playwright/README.md:38-48`).

## Test inventory

| Test | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should invite user` | Active; parent `describe` is not skipped (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:1,7`) | Admin opens organization user settings, creates an editor invite, extracts the generated URL, logs out, accepts the invite as Mary Green, verifies the disabled invited email, registers with a password, verifies email with `000000`, and checks avatar initials (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:8-40`). | `POST /invite-links` creates or reuses a pending user and upserts an invite (`packages/backend/src/services/UserService.ts:565-645`); `POST /user` activates that user and deletes the invite (`packages/backend/src/services/UserService.ts:368-411`); activation creates an OTP (`packages/backend/src/services/UserService.ts:1851-1866`); logout/login changes server session state. | Reads an absolute URL from a readonly input, changes from admin to anonymous to newly registered user in one browser context, performs a full-page redirect after signup, fills six PinInput children, and depends on DEV/PR fixed OTP behavior. | `packages/e2e/playwright/app/settings/invites.spec.ts` |
| `Should delete user` | Active; parent `describe` is not skipped (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:1,43`) | A fresh admin browser session opens user settings, searches for the user created by the preceding test, opens that row's action menu, confirms deletion, and checks the success toast and disappearance (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:44-66`). | `DELETE /org/user/{userUuid}` removes the user and cascaded user-scoped state (`packages/backend/src/controllers/organizationController.ts:426-451`; `packages/backend/src/services/UserService.ts:511-562`). | Hard-coded 500 ms search wait, virtualized table, icon-class locator, portalled action menu, alert dialog, and an automatically started scheduler-summary request. | Same Playwright file; make setup and cleanup independent from the invite test. |

There are no `it.skip`, `describe.skip`, inherited skips, or skip comments. Both tests should be ported to Playwright; neither is a candidate for removal, CLI/Node, unit, or API-only coverage.

## Cypress command expansion

### `cy.login()`

Called by the `beforeEach` before both tests (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:2-4`). It:

1. Uses `cy.session` keyed by the seeded organization-admin email.
2. Establishes the session with `POST api/v1/login`, sending `SEED_ORG_1_ADMIN_EMAIL.email` and `SEED_ORG_1_ADMIN_PASSWORD.password`.
3. Requires status 200.
4. Validates a restored cached session with `GET api/v1/user`, also requiring status 200 (`packages/e2e/cypress/support/commands.ts:152-172`).

Those constants resolve to `demo@lightdash.com` / `demo_password!` (`packages/common/src/index.ts:474-480`) and are inserted as the organization-one admin by the development seed (`packages/backend/src/database/seeds/development/01_initial_user.ts:137-143`). Playwright already performs the same API login and user validation and writes admin storage state (`packages/e2e/playwright/auth.setup.ts:10-23`); the Firefox project loads that state (`packages/e2e/playwright.config.ts:28-40`). No new shared login helper is required.

### `cy.logout()`

Called only after obtaining the invite URL (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:18-23`). It sends `GET api/v1/logout` (`packages/e2e/cypress/support/commands.ts:323-328`). This is required because an authenticated visitor to the invite page is redirected to `/` (`packages/frontend/src/pages/Invite.tsx:145-151`). In Playwright, perform the logout through the browser context's request context so its cookie jar is updated, then navigate to the invite URL. A subsequent test receives a new context initialized from the unchanged admin storage-state file.

### Testing Library commands

`findAllByTestId`, `findByTestId`, `findByRole`, `findByLabelText`, and `findByPlaceholderText` come from the Cypress Testing Library registration in `packages/e2e/cypress/support/commands.ts:31-32`. They map directly to Playwright `getByTestId`, `getByRole`, `getByLabel`, and `getByPlaceholder`; strictness differences are listed below. `cy.wrap(input).type('0')` is ordinary Cypress wrapping, not a custom command.

## State, seed, and environment assumptions

- The suite assumes the seeded organization-one admin exists and has a valid active project. The settings menu returns `null` without both user and active project and only shows organization settings when the user can update the organization (`packages/frontend/src/components/NavBar/SettingsMenu.tsx:14-38,73-80`).
- Admin permissions must include update/view/manage of organization member profiles and create invite links. Navigation only includes the user-management entry for `update OrganizationMemberProfile` (`packages/frontend/src/hooks/settings/useSettingsNavigation.ts:232-242`); the panel rejects users that cannot view profiles (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/index.tsx:20-30`); action columns require manage permission (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersTable.tsx:260-286`); invite creation is authorization-checked server-side (`packages/backend/src/services/UserService.ts:565-580`).
- The source hard-codes `demo+marygreen@lightdash.com` (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:14-16,29-31,51,66`). Invite creation rejects an already-active user in the organization and an email used by another organization (`packages/backend/src/services/UserService.ts:591-602`). A failed or skipped cleanup therefore poisons retries and future runs.
- The modal defaults the invited role to editor (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/InvitesModal.tsx:30-34`), but the test does not assert the assigned role.
- The user-groups feature flag is assumed enabled because the source clicks `Users & groups`; when disabled, the navigation label is `User management` (`packages/frontend/src/hooks/settings/useSettingsNavigation.ts:232-237`). The route is `/generalSettings/userManagement` in either case.
- Password authentication must be enabled. The password form is omitted when `health.data.auth.disablePasswordAuthentication` is true (`packages/frontend/src/pages/Invite.tsx:132-135,172-184`).
- The generated invite URL is absolute and uses backend `SITE_URL` (`packages/backend/src/models/InviteLinkModel.ts:32-48`). It must resolve to the same isolated preview as `PLAYWRIGHT_BASE_URL`; Playwright defaults to `http://localhost:3000` (`packages/e2e/playwright.config.ts:20-23`), while backend `SITE_URL` has an independent default (`packages/backend/src/config/parseConfig.ts:2302-2304`).
- Invite creation always calls the email client (`packages/backend/src/services/UserService.ts:639-645`), but the test does not require inbox access: it reads the returned invite URL. Button text varies with email-client availability (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/InvitesModal.tsx:64-69`).
- Email verification with six zeroes works only in DEV or PR mode (`packages/backend/src/services/UserService.ts:1851-1858`). Other modes generate a random code, so this test cannot run against arbitrary production-like configuration without an inbox/code retrieval contract.
- The source's first test leaves the browser authenticated as Mary. Cypress test isolation plus the next `cy.login()` restores/recreates the admin session. Playwright's per-test contexts provide the equivalent boundary through admin storage state (`packages/e2e/playwright.config.ts:33-40`).
- No fixture files, seed UUID literals, uploads/downloads, object storage, warehouse, or dbt services are used directly.

### Relevant HTTP behavior

- Admin auth: `POST /api/v1/login` and validation `GET /api/v1/user`, both expected 200 (`packages/e2e/cypress/support/commands.ts:152-170`).
- Create invite: frontend `POST /api/v1/invite-links` with a three-day expiry (`packages/frontend/src/hooks/useInviteLink.tsx:10-31`), controller success status 201 (`packages/backend/src/controllers/inviteLinksController.ts:58-87`). Its success callback refetches organization users before exposing the success toast/state (`packages/frontend/src/hooks/useInviteLink.tsx:64-69`).
- Read invite: public `GET /api/v1/invite-links/{code}` (`packages/frontend/src/hooks/useInviteLink.tsx:35-47`; `packages/backend/src/controllers/inviteLinksController.ts:35-55`).
- Register/activate: `POST /api/v1/user`; success logs the new user into the session and returns 200 (`packages/frontend/src/pages/Invite.tsx:90-95`; `packages/backend/src/controllers/userController.ts:102-148`).
- Verify: `GET /api/v1/user/me/email/status` loads status and the same endpoint with `?passcode=000000` verifies (`packages/frontend/src/hooks/useEmailVerification.ts:11-16,27-32`; `packages/backend/src/controllers/userController.ts:174-196`).
- Search users: `GET /api/v1/org/users?...&searchQuery=marygreen` (`packages/frontend/src/hooks/useOrganizationUsers.ts:24-52`).
- Opening the delete dialog also requests `GET /api/v1/org/user/{userUuid}/schedulers-summary` (`packages/frontend/src/hooks/useOrganizationUsers.ts:193-210`).
- Delete: `DELETE /api/v1/org/user/{userUuid}`; the success toast is shown only after organization-user queries are invalidated/refetched (`packages/frontend/src/hooks/useOrganizationUsers.ts:55-60,173-182`).

## Synchronization and timeout requirements

- Cypress and Playwright both use 10-second action/assertion defaults and a 30-second Playwright navigation timeout (`packages/e2e/cypress.config.ts:15-20`; `packages/e2e/playwright.config.ts:11,20-26`). No source-specific timeout override exists.
- Replace the source's `cy.wait(500)` (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:48-50`) with a response wait for the debounced `/api/v1/org/users` request containing the search query. The UI debounce is 300 ms (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersTable.tsx:90-103`), after which network/render time remains unbounded by the fixed sleep.
- Start response promises before clicking the invite, signup, verification, and delete controls. Assert expected success codes before checking dependent UI. This avoids missing fast requests and makes API failures diagnostic.
- After invite submission, wait for the 201 response and for `#invite-link-input` to be visible with a nonempty value. The input is readonly and receives `invite.inviteUrl` (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/InviteSuccess.tsx:64-70`).
- Signup triggers `window.location.href = '/'` after success (`packages/frontend/src/pages/Invite.tsx:119-124`), followed by authenticated routing to email verification. Wait for the signup response and the `Check your inbox!` heading rather than a generic load state.
- PinInput's `onComplete` submits as soon as the sixth digit is entered (`packages/frontend/src/components/RegisterForms/VerifyEmailForm.tsx:89-102`). Set up the verification response wait before filling the final input; do not click the separate Submit button afterward. Then wait for the success dialog's `Continue` button.
- Opening delete starts scheduler-summary loading (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersActionMenu.tsx:108-117,254-275`). Wait for that GET to finish before clicking the dialog's Delete button, even though the current source can click while `hasSchedulers` is still undefined.
- The users table is row-virtualized (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersTable.tsx:384-399,512-513`). Search to narrow the result and wait for the exact row before interacting; do not assume all rows are attached.
- Current config is single-worker/non-fully-parallel (`packages/e2e/playwright.config.ts:9-13`), but the target should not rely on that global setting because retries and concurrent Cypress still share the database.

## Locator and strictness risks

- `findAllByTestId('settings-menu')` (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:8,44`) is intentionally plural. Playwright locators are strict at click time. Prefer the uniquely named settings button, `getByRole('button', { name: 'Settings' })`, whose accessible name is defined in `packages/frontend/src/components/NavBar/SettingsMenu.tsx:51-59`.
- `cy.contains('Users & groups')` is text-wide and feature-flag-sensitive. Scope to the settings navigation and use the exact route label variant, or explicitly require the feature flag. Evidence for both labels is `packages/frontend/src/hooks/settings/useSettingsNavigation.ts:232-240`.
- Scope `Add user`, the email field, and `Generate invite`/`Send invite` to the Add user dialog. Use exact `/^(Generate|Send) invite$/`; the source's `/(Generate|Send) invite/` is broader (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:12-17`). The form's semantic label is `Enter user email address` with `required` (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/InvitesModal.tsx:84-93`), so avoid coupling to the rendered ` *` suffix.
- Replace `click({ force: true })` on Add user and the row menu (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:13,54`) with normal actionability checks. A forced click can conceal overlays or off-screen virtual rows.
- Treat `#invite-link-input` as a local locator and explicitly assert `inputValue()` is nonempty. The Cypress conditional silently omits navigation when the value is not a string (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:18-24`).
- Prefer form labels (`First name`, `Last name`, `Email address`, `Password`) over placeholders; their definitions are stable in `packages/frontend/src/components/RegisterForms/CreateUserForm.tsx:43-89`.
- The six OTP inputs share a PinInput container. Use `getByTestId('pin-input').locator('input')`, assert count 6, and fill each; a direct role locator for `One-time password` may resolve to six elements (`packages/frontend/src/components/RegisterForms/VerifyEmailForm.tsx:88-103`).
- For deletion, locate the exact row containing the generated email and scope every subsequent locator to it. The source's `table -> contains('tr', email) -> .tabler-icon-dots` chain (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:50-54`) relies on implementation classes.
- The row action `ActionIcon` currently has no `aria-label` (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersActionMenu.tsx:199-207`). A local row-scoped `button` locator may be needed; adding a semantic `aria-label="User actions"` would be a small application accessibility prerequisite, not a reason to create a shared Playwright helper.
- Use exact `Delete user` for the portalled menu item (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersActionMenu.tsx:241-250`) and scope the `Delete` button to the `alertdialog` (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersActionMenu.tsx:254-275`) to avoid strict-mode collisions.
- Assert the exact email row is absent after deletion rather than globally asserting text absence; toast/other UI may retain unrelated user text.

## Nonstandard or surprising behavior

- The two source tests are an ordered lifecycle: test two is both deletion coverage and cleanup for test one. There is no `afterEach`/`after` fallback. If invitation succeeds but a later assertion fails, the active fixed-email user remains and future invitation attempts fail.
- Invite creation can reuse an existing *pending* user and overwrite that user's invite via an `onConflict('user_uuid').merge()` upsert (`packages/backend/src/models/InviteLinkModel.ts:87-110`), but it rejects an existing active user (`packages/backend/src/services/UserService.ts:591-602`). This makes stale state produce different behavior depending on where a prior run failed.
- The invite page deliberately shows a welcome interstitial unless the URL has `?from=email`; clicking `Join your team` only toggles local state (`packages/frontend/src/pages/Invite.tsx:39-63,137-143,218-253`). No popup or new tab is involved.
- The test does not use the invite copy button or clipboard API; it reads the readonly input directly.
- Verification submits automatically on the sixth digit, then the source clicks `Continue` in a success modal (`packages/e2e/cypress/e2e/app/settings/invites.cy.ts:34-40`; `packages/frontend/src/components/RegisterForms/VerifyEmailForm.tsx:89-102`).
- Delete behavior may become more complex for users owning scheduled deliveries: the dialog defaults to reassign and can disable confirmation until an owner is selected (`packages/frontend/src/components/UserSettings/UsersAndGroupsPanel/UsersActionMenu.tsx:129-146,162-168,281-345`). The newly created Mary user should have none, but the scheduler-summary response should still be awaited.
- External analytics/email calls may occur, but no external UI, inbox, iframe, popup, download/upload, clipboard, canvas/SVG, Monaco, drag-and-drop, browser permission, timezone assertion, or environment variable is directly exercised. `PLAYWRIGHT_BASE_URL`, `SITE_URL`, and server mode are the relevant environment configuration.

## Coordination requirements

`isolated-preview-org-user-mutations` is genuinely required before porting:

1. Provide a fresh or reset seeded database/preview exclusively for this mutating suite; do not dual-run it with Cypress against the same organization.
2. Ensure the admin seed and an active project are present.
3. Ensure password authentication is enabled and server mode is DEV or PR so `000000` is valid.
4. Ensure backend `SITE_URL` and Playwright `PLAYWRIGHT_BASE_URL` resolve to the same preview origin.
5. Define reset/cleanup ownership for failed attempts. Isolation alone does not make CI retries idempotent if a prior attempt leaves an active invitee.

No new shared Playwright helper is justified. Admin auth already exists in `packages/e2e/playwright/auth.setup.ts:10-23`; settings navigation, invite acceptance, and cleanup helpers should remain local to the one target file if needed. The optional missing action-menu accessible name is an application-level locator improvement, not cross-file test infrastructure.

## Exact port plan

1. Create only `packages/e2e/playwright/app/settings/invites.spec.ts`; retain the Cypress source during dual-run.
2. Import `test`/`expect` from `@playwright/test` and seed admin credentials only if local fallback cleanup needs to re-authenticate. Use the existing project storage state rather than adding an auth helper.
3. Generate a unique Lightdash-addressed invite email per test attempt (retain `marygreen` in the local part for readable search) instead of the fixed source email. This prevents duplicate-name collisions across retries; still run only in the coordinated isolated lane because it mutates the shared organization.
4. Add only file-local routines for opening organization user management and, if needed, deleting a user by exact email. Do not create shared infrastructure for these local uses.
5. Port `Should invite user` through the rendered UI: settings menu -> organization settings -> user management -> Add user dialog -> invite submission. Wait for and assert the 201 invite response, read and validate the generated URL, log out via `context.request`, visit the URL, assert the welcome card, complete signup, wait for `POST /api/v1/user`, fill six zeroes with the verification wait armed before the sixth, continue, and assert avatar `MG`.
6. Make cleanup independent of a later test. Capture enough invite/user identity to remove this test's user in a `finally` path using an admin-authenticated request context, or use the coordinator's explicit per-attempt reset contract. Cleanup must be exact-email/UUID scoped and idempotent.
7. Port `Should delete user` as an independent test: create its own uniquely named pending/active invitee through authenticated API setup, then exercise only the rendered settings/search/action-menu/alertdialog deletion flow. Await the debounced users request, scheduler summary, DELETE response, toast, and exact-row disappearance. Add idempotent API fallback cleanup for failures.
8. Do not retain `waitForTimeout(500)`, forced clicks, global text searches, or `.tabler-icon-dots`. Use response-driven synchronization and row/dialog scoping.
9. Keep both original test titles for traceability. Do not use serial ordering; the source ordering dependency is a defect to remove, not preserve.
10. Do not add API-only duplicate tests: API calls in this port are setup/cleanup and synchronization for browser behaviors.

## Verification plan

Run only after the isolation coordinator has supplied the reset preview and no Cypress worker is using it:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e lint
pnpm -F e2e format
pnpm -F e2e playwright:run -- playwright/app/settings/invites.spec.ts --project=firefox
pnpm -F e2e playwright:run -- playwright/app/settings/invites.spec.ts --project=firefox --repeat-each=3
pnpm -F e2e playwright:run
```

For a non-default preview, prefix both Playwright commands with the coordinator-provided value, for example:

```bash
PLAYWRIGHT_BASE_URL="<isolated-preview-url>" pnpm -F e2e playwright:run -- playwright/app/settings/invites.spec.ts --project=firefox
```

The focused repeated run must leave no test-generated invitee after each attempt. The full run verifies setup-project storage state and cross-spec compatibility; it must also use the isolated preview because this file mutates persistent organization state.

## Open questions

1. What exact isolated preview/database reset contract will `isolated-preview-org-user-mutations` provide, especially between Playwright retries?
2. Is the user-groups feature flag guaranteed enabled in every target environment, or should the port accept both `Users & groups` and `User management` navigation labels?
3. Is `SITE_URL` guaranteed to equal the browser-facing isolated preview origin? The generated absolute invite URL depends on it.
4. Should the application add an accessible name to the user-row action button before porting, or is a local row-scoped button locator accepted for this migration?
5. Which typed response parser/type guard should the port use for API setup/cleanup identities so it does not introduce unsafe casts when reading `APIResponse.json()`?

## Port history

Not started.

### 2026-07-20 — static port complete; execution lease pending

- Target: `packages/e2e/playwright/app/settings/invites.spec.ts`.
- Ported both active contracts with `@mutating`: invite/accept/register/DEV `000000` verification in one test, and independent API invite/activation followed by rendered search/action-menu/delete behavior in the other. No skipped behavior was ported; the Cypress source remains unchanged.
- Removed source ordering and fixed-identity coupling with a unique `demo+marygreen-<uuid>@lightdash.com` email per test. Each test captures a strictly parsed user UUID, cleans only `DELETE /api/v1/org/user/{userUuid}` in `finally`, and falls back to an exact-email organization-user search only when creation failed before the UUID response could be parsed. The separate admin-authenticated `request` fixture remains available after the page context logs out and becomes Mary.
- Static evidence (final runs): `pnpm -F e2e typecheck:playwright` passed; `pnpm -F e2e run linter ./playwright/app/settings/invites.spec.ts` passed; `pnpm -F e2e run formatter ./playwright/app/settings/invites.spec.ts --check` passed. `git diff --check` passed, the Cypress-source diff was empty, and the pre-history scope check showed only the new target path. Initial static runs exposed browser `Response`/`APIResponse` type conflation, `no-new`, and formatting failures; these were corrected before the passing runs.
- Runtime evidence: intentionally none. No Playwright, Cypress, browser, or API mutation command was run because the sole mutation lease has not been granted.
- Remaining risks for leased execution: runtime accessibility/strictness of the Add user labels and unnamed row action button is not yet observed; the invite redirect and standalone API activation still depend on the supplied local `SITE_URL`; `000000` depends on the supplied DEV runtime; cleanup/repeat behavior and post-delete refetch synchronization remain browser-unverified. Focused Firefox, repeated Firefox, and full Playwright execution remain pending the mutation lease.
- Commit: pending (`COMMIT_HASH_PLACEHOLDER`); nothing staged or committed.

### 2026-07-20 — cleanup verification strengthened

- Static-review fix: after authoritative exact-UUID cleanup returns 200 or 404, the admin-authenticated request fixture now searches organization users by the exact unique email and fails if any matching user UUID remains. This post-delete search is verification only and never triggers another deletion.
- Static evidence: `pnpm -F e2e typecheck:playwright`, targeted ESLint (`pnpm -F e2e run linter ./playwright/app/settings/invites.spec.ts`), and targeted oxfmt check (`pnpm -F e2e run formatter ./playwright/app/settings/invites.spec.ts --check`) all passed.
- Runtime evidence remains intentionally absent pending the sole mutation lease; no browser, Cypress, or API mutation command was run.

### 2026-07-20 — execution lease verified

- Runtime root fixes stayed target-local: Mantine modals are scoped by exact title text because their rendered dialogs are unnamed; required form fields use exact accessible textbox roles; the password-requirements dialog is closed by clicking the unobscured exact `Sign up` heading and asserted absent before submit; each test reauthenticates its page context as the exact seeded admin; invite cleanup creates its fresh admin API context only in `finally`; independent-delete setup uses a separate empty-storage admin API context from the observed page origin. The invite-origin equality assertion remains intact.
- Playwright gates all used `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000` and direct `pnpm -F e2e exec playwright test` commands: focused Firefox target passed 3/3; target `--repeat-each=3` passed 7/7; explicit branch `--grep @mutating` passed 3/3; full branch Firefox passed 8/8.
- After every final Playwright gate, strict admin searches returned zero `marygreen` active/pending users; database checks returned zero `marygreen` rows and exactly four primary human seed users. Every generated test identity was also checked by exact email in its `finally` after exact-UUID DELETE. One early failed cleanup exposed UUID `bfec7206-47ef-46c5-87b5-b81b17d66232`; it was deleted only by that exact UUID, then exact-email/API and database audits were clean. A later reported UUID `0d33e711-9974-4ce8-80a8-46588a78e670` was already absent when exact cleanup was attempted and was confirmed absent in the database before execution resumed.
- Cypress baseline for fixed `demo+marygreen@lightdash.com` was empty. The exact unprefixed Cypress command ran unchanged source but failed invite acceptance because Cypress defaulted to `http://localhost:3000` while the invite URL used `http://127.0.0.1:3000`; its ordered delete test still removed the pending identity, leaving no post-baseline UUID delta. Re-running the same unchanged spec with `CYPRESS_BASE_URL=http://127.0.0.1:3000` passed 2/2. Final exact-email/API and database checks showed baseline `[]`, post-run `[]`, zero deltas, zero `marygreen` users, and four seed users.
- Final static evidence: `pnpm -F e2e typecheck:playwright`, targeted ESLint, and targeted oxfmt check all passed. Cypress source/shared files remain unchanged.
- Remaining runtime risk: local Cypress execution must align `CYPRESS_BASE_URL` with backend `SITE_URL`; without that environment override Cypress correctly reports a cross-origin failure. The `000000` contract remains DEV-only by design.
- Commit remains pending (`COMMIT_HASH_PLACEHOLDER`); nothing staged, committed, or pushed. Proposed commit: `chore(e2e): port settings invites to Playwright`.
