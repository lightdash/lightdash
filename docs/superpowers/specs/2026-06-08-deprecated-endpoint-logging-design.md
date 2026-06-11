# Deprecated endpoint logging, deadlines & headers — design

Date: 2026-06-08

## Goal

Every deprecated **HTTP endpoint** must:

1. Emit a **warning log** on each call.
2. Emit an **error log** instead when its removal deadline is within two weeks or already passed.
3. Have an explicit **deadline (sunset) date**.
4. Return **deprecation response headers**.

Deprecated endpoints are not expected to be called by the frontend, CLI, or any
first-party client. Per-call logging is therefore acceptable and intentional —
any log line is a signal that something still depends on a route slated for
removal. No throttling/sampling.

## Scope

In scope: deprecated **HTTP route handlers** in `packages/backend/src/controllers/`
(and `ee/controllers/`), whether currently marked by the TSOA `@Deprecated()`
decorator or only by a `@deprecated` JSDoc comment.

Explicitly out of scope:

- Internal callable methods marked `@deprecated` (services/models/utils) — not
  endpoints, no HTTP response, no natural deadline.
- Non-callable `@deprecated` declarations — type fields, DB columns, config
  fields. Nothing to instrument at runtime.

## Design

### 1. Middleware: `getDeprecatedRouteMiddleware`

Location: `packages/backend/src/controllers/authentication/middlewares.ts`
(enhances the existing function).

New signature — primary argument is the date the endpoint was **deprecated**; the
removal deadline defaults to `deprecatedOn + 3 months` and can be overridden:

```ts
getDeprecatedRouteMiddleware(
    deprecatedOn: Date,
    options?: { removeOn?: Date; suffixMessage?: string },
): RequestHandler
```

- `removeOn` default: `deprecatedOn` with month advanced by 3
  (`d = new Date(deprecatedOn); d.setMonth(d.getMonth() + 3)`). No new date
  dependency.
- There is **no** shared deadline constant. Each endpoint supplies its own
  `deprecatedOn` (sourced from git history — when the deprecation was added).

#### Response headers

Set on every call:

- `Deprecation: <deprecatedOn as HTTP-date>` (RFC 9745)
- `Sunset: <removeOn as HTTP-date>` (RFC 8594)
- `Warning: 299 - "This API endpoint is deprecated and will be removed after <removeOn>. <suffixMessage>"`
  (retained for backward compatibility with existing clients).

#### Logging

Per call, compute `msUntilRemoval = removeOn.getTime() - now`:

- `msUntilRemoval > 14 days` → `Logger.warn(...)`
- `msUntilRemoval <= 14 days` (within two weeks **or** already passed) →
  `Logger.error(...)`

Log message includes: HTTP method, route path, `deprecatedOn` (ISO),
`removeOn` (ISO), and the replacement hint (`suffixMessage`).

#### Testability

Extract the warn-vs-error decision and the date math into small pure helpers so
they can be unit-tested without constructing the full middleware/Express stack:

- `getDefaultSunsetDate(deprecatedOn: Date): Date`
- `shouldEscalateToError(removeOn: Date, now: Date): boolean` (true when
  `removeOn - now <= 14 days`)

### 2. Wire every deprecated endpoint

For each in-scope route handler, add
`getDeprecatedRouteMiddleware(deprecatedOn, { suffixMessage })` to its
`@Middlewares([...])` array, where:

- `deprecatedOn` = the date the route was deprecated, from git history.
- `suffixMessage` = the replacement hint, reused from the endpoint's existing
  `@deprecated` JSDoc text.

Also keep the `@Deprecated()` decorator and `@deprecated` JSDoc on each (they
drive OpenAPI). For endpoints currently marked only by JSDoc, the JSDoc stays as
the source of the replacement message; adding the `@Deprecated()` decorator for
OpenAPI parity is optional and not required by this change.

The 4 routes already using `deprecatedResultsRoute` (in `runQueryController` and
`savedChartController`) inherit the enhanced behavior automatically.
`deprecatedResultsRoute` itself is migrated to the new signature: its real
`deprecatedOn` from git, with `removeOn: new Date('2025-04-30')` passed
explicitly to preserve its historical sunset date.

Endpoints to instrument (final list confirmed against source during
implementation; verify each to avoid double-wiring):

- `dashboardController` — 1
- `projectController` — `getQueryResults`, `calculateTotalFromQuery`,
  `updateProjectUserRole`, `deleteProjectUserRole`
- `organizationController` — 1
- `groupsController` — 3
- `catalogController` — 4
- `validationController` — 1
- `ee/controllers/embedController` — calculate-total / subtotals routes

Because the real deprecation dates are all more than 3 months in the past, the
default `removeOn` lands in the past for these endpoints → they emit **error**
logs, correctly surfacing overdue deprecations.

### 3. Documentation

Add a **"Deprecating endpoints"** section to
`packages/backend/src/controllers/CLAUDE.md` covering:

- **What**: applies to HTTP endpoints only (not internal methods, types, DB
  columns, or config fields).
- **When**: endpoints sunset 3 months after deprecation by default; override
  `removeOn` only when a different window is agreed.
- **How**: add `getDeprecatedRouteMiddleware(deprecatedOn, { suffixMessage })`
  to the endpoint's `@Middlewares([...])`, keep the `@Deprecated()` decorator
  and `@deprecated` JSDoc, set the replacement hint as `suffixMessage`.
- **Behavior**: warn logs per call escalate to error logs within two weeks of
  (or after) the sunset date; `Deprecation`/`Sunset`/`Warning` headers are
  returned automatically.

## Testing

- New unit test for `middlewares.ts` deprecation helpers/middleware:
  - `getDefaultSunsetDate` returns `deprecatedOn + 3 months`.
  - `shouldEscalateToError`: far-future deadline → false; within 14 days → true;
    past → true.
  - Middleware sets `Deprecation`, `Sunset`, and `Warning` headers.
  - Middleware calls `Logger.warn` for a far-future deadline and `Logger.error`
    for a near/past deadline (mocked `Logger`, injected `now`).

## Out of scope / non-goals

- No throttling or sampling of deprecation logs.
- No instrumentation of non-endpoint `@deprecated` items.
- No removal of the legacy `Warning` header.
