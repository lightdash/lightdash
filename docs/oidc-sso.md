# Generic OIDC SSO

Per-organization generic OpenID Connect SSO. Follows the same model as
[Azure AD](./azure-ad-sso.md) and [Okta](./okta-sso.md) — read those first for
the shared discovery / cross-org / rollout model. This doc covers only the
OIDC-specific differences.

## Strategy mechanism: same as Azure (async strategy cache)

OIDC uses `openid-client` with async issuer discovery
(`Issuer.discover(metadataDocumentEndpoint)`), so it follows the **Azure
pattern**, not Okta's per-request one:

- `createGenericOidcStrategyForConfig(config)` in
  [`oidcStrategy.ts`](../packages/backend/src/controllers/authentication/strategies/oidcStrategy.ts)
  builds the strategy from a config object using the **client-secret flow**.
- `apiV1Router.ts` registers per-org strategies as `oidc:<orgUuid>` in a cache
  with a 10-minute TTL (`registerGenericOidcStrategyForOrg`, async because of
  discovery), resolves them by email login-hint
  (`resolveGenericOidcStrategyName`), and re-registers from the DB on callback
  if evicted. The strategy name is stored on `req.session.oauth.oidcStrategyName`.
- The env-based `'oidc'` strategy (registered at startup in `App.ts`) is the
  fallback, exactly like Azure.

**Per-org supports the client-secret flow only.** The env-based path
(`createGenericOidcPassportStrategy`) additionally supports the
`private_key_jwt` / x509 cert flow; per-org config does not expose it (the
current customers — deepl, verto — use client secret).

### Operational notes (discovery in the request path)

Unlike Azure — whose endpoints are templated from the tenant ID, so building a
strategy is synchronous — generic OIDC must call `Issuer.discover()` (a network
fetch of the discovery document) to learn the authorize/token/userinfo
endpoints. This is why `registerGenericOidcStrategyForOrg` is `async` and runs
inside the login/callback request path. The cost is bounded:

- **Cached:** discovery only runs on a strategy-cache *miss* — roughly once per
  10 minutes per org, not on every login.
- **Timeout:** `openid-client` applies a default **3500ms** HTTP timeout, so a
  slow/unreachable metadata endpoint fails fast (`RPError`) rather than hanging
  the worker.
- **Contained:** a misconfigured `metadataDocumentEndpoint` only delays/fails
  *that* org's login (currently surfaced as a 500 via `next(error)`); other
  orgs and the env-based path are unaffected.

### Backwards compatibility with env config

The env path is untouched: `App.ts` still registers the `'oidc'` strategy at
startup (gated on `isGenericOidcPassportStrategyAvailableToUse`), and
`createGenericOidcPassportStrategy` is unchanged. The async per-org registration
is reached only when a DB-stored OIDC config matches; env-only instances fall
back to the startup-registered `'oidc'` strategy with identical behavior.

## Config fields

Stored encrypted in `organization_sso_configurations` (`provider = 'oidc'`):

| Field | Purpose |
|---|---|
| `clientId` / `clientSecret` | OIDC client credentials (secret encrypted; never returned — `hasClientSecret` instead). |
| `metadataDocumentEndpoint` | OIDC discovery document URL (`.well-known/openid-configuration`). |
| `scopes` | Optional space-separated scopes; defaults to `openid profile email`. `null` when unset. |

Shared flag columns (`enabled`, `override_email_domains`, `email_domains`,
`allow_password`) behave as documented for Azure.

## Discovery, login options, endpoints

- `getLoginOptions` is provider-generic: `'oidc'` maps 1:1 to
  `OpenIdIdentityIssuerType.GENERIC_OIDC`, so discovery, force-redirect and
  password suppression work unchanged.
- Endpoints: `GET/PUT/DELETE /api/v1/org/sso/oidc` on `OrganizationSsoController`.
- Frontend: `GenericOidcSsoPanel` (uses `IconLock` as its icon — OIDC has no
  brand logo), `useGenericOidcSsoConfig` hooks, and `forceShow` support on the
  `GENERIC_OIDC` case of `ThirdPartySignInButton`.

## File map (OIDC-specific additions)

| Path | Purpose |
|---|---|
| `packages/common/src/types/organizationSso.ts` | `GENERIC_OIDC` provider, `GenericOidcSsoConfig`, summary/upsert/response shapes |
| `packages/backend/src/models/OrganizationSsoModel.ts` | `GENERIC_OIDC → GenericOidcSsoConfig` in the provider map |
| `packages/backend/src/services/OrganizationSsoService/OrganizationSsoService.ts` | `getGenericOidcConfig` / `upsertGenericOidcConfig` / `deleteGenericOidcConfig` |
| `packages/backend/src/ee/controllers/OrganizationSsoController.ts` | `/api/v1/org/sso/oidc` endpoints |
| `packages/backend/src/controllers/authentication/strategies/oidcStrategy.ts` | `createGenericOidcStrategyForConfig` |
| `packages/backend/src/routers/apiV1Router.ts` | `oidc:<orgUuid>` strategy cache + resolution, login/callback rewiring |
| `packages/frontend/src/components/UserSettings/OrganizationSso/GenericOidcSsoPanel.tsx` | Admin UI |
| `packages/frontend/src/hooks/organization/useOrganizationSso.ts` | `useGenericOidcSsoConfig` hooks |
