# Account patterns for services and controllers

How to handle the authenticated caller in TSOA controllers and the services they call. Replaces the legacy `req.user` / `SessionUser` style.

This guidance applies to controllers under `packages/backend/src/controllers/` and the services they invoke. Express routers under `packages/backend/src/routers/` are deprecated — new endpoints should be built as TSOA controllers. Don't migrate existing router code to these patterns unless you're already touching it.

The unified `Account` type covers session, PAT, service-account, OAuth, and JWT/embed callers. Reading `req.user` directly only works for session auth and silently degrades for everything else; this doc captures the four rules that keep that surface consistent.

## Concepts glossary

| Term | Meaning |
|------|---------|
| **`Account`** | Discriminated union of all auth-method-specific account shapes. Defined in `packages/common/src/types/auth.ts`. |
| **`RegisteredAccount`** | `Exclude<Account, AnonymousAccount>` — session, PAT, service-account, OAuth. Has a real DB user. |
| **`AnonymousAccount`** | JWT/embed account. `user` is `ExternalUser`; no DB row. |
| **`SessionUser`** | Legacy passport-session user shape. Carries no `authentication` discriminant. Avoid in new code. |
| **`assertRegisteredAccount`** | Type guard that narrows `Account \| undefined` → `RegisteredAccount`, throwing `ForbiddenError` for anonymous/JWT. Defined in `auth.ts:231`. |
| **`assertIsAccountWithOrg`** | Narrows to "has an organization" — works for both registered and JWT-with-org. |
| **`createAuditedAbility(account)`** | Helper on `BaseService` that wraps CASL with audit logging. Reads `authentication.type` off the account. |

## The four rules

### 1. Use `req.account`, not `req.user`

```ts
// ✅
req.account
// ❌
req.user!
```

`req.user` is set only by the passport session strategy. It is missing or partial for OAuth bearer, JWT/embed, and service-account requests. `req.account` is populated uniformly by `sessionAccountMiddleware` (`packages/backend/src/middlewares/accountMiddleware/`) and `jwtAuthMiddleware` (`packages/backend/src/middlewares/jwtAuthMiddleware/`) for every successful auth path, and carries an `authentication.type` discriminant so handlers can branch on auth method instead of duck-typing.

### 2. Use `assertRegisteredAccount` for registered-only endpoints

```ts
import { assertRegisteredAccount } from '@lightdash/common';

async listClients(@Request() req: express.Request) {
    assertRegisteredAccount(req.account);
    return this.services.getOauthService().listClients(req.account);
}
```

Add it as the **first line** of any handler that doesn't intentionally serve embed/JWT traffic. After the assertion, drop the `!` non-null assertion — TypeScript narrows the type for you.

The reasons:

- **Defense in depth at the controller boundary.** Service-level ability checks can accidentally pass for JWT accounts (which legitimately grant view of the embed-bound dashboard). Asserting at the entry point converts a fuzzy "the ability check should deny this" into a hard, explicit denial.
- **Type narrowing pays for itself.** After the assertion, you can drop `!` non-null assertions and access `account.user.userUuid` without casts.
- **Self-documenting.** A reader sees the assertion and immediately knows "this endpoint is not part of the embed surface."

### 3. Use `Account` / `RegisteredAccount` in service signatures, not `SessionUser`

| Use | When |
|---|---|
| `account: Account` | Service serves both registered and anonymous (e.g. embed-shared `ShareService`). |
| `account: RegisteredAccount` | Registered-only — pair with `assertRegisteredAccount` in the controller. |
| `account: SessionAccount` | Session-cookie-only flows (rare). |
| `user: SessionUser` | **Avoid in new code.** Legacy migration only. |

`SessionUser` lacks the `authentication` discriminant, the organization sub-object, and the request context. `RegisteredAccount` makes "I will not function for anonymous callers" a compile-time contract — bugs where embed users reach a registered-only path become uncompilable, not just possibly caught at runtime by an ability check. `BaseService.createAuditedAbility(account)` also reads the auth method off the account; threading a `SessionUser` would lose it.

If an internal helper or model below still requires `SessionUser`, convert at the boundary with `toSessionUser(account)` (`packages/backend/src/auth/account/account.ts`). Require `RegisteredAccount` at the conversion site so the cast is type-safe.

### 4. Use `account.user.userUuid` only after narrowing to registered

| Account type | `user` shape | `userUuid` | `id` |
|---|---|---|---|
| `RegisteredAccount` | `LightdashSessionUser` | ✅ | ✅ (`@deprecated`) |
| `AnonymousAccount` | `ExternalUser` | ❌ | ✅ (synthesized `external::…`) |

```ts
// ✅ registered (after assertion)
assertRegisteredAccount(req.account);
this.analytics.track({ userId: req.account.user.userUuid, ... });

// ✅ generic (may be anonymous)
async getByIdOrSlug(account: Account, id: string) {
    this.logger.info('fetched', { userId: account.user.id });
}
```

`id` and `userUuid` are equal on registered accounts but different on anonymous ones — `id` is a synthesized `external::…` string with no DB row. Tables with FKs to `users` (analytics, PATs, audit log) require a real uuid; reading `id` on a registered path silently leaks synthesized ids and explodes when a JWT account hits it. Asserting registered first guarantees `userUuid` exists, and the `@deprecated` tag on `id` for `LightdashSessionUser` codifies that you should not read it on a known-registered account.

## When you genuinely need to allow JWT/anonymous

Don't use `assertRegisteredAccount`. Pick the narrower guard that matches what the handler actually needs:

- `assertIsAccountWithOrg(account)` — narrows to "has an organization", works for registered or JWT-with-org. Used by `ShareService.getShareUrl`.
- `assertSessionAuth(account)` — narrows to `SessionAccount` (session cookie only).

Embed routes (`/api/v1/embed/...`) expect JWT and don't need any registered assertion — they're the intended JWT surface.

## Migration cheat sheet

When converting an old `user: SessionUser` method:

| Before | After |
|---|---|
| `user: SessionUser` | `account: RegisteredAccount` (or `Account` if JWT-reachable) |
| `req.user!` | `req.account` (after `assertRegisteredAccount`) |
| `user.userUuid` | `account.user.userUuid` |
| `user.organizationUuid` | `account.organization.organizationUuid` |
| `user.organizationName` | `account.organization.name` |
| `isUserWithOrg(user)` guard | `assertIsAccountWithOrg(account)` |
| `user.ability.can(...)` | `this.createAuditedAbility(account).can(...)` (audit-logged) |

## Reference

- `packages/common/src/types/auth.ts` — `Account`, `RegisteredAccount`, `AnonymousAccount`, all assertion helpers.
- `packages/common/src/types/user.ts` — `AccountUser`, `LightdashSessionUser`, `ExternalUser`.
- `packages/backend/src/auth/account/account.ts` — `fromSession`, `fromApiKey`, `fromJwt`, `fromOauth`, `fromServiceAccount`, `toSessionUser`.
- `packages/backend/src/middlewares/jwtAuthMiddleware/` — JWT accounts only attach when the URL path contains `embed` or `projects` and the JWT header is present.
- `docs/audit-logging.md` — how `createAuditedAbility` ties account auth method into audit events.
