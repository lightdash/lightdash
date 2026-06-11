# OneLogin SSO

Per-organization OneLogin SSO. Follows the [Azure AD](./azure-ad-sso.md)
pattern — read that first for the shared discovery / cross-org / rollout model.
This doc covers only the OneLogin-specific bits.

## Strategy mechanism: same as Azure (sync strategy cache)

OneLogin uses `passport-openidconnect` with endpoints **templated from the
issuer** (`{issuer}/oidc/2/auth`, `/token`, `/me`), so building a strategy is
**synchronous** — no issuer discovery, exactly like Azure (and unlike OIDC).

- `createOneLoginStrategyForConfig(config)` in
  [`oneLoginStrategy.ts`](../packages/backend/src/controllers/authentication/strategies/oneLoginStrategy.ts)
  builds the strategy from a config object; the env-based `oneLoginPassportStrategy`
  now uses the same builder.
- `apiV1Router.ts` registers per-org strategies as `oneLogin:<orgUuid>` in a
  cache with the shared 10-minute TTL (`registerOneLoginStrategyForOrg`),
  resolves them by email login-hint (`resolveOneLoginStrategyName`), and
  re-registers from the DB on callback if evicted. Strategy name is stored on
  `req.session.oauth.oneLoginStrategyName`.
- The env-based `'oneLogin'` strategy (registered at startup in `App.ts`) is
  the fallback.

## Config fields

Stored encrypted in `organization_sso_configurations` (`provider = 'oneLogin'`):

| Field | Purpose |
|---|---|
| `oauth2Issuer` | OneLogin OIDC issuer URL; the auth/token/userinfo endpoints are derived from it. |
| `oauth2ClientId` / `oauth2ClientSecret` | OneLogin application credentials (secret encrypted; never returned — `hasClientSecret` instead). |

Shared flag columns (`enabled`, `override_email_domains`, `email_domains`,
`allow_password`) behave as documented for Azure.

## Discovery, login options, endpoints

- `getLoginOptions` is provider-generic: `'oneLogin'` maps 1:1 to
  `OpenIdIdentityIssuerType.ONELOGIN`, so discovery, force-redirect and
  password suppression work unchanged.
- Endpoints: `GET/PUT/DELETE /api/v1/org/sso/oneLogin`.
- Frontend: `OneLoginSsoPanel` (reuses `ONELOGIN_LOGO`), `useOneLoginSsoConfig`
  hooks, and `forceShow` on the `ONELOGIN` case of `ThirdPartySignInButton`.

## File map (OneLogin-specific additions)

| Path | Purpose |
|---|---|
| `packages/common/src/types/organizationSso.ts` | `ONELOGIN` provider, `OneLoginSsoConfig`, summary/upsert/response shapes |
| `packages/backend/src/models/OrganizationSsoModel.ts` | `ONELOGIN → OneLoginSsoConfig` in the provider map |
| `packages/backend/src/services/OrganizationSsoService/OrganizationSsoService.ts` | `get/upsert/deleteOneLoginConfig` |
| `packages/backend/src/ee/controllers/OrganizationSsoController.ts` | `/api/v1/org/sso/oneLogin` endpoints |
| `packages/backend/src/controllers/authentication/strategies/oneLoginStrategy.ts` | `createOneLoginStrategyForConfig` + availability flag |
| `packages/backend/src/routers/apiV1Router.ts` | `oneLogin:<orgUuid>` strategy cache + resolution, login/callback rewiring |
| `packages/frontend/src/components/UserSettings/OrganizationSso/OneLoginSsoPanel.tsx` | Admin UI |
| `packages/frontend/src/hooks/organization/useOrganizationSso.ts` | `useOneLoginSsoConfig` hooks |
