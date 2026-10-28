# AGENTS.md - e2e Package

Browser-driven end-to-end tests written with Playwright. Use this package
**only when a test genuinely needs the rendered UI** (clicks, typing, charts,
drag-and-drop, navigation) or shells out to the `lightdash` CLI.

## Prefer api-tests for API-only tests

If a test only needs the HTTP API, write it in `packages/api-tests` (Vitest,
headless; see `packages/api-tests/AGENTS.md`). Driving the UI to assert on a
network response is a common source of flakiness.

## Layout

```
playwright.config.ts   baseURL, timeouts, retries, reporters
support/test.ts        `test` and `expect`; re-exports every helper below
support/api.ts         login/logout, seed users, create/delete content, tokens, embed JWTs
support/ui.ts          selectMantine, scrollTreeToItem, getMonacoEditorText, dragAndDrop
support/cli.ts         runCli: shell out to `lightdash` from packages/e2e
support/cleanup.ts     records created content and deletes it when the worker exits
tests/app/**           UI specs            (CI job "E2E: App", 5 shards)
tests/api/**           request-only specs  (run with the app shards)
tests/cli/**           CLI specs           (CI jobs "CLI: ...")
fixtures/              credentials.json written by CI (gitignored)
```

Always import from the support barrel, never from `@playwright/test` directly:

```ts
import { expect, loginAs, SEED_USERS, test } from '../../support/test';
```

## Fixtures

- `page` is the usual Playwright page. `api` wraps `page.request`, so it
  shares the browser's cookie jar: `await loginAs(api.raw, SEED_USERS.admin)`
  logs both the API client and the page in. Use `api.get/post/patch/delete`
  for calls the test makes itself so created content is tracked for cleanup.
  Helpers in `support/api.ts` take an `APIRequestContext`; pass `api.raw`.
- Third-party hosts (analytics, intercom, loom) are blocked automatically.
- Timezone comes from `TZ`; the config passes it to the browser as `timezoneId`.

## Conventions

- `data-testid` → `page.getByTestId('x')`. The login/register pages use
  `data-cy` → `page.locator('[data-cy="x"]')`.
- Prefer `getByRole`, `getByText({ exact })`, `getByPlaceholder`, `getByLabel`
  over CSS. Keep existing CSS selectors when they target third-party DOM
  (`.react-grid-layout`, `.echarts-for-react`, `.monaco-editor`, `.mantine-*`).
- `cy.contains('text')` → `page.getByText('text')`; add `{ exact: true }` when
  sibling text would otherwise collide.
  `cy.contains('button', 'Save')` → `page.getByRole('button', { name: 'Save' })`.
- Assertions are web-first: `await expect(locator).toBeVisible()`, never
  `expect(await locator.isVisible())`. `should('not.exist')` → `toHaveCount(0)`.
- `cy.wait('@alias')` → `const responsePromise = page.waitForResponse(...)`
  **before** the action, then `await responsePromise`.
- `cy.wait(ms)` is a smell: replace with a web-first assertion on what the
  wait was for. Keep `page.waitForTimeout` only where the old test waited for
  an animation and nothing observable changes.
- `cy.exec` → `runCli(command, { env, timeout })`; env values must be strings.
  It never throws on non-zero exit; assert on `code`, `stdout`, `stderr`.
- Shared state between tests in one file is allowed (tests in a file run in
  order on one worker) but prefer `test.describe.serial` to make it explicit.
- No `as any`, no `as unknown as X`. Type API responses with
  `json<T>(response)` from `support/api.ts`.
- Lint and format with `pnpm -F e2e lint` and `pnpm -F e2e fix-format`.

## Cleanup is automatic

Preview environments keep their database between runs and several CI shards
run against the same database in parallel. Never delete "everything that is
not seeded". `support/cleanup.ts` records every user, space, dashboard, chart,
SQL Runner chart and project a test creates (through the UI or the `api`
fixture) and deletes them when the worker finishes. Anything else (invites,
groups, user attributes, schedulers) must be cleaned up by the test itself.

## Running

```bash
pnpm -F e2e test                              # everything against http://localhost:3000
pnpm -F e2e test tests/app/dashboard.spec.ts  # one file
pnpm -F e2e test:ui                           # Playwright UI mode
PLAYWRIGHT_BASE_URL=https://... pnpm -F e2e test:app
TZ=Asia/Tokyo pnpm -F e2e test tests/app/dates.spec.ts
```

CLI specs need `lightdash` on `PATH` (build `packages/cli` and `npm install -g`
or link `dist/index.js`) and, for `tests/cli/dbt`, a dbt venv.
