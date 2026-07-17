# packages/e2e/cypress/e2e/app/login.cy.ts

## Classification

Recommended runner: Playwright for the active UI flow; frontend unit/API tests for the skipped mixed validation flow
Execution lane: Unauthenticated browser authentication flow against the seeded preview
Active tests: 1
Skipped tests: 1
Persistent mutation: Yes — browser/server sessions, login/logout audit and analytics events, and `ld.last_login_method`; no content or user mutation
Shared-preview dual-run safe: Yes, provided Cypress and Playwright use separate browser contexts/cookie jars and no reset/seed runs concurrently
Difficulty total: 6/18
Coordination keys: `seed-org-1-admin`, `auth-session`, `packages/e2e/playwright/app/login.spec.ts`
Analysis status: analyzed

Difficulty breakdown:

- persistent/shared state: 1 — session and append-only audit/analytics state, but no shared domain entity is edited
- browser interaction complexity: 1 — ordinary two-stage form and a hard navigation
- environment/external dependencies: 1 — seeded backend/database and email-login configuration are required; no SSO/email delivery is used
- synchronization/flakiness: 1 — asynchronous login-option precheck plus navigation, covered by normal auto-waiting
- authentication/authorization: 2 — authentication and session creation are the behavior under test
- cross-file infrastructure: 0 — an isolated browser context is sufficient; no new helper is justified

## Test inventory

| Title | Effective status | Behavior | Mutations | Unusual mechanics | Recommended target |
|---|---|---|---|---|---|
| `Should login successfully` | Active (`describe` is active and the test uses `it`) | Logs out, opens `/login`, submits the seeded admin email, waits for the password stage, submits the seeded password, and checks that routing reaches a URL containing `/home` (`packages/e2e/cypress/e2e/app/login.cy.ts:6-22`). | The hook and test each destroy the current session; successful login creates/saves a session, emits login telemetry/audit state, and writes a one-year last-login cookie. | Two-stage email precheck, a possible 400 ms delayed loading state, then `window.location.href` navigation. | `packages/e2e/playwright/app/login.spec.ts`; this equivalent target already exists at lines 7-16. |
| `Should display error message when credentials are invalid or not recognised` | Skipped directly with `it.skip`; no inherited `describe.skip` (`packages/e2e/cypress/e2e/app/login.cy.ts:25-45`). | Exercises malformed email, whitespace email, then a syntactically valid unknown email/password and expects the backend error text. | None while skipped. If enabled, it would destroy its own session twice and emit failed-login audit state; it creates no user/content. | Combines client-side schema validation with a real login-options request and failed server authentication. | Do not port as Playwright. Follow its `todo: move to unit test` comment: client rendering belongs in `packages/frontend/src/features/users/components/LoginLanding.test.tsx`; retain the server rejection contract separately in `packages/api-tests/tests/login.test.ts` only if that contract lacks coverage. |

## Cypress command expansion

- The suite-level `beforeEach` calls `cy.logout()` before every effective test (`packages/e2e/cypress/e2e/app/login.cy.ts:7-9`). Both test bodies call it again (`packages/e2e/cypress/e2e/app/login.cy.ts:12,27`), so the active test performs two sequential logout requests.
- `cy.logout` is the only repository-authored custom command used. It is a parent command that performs `GET api/v1/logout` through `cy.request` and has no explicit response assertion (`packages/e2e/cypress/support/commands.ts:323-327`). `cy.request` still waits for completion and fails on a non-2xx response by default. The backend invokes Passport logout, destroys the request session, optionally emits a logout audit event, and returns `{ status: 'ok' }` (`packages/backend/src/routers/apiV1Router.ts:832-871`).
- `findByPlaceholderText` and `findByText` come from `@testing-library/cypress`, registered globally by `packages/e2e/cypress/support/commands.ts:46` and declared as dependency at `packages/e2e/package.json:24`. They are retryable Testing Library queries, not local helper logic. Their source uses are at `packages/e2e/cypress/e2e/app/login.cy.ts:14-20,29-45`.
- `visit`, `type`, `clear`, `click`, `get`, `url`, and `should` are standard Cypress commands. There are no aliases, intercepts, tasks, fixtures, or custom timeout arguments in this spec.

## State, seed, and environment assumptions

- The test imports fixed seed credentials (`packages/e2e/cypress/e2e/app/login.cy.ts:1-4`): `demo@lightdash.com` and `demo_password!` (`packages/common/src/index.ts:474-479`). That user is the seed organization admin (`packages/common/src/index.ts:481`) with fixed user UUID `b264d83a-9000-426a-85ec-3f9c20f368ce` (`packages/common/src/index.ts:466`). No test-generated names or duplicate-name risk exists.
- The account must remain active, have a local password, belong to an organization, and have an active project. Password authentication resolves the user by primary email/password (`packages/backend/src/services/UserService.ts:1346-1389`). The post-login `/` route redirects to `/projects` (`packages/frontend/src/Routes.tsx:760-773`), and the projects page redirects to the active project's `/home` (`packages/frontend/src/pages/Projects.tsx:7-19`).
- The preview must not be in `DEMO` mode, must not require organization registration, and must report the browser unauthenticated; otherwise the login form auto-authenticates, redirects to registration, or redirects away (`packages/frontend/src/features/users/components/LoginLanding.tsx:192-200,237-253`). Login options for the seeded email must include the local email issuer and must not force an SSO redirect (`packages/frontend/src/features/users/components/LoginLanding.tsx:115-127,202-229`).
- Direct/requested APIs for the active flow are:
  - `GET /api/v1/logout` twice from the hook and test body (`packages/e2e/cypress/e2e/app/login.cy.ts:7-13`; command URL at `packages/e2e/cypress/support/commands.ts:323-327`).
  - `GET /api/v1/health?skipMigrationCheck=true` while the app loads (`packages/frontend/src/hooks/health/useHealth.tsx:10-15`).
  - `GET /api/v1/flash` (`packages/frontend/src/hooks/useFlashMessages.ts:5-10`).
  - `GET /api/v1/user/login-options` initially and again with the URL-encoded email after Continue (`packages/frontend/src/features/users/hooks/useLogin.ts:18-23`; precheck state at `packages/frontend/src/features/users/components/LoginLanding.tsx:210-220`).
  - `POST /api/v1/login` with `{ email, password }` (`packages/frontend/src/features/users/hooks/useLogin.ts:57-62`). The backend saves the session before returning the session user (`packages/backend/src/routers/apiV1Router.ts:412-426`).
- Successful password login emits `user.logged_in` analytics and an allowed authentication audit event (`packages/backend/src/services/UserService.ts:1398-1413`). The browser writes `ld.last_login_method` for one year (`packages/frontend/src/features/users/utils/lastLoginMethod.ts:8-17,67-77`). These are append-only/per-browser effects and do not alter the seeded user.
- The skipped flow's first two invalid emails are blocked by the shared schema, whose exact messages are defined at `packages/common/src/index.ts:394-402`. Its final valid-looking email reaches login options and then `POST /login`; an unknown credential pair maps to `Email and password not recognized` (`packages/backend/src/services/UserService.ts:1417-1425`).
- Cypress uses `http://localhost:3000`, a 10-second command timeout, and default two run-mode retries unless `CYPRESS_RETRIES` overrides them (`packages/e2e/cypress.config.ts:13,18-26`). Playwright supports `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_RETRIES` (`packages/e2e/playwright.config.ts:4,12,21`). No timezone, clipboard, filesystem, email service, or SSO provider is required.

## Synchronization and timeout requirements

- Clicking Continue changes `preCheckEmail`, triggers the email-specific login-options request, and only renders the password stage after that request succeeds and stops fetching (`packages/frontend/src/features/users/components/LoginLanding.tsx:210-229,298-325`). The port should rely on `getByLabel('Password')` actionability/visibility rather than add sleeps.
- A loading/disabled state appears only if login-options fetching lasts more than 400 ms and is cleared when fetching ends (`packages/frontend/src/features/users/components/LoginLanding.tsx:148-163,231-235`). Locators must tolerate the Continue/sign-in button being temporarily disabled.
- Login success writes the last-login cookie and assigns `window.location.href` (`packages/frontend/src/features/users/components/LoginLanding.tsx:165-177`), so the final assertion must wait through a full navigation and subsequent `/` → `/projects` → project-home redirects.
- The source has no network aliases or explicit waits. Cypress retries commands for 10 seconds and run-mode tests by default (`packages/e2e/cypress.config.ts:13,18-21`). The current Playwright config has 10-second action/assertion timeouts and a 30-second navigation timeout (`packages/e2e/playwright.config.ts:20-24`), which is sufficient without custom timeouts.
- Prefer the path-boundary URL check already in the target, `/\/home(?:[/?#]|$)/` (`packages/e2e/playwright/app/login.spec.ts:16`), rather than the source's weaker substring check (`packages/e2e/cypress/e2e/app/login.cy.ts:22`).

## Locator and strictness risks

- Placeholder queries are unique today, but accessible-label locators are more durable: the controls have labels `Email address` and `Password` while their placeholders are defined separately (`packages/frontend/src/features/users/components/LoginLanding.tsx:269-273,301-305`). The existing Playwright target already uses `getByLabel` (`packages/e2e/playwright/app/login.spec.ts:11,13`).
- `Continue` is rendered only in the precheck stage (`packages/frontend/src/features/users/components/LoginLanding.tsx:338-346`), so `getByRole('button', { name: 'Continue' })` is strict and unambiguous.
- The source's `[data-cy="signin-button"]` is reused for both Continue and Sign in (`packages/frontend/src/features/users/components/LoginLanding.tsx:320,343`), although only one stage is rendered at once. The port should use role/name and exact `Sign in` matching because the page title also says `Sign in`; the existing target does this at `packages/e2e/playwright/app/login.spec.ts:12,14`.
- The skipped test's text locators assert implementation-copy strings. If moved to a unit test, scope validation messages to the form/error region and the failed-login message to the notification to avoid strict-mode collisions.

## Nonstandard or surprising behavior

- The active body repeats the hook's logout, causing two logout requests (`packages/e2e/cypress/e2e/app/login.cy.ts:7-13`). A Playwright port should not reproduce this; an empty browser storage state provides deterministic unauthenticated state.
- Logout destroys the authenticated session but does not clear the non-auth `ld.last_login_method` cookie. Browser-context isolation is therefore stronger than translating `cy.logout` literally.
- The login is a two-step precheck rather than a single submit. The first API request determines whether email, email OTP, or SSO controls appear (`packages/frontend/src/features/users/components/LoginLanding.tsx:202-229,298-337`).
- In demo mode, the component auto-submits the seed credentials and displays a spinner instead of the manual form (`packages/frontend/src/features/users/components/LoginLanding.tsx:192-200,237-239`).
- The skipped test mixes two client validation cases and one backend authentication failure despite the explicit unit-test TODO (`packages/e2e/cypress/e2e/app/login.cy.ts:25-45`). Split by responsibility rather than reviving it as one browser test.
- There are no downloads/uploads, popups, iframes, canvas/SVG assertions, Monaco, virtualization, drag-and-drop, browser permission APIs, timezone assumptions, or manual debounce waits.

## Coordination requirements

- `packages/e2e/playwright/app/login.spec.ts` already contains the active equivalent. Reconcile with that file; do not create a second login spec or duplicate the test (`packages/e2e/playwright/app/login.spec.ts:7-16`).
- Keep this test unauthenticated with local `test.use({ storageState: { cookies: [], origins: [] } })`, already present at `packages/e2e/playwright/app/login.spec.ts:7`. Do not add a shared logout fixture for this one use.
- The global Firefox project depends on auth setup and normally loads the admin storage file (`packages/e2e/playwright.config.ts:28-40`), while this spec deliberately overrides it. Auth setup still performs an API login and writes `.auth/admin.json` (`packages/e2e/playwright/auth.setup.ts:10-23`); that setup session is not the page session.
- Cypress/Playwright dual-run against one preview is safe because each login/logout operates on its own session cookie and no domain entity is edited. Audit/analytics records may interleave harmlessly. Avoid concurrent database resets/seeds. Two Playwright invocations in the same worktree could race on `.auth/admin.json`, but Cypress does not touch that file.
- Playwright is currently single-worker and non-fully-parallel (`packages/e2e/playwright.config.ts:9,13`), so no additional serial annotation is needed.

## Exact port plan

1. Use only `packages/e2e/playwright/app/login.spec.ts` for the active Cypress test. The existing lines 7-16 already implement the intended port; update rather than duplicate only if migration review finds a semantic gap.
2. Preserve empty cookies/origins at spec scope so `/login` starts unauthenticated. Do not call `/api/v1/logout` and do not introduce a shared auth helper.
3. Navigate to `/login`; fill the seeded email through `getByLabel('Email address')`; click the Continue button by role; fill the password after Playwright auto-waits for that stage; click exact `Sign in` by role.
4. Assert the final URL with `/\/home(?:[/?#]|$)/` so the hard navigation and redirect chain complete and `/home` is a path segment.
5. Do not port the skipped test into Playwright. If revived, place the two client validation/rendering cases in new `packages/frontend/src/features/users/components/LoginLanding.test.tsx`. Put only the unknown-credential HTTP contract in new `packages/api-tests/tests/login.test.ts` if equivalent API coverage is confirmed absent.
6. Add no shared page object, fixture, or utility: this file is the only local consumer and the interaction is five straightforward Playwright operations.

## Verification plan

For the active Playwright target:

```bash
pnpm -F e2e typecheck:playwright
pnpm -F e2e exec eslint -c .eslintrc.js --ignore-path ./../../.gitignore playwright/app/login.spec.ts
pnpm -F e2e exec oxfmt --ignore-path ./../../.gitignore playwright/app/login.spec.ts --check
pnpm -F e2e playwright:run playwright/app/login.spec.ts --project=firefox
```

If the skipped test is later split, additionally run:

```bash
pnpm -F frontend test --run src/features/users/components/LoginLanding.test.tsx
pnpm -F frontend typecheck:fast
pnpm -F api-tests test:api -- tests/login.test.ts
pnpm -F api-tests typecheck:fast
```

The E2E package scripts supporting the primary commands are defined at `packages/e2e/package.json:12-20`.

## Open questions

- Non-blocking: should the skipped server-error assertion be retained as a dedicated API test, or is `POST /api/v1/login` invalid-credential behavior already covered elsewhere? The source comment only decides that the browser test should become a unit test; it does not separate the backend contract (`packages/e2e/cypress/e2e/app/login.cy.ts:25-45`).
- Non-blocking: the existing unauthenticated target still pays for the project-level admin auth setup. Avoid adding a separate Playwright project solely for this test unless more unauthenticated specs need the same lane.

## Port history

Not started.
