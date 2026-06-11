---
name: deprecate-endpoint
description: Use when deprecating, sunsetting, or removing a backend HTTP API endpoint in Lightdash — wiring deprecation logging, deadline/sunset dates, response headers, and Sentry alerting onto a TSOA controller route. Also covers making the deprecation visible on docs.lightdash.com and llms.txt (description lead line, x-mint migration banner). Covers the first-party-caller precondition and the shared deprecation middleware.
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
- [ ] Rewrite the JSDoc **description** so its first line is plain text
      `Deprecated — use the v2 <name> endpoint instead.` (see "Make it visible
      in the docs" below for why this exact shape matters).
- [ ] Add an `@Extension('x-mint', ...)` migration banner (same section below).
- [ ] Add `getDeprecatedRouteMiddleware` to the handler's `@Middlewares([...])`
      (use the same text for `suffixMessage` as the `@deprecated` JSDoc):

```ts
import { getDeprecatedRouteMiddleware } from './authentication';

/**
 * Get role assignments for a project
 * @summary Get role assignments
 *
 * @deprecated Use GET /api/v2/.../roleAssignments instead
 */
@Middlewares([
    allowApiKeyAuthentication,
    isAuthenticated,
    getDeprecatedRouteMiddleware(new Date('2026-06-08'), {
        suffixMessage: 'Use GET /api/v2/.../roleAssignments instead.',
    }),
])
@Deprecated()
```

Keep the existing description and `@summary` lines in the JSDoc (lint requires
`@summary` on every endpoint) and append the `@deprecated` line after a blank
line.

- `new Date(...)` is the date you are deprecating it (today). The removal/sunset
  date **defaults to deprecatedOn + 3 months**; only pass `{ removeOn: ... }` when
  a different sunset has been agreed.
- If the handler has no `@Middlewares` block (e.g. some embed routes), add one
  containing just the middleware.

## Make it visible in the docs (description + x-mint)

`deprecated: true` alone is nearly invisible on docs.lightdash.com — AI agents
and scripts reading the docs keep generating code against the route. The docs
site auto-generates API pages and llms.txt from
`packages/backend/src/generated/swagger.json` (main branch), so docs visibility
is wired here, in the controller JSDoc:

- The llms.txt entry is `- [summary](url): first sentence of description`
  (truncated ~60 chars), and the description renders as the page subtitle.
  So the description's **first line must be plain text** (no markdown links,
  no MDX) leading with the deprecation:

```ts
/**
 * Deprecated — use the v2 Execute metric query endpoint instead.
 *
 * This endpoint was deprecated on <date> and will sunset on <date>. Migrate to
 * the v2 async query flow: Execute metric query, then Get results.
 * @summary Run metric query   // ⚠️ do NOT change — the docs page slug/URL is built from it
 * @deprecated Use POST /api/v2/projects/{projectUuid}/query/metric-query instead
 */
```

- The visible banner on the endpoint page comes from the Mintlify
  `x-mint: content` OpenAPI extension (renders **above** the auto-generated
  reference; supports MDX). MDX in the plain `description` is NOT supported —
  don't put `<Warning>` there. Emit it with TSOA's `@Extension` (string must be
  a literal; backtick-escape inline code so `{braces}` don't break MDX):

```ts
@Extension('x-mint', {
    content: `<Warning>
**This endpoint is deprecated and will sunset on <date>.**

Migrate to [Execute metric query](https://docs.lightdash.com/api-reference/v2/execute-metric-query) (\`POST /api/v2/projects/{projectUuid}/query/metric-query\`), then [Get results](https://docs.lightdash.com/api-reference/v2/get-results).
</Warning>`,
})
```

- [ ] Run `pnpm generate-api` and check the swagger.json diff: the operation
      keeps `deprecated: true`, summary unchanged, description starts with the
      plain-text `Deprecated — ...` sentence, and `x-mint` is present. Expect
      unrelated key-reordering drift in generated files — to keep the PR clean,
      revert generated files to HEAD, graft only the changed operation objects,
      then `pnpm -F backend formatter --write ./src/generated/swagger.json`.

Docs go live on the next mintlify-docs deploy after the backend change reaches
main (the docs site re-fetches swagger.json from main at build time).

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
