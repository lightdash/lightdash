---
name: deprecate-endpoint
description: Use when deprecating, sunsetting, or removing a backend HTTP API endpoint in Lightdash — wiring deprecation logging, deadline/sunset dates, response headers, and Sentry alerting onto a TSOA controller route. Covers the first-party-caller precondition and the shared deprecation middleware.
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Deprecate an HTTP Endpoint

Checklist for deprecating a backend HTTP endpoint. The runtime behavior
(warn→error logging, Sentry alerting, response headers) lives in one shared
middleware — you only wire it on and supply a date + replacement hint.

The authoritative policy is `packages/backend/src/controllers/CLAUDE.md` →
"Deprecating Endpoints". This skill is the actionable checklist.

## Scope — endpoints only

Only HTTP route handlers (TSOA controllers) get the deprecation middleware.
Internal service/model methods, type fields, DB columns, and config fields are
**not** endpoints — mark those with a plain `@deprecated` JSDoc and stop there.

## First, check current state

Read the handler before editing. It may already have some of the pieces
(`@deprecated` JSDoc, `@Deprecated()`, the middleware) — only add what's missing.

## Precondition (hard blocker)

**Only deprecate an endpoint once nothing first-party calls it anymore.** The
frontend, CLI, EE code, and other internal consumers must already be migrated to
the replacement. A deprecated route logs an error and reports to Sentry once past
its deadline, so any straggler caller becomes noise/alerts.

Verify before touching the controller — search every first-party surface for the
route path and its API hooks, including EE and test suites:

```bash
grep -rn "<route-fragment>" packages/frontend/src packages/cli/src \
  packages/common/src packages/backend/src/ee packages/api-tests packages/e2e
```

Watch for version differences: a v2 call (`version: 'v2'` / `/api/v2/...`) to a
similar path is the *replacement*, not a caller of the v1 route. A test that hits
the route counts as a caller — it will trigger logs/Sentry once past sunset. If
any first-party caller remains, migrate it first (or stop — it cannot be
deprecated yet).

## Wire it up

In the controller, on the route handler:

- [ ] Add the `@deprecated` JSDoc line naming the replacement. TSOA reads this
      tag to set `deprecated: true` in the OpenAPI spec.
- [ ] Add the TSOA `@Deprecated()` decorator — the explicit, consistent way to
      mark it (decorator order doesn't matter). Keep both this and the JSDoc.
- [ ] Add `getDeprecatedRouteMiddleware` to the handler's `@Middlewares([...])`
      (use the same text for `suffixMessage` as the `@deprecated` JSDoc):

```ts
import { getDeprecatedRouteMiddleware } from './authentication';

@Middlewares([
    allowApiKeyAuthentication,
    isAuthenticated,
    getDeprecatedRouteMiddleware(new Date('2026-06-08'), {
        suffixMessage: 'Use GET /api/v2/.../roleAssignments instead.',
    }),
])
@Deprecated()
```

- `new Date(...)` is the date you are deprecating it (today). The removal/sunset
  date **defaults to deprecatedOn + 3 months**; only pass `{ removeOn: ... }` when
  a different sunset has been agreed.
- If the handler has no `@Middlewares` block (e.g. some embed routes), add one
  containing just the middleware.

## You get this for free

`getDeprecatedRouteMiddleware` (`controllers/authentication/deprecation.ts`)
already does, per call:

- `Deprecation`, `Sunset`, and legacy `Warning` response headers.
- A warning log, escalating to an **error log + Sentry `DeprecatedRouteError`**
  (`@lightdash/common`) once the sunset is within two weeks or has passed.

Do not add per-endpoint logging/headers. (Some older routes also fire a
`trackDeprecatedRouteCalled` analytics event — that's optional; the middleware is
the standard.)

## Later: removal

Once the sunset passes (the route is now error-logging + Sentry-alerting on every
call), the follow-up task is to delete the handler and its route, then
`pnpm generate-api` again. That's a separate change, not part of deprecating.
