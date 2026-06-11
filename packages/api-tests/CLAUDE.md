# CLAUDE.md - api-tests Package

This file provides guidance to Claude Code when working with the `api-tests`
package. See [README.md](README.md) for how to run the suite.

## What this package is for

Headless integration tests (Vitest) that hit the Lightdash HTTP API directly.
There is **no browser** — tests log in and make real requests against a running
backend.

**Put a test here when it only needs the API.** If a behaviour can be verified
through HTTP requests and assertions on the responses, it belongs in this
package — not in a browser test. Reach for `packages/e2e` (Cypress) only when
the test genuinely needs the rendered UI (DOM assertions, clicks, drag-and-drop,
chart rendering).

Why it matters: API tests are faster, deterministic, and free of browser-timing
flakiness. A behaviour driven by an API request should not be tested by driving
the UI and asserting on a network response — the UI can fire unrelated requests
that race the one under test.

## How tests are structured

- Tests live in `tests/**/*.test.ts`; Vitest auto-discovers them
  (`vitest.config.ts`). No registration step.
- `beforeAll` calls `login()` (from `helpers/auth.ts`) to get a logged-in
  `ApiClient`. Use `loginAsEditor`/`loginAsViewer`/`loginWithPermissions` for
  other roles.
- Drive the API with `ApiClient` (`helpers/api-client.ts`): `get`/`post`/`patch`/
  `put`/`delete`, all cookie-aware. Type responses as `Body<T>` so
  `resp.body.results` is typed.
- Use `SEED_PROJECT` and the other `SEED_*` constants from `@lightdash/common`
  for seed data; do not hardcode UUIDs.
- For async query endpoints, the POST returns a `queryUuid`; poll
  `GET .../query/{queryUuid}` until `status === 'ready'`. Allow a generous cap
  (e.g. ~60s) so slow CI doesn't false-timeout.

## Conventions

- Tests run against a live server; there is no in-process app. Keep them
  self-contained — create what you need and clean it up (`afterAll`) rather than
  depending on another test's state.
- Field references in table-calculation SQL use Lightdash's `${table.field}`
  syntax. Build these via a template helper (e.g.
  `` const fieldReference = (id: string) => `\${${id}}` ``) so the literal
  `${...}` doesn't trip the `no-template-curly-in-string` lint rule.
- Run `pnpm -F api-tests lint` and `pnpm -F api-tests typecheck` before
  committing.
