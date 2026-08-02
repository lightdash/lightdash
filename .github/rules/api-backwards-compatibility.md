# API backwards-compatibility review rules

Applies to changes in `packages/backend/**/*.ts` and `packages/common/**/*.ts` that touch the HTTP API contract (request/response shapes, endpoints, status codes, error shapes).

The backend serves clients it does **not** control and that may be **many versions behind**:
- **Customer-built automation and scripts** that call our public REST API directly (via PATs, service accounts, CI/CD pipelines). These are written and pinned by customers, are completely outside our control, and are typically not versioned at all — assume they read responses and send requests in exactly the shape they were written against.
- The `@lightdash/cli`
- Chart-as-code
- The `@lightdash/sdk` embed bundle (a frozen frontend pinned by the embedder)

These clients upgrade Lightdash without re-installing, so **a newer server must stay backwards compatible with older clients**. You cannot retro-fix a shipped or customer-owned client — their code already reads fields unguarded and sends fixed request shapes, so the only remedy lives in the backend.

> Reference incident: removing `echarts6` from the health response broke every chart in old SDK bundles that read `health.echarts6.enabled` unguarded (`Cannot read properties of undefined`). Fix was to re-add `echarts6: { enabled: false }` — hardcode-to-keep, don't delete.

## API surface to treat as a public contract

- Every endpoint exposed via `tsoa` controllers (`packages/backend/src/**/*Controller.ts`, reflected in `packages/backend/src/generated/swagger.json`)
- The health response and the embed endpoints (`packages/backend/src/ee/**`)
- Any GET response shape external consumers read (query results, content, saved charts, dashboards, spaces)
- The `packages/common` types those requests/responses serialize

When unsure whether an external client reads a field, **assume it does**.

## Flag these as breaking (call out + require confirmation)

- Removing or renaming a **response** field a client reads
- Narrowing a response field: present→optional, non-null→nullable, type change, or removing an **enum value** old code switches on
- Removing/renaming an **endpoint**, or changing its path / method / status codes / error shape
- Tightening a **request**: new required param, optional→required, or stricter validation — an old client sends the old shape → 4xx

## These are safe

- Adding an optional response field
- Adding a new endpoint
- Adding an optional request param with a default
- Widening accepted request types

## When you find a break

Do not accept "the current first-party frontend guards it" — old shipped clients don't, and neither do the customer scripts and automation built directly on the API. Name the field/endpoint and the old-client failure mode (what crashes, what status), then require one of:
- keep the field (hardcode a safe value, as `echarts6` did)
- keep accepting the old request shape
- version the endpoint

If the break is intentional and acceptable, get explicit confirmation. For an endpoint being retired, it must go through the deprecation flow (deprecation headers + sunset date) before removal — see `docs/` deprecation guidance — never delete past the sunset date without it.
