# Okta SSO

Two parallel paths exist for Okta single sign-on:

1. **Instance-wide (env-based)** — a single Okta org configured via
   environment variables. Applies to every user on the instance. This is the
   original implementation and works the same as before.
2. **Per-organization (DB-stored)** — each organization on a shared multi-org
   instance configures its own Okta org via the *Settings → Single Sign-On*
   admin panel. Added for shared deployments where every customer needs their
   own Okta tenant.

Both paths coexist. Per-org config takes precedence over env-based config
when both apply to a user's email domain.

This mirrors the [Azure AD SSO](./azure-ad-sso.md) design — read that first
for the shared discovery / cross-org / rollout model. This doc only covers
the Okta-specific differences.

## Key difference from Azure: no strategy cache

Azure registers a `passport-openidconnect` strategy per org
(`azuread:<orgUuid>`) and caches it with a TTL, because the strategy is built
once and reused. Okta is **simpler**: its custom `openid-client`-based
strategy (`OpenIDClientOktaStrategy`) constructs its client **per request**
inside `authenticate()`. So there is no strategy cache and no dynamic
`passport.use(...)` registration — the single `'okta'` strategy is registered
once at startup and resolves the right config on every call.

Because of this, the `'okta'` strategy is **always** registered in `App.ts`
(not gated on env availability), so per-org Okta works even when no
instance-level Okta env config is set.

## When to use which

| Scenario | Path |
|---|---|
| Self-hosted / on-prem single-org instance | Env-based — set `AUTH_OKTA_*` env vars. No DB rows needed. |
| Single-tenant dedicated cloud instance (one customer) | Env-based, same as on-prem. |
| Shared multi-org cloud instance (`app.lightdash.cloud`) | Per-org DB config, one row per customer. Env vars left unset. |
| Migrating a customer from instance Google to org-specific Okta | Per-org DB config — overrides instance Google for that customer's domain. |

## Env-based path (unchanged)

`AUTH_OKTA_OAUTH_ISSUER`, `AUTH_OKTA_DOMAIN`, `AUTH_OKTA_OAUTH_CLIENT_ID`,
`AUTH_OKTA_OAUTH_CLIENT_SECRET` (and optional `AUTH_OKTA_AUTHORIZATION_SERVER_ID`,
`AUTH_OKTA_EXTRA_SCOPES`) are read at startup in `parseConfig.ts` and exposed
as `getOktaConfigFromEnv()` in
[`oktaStrategy.ts`](../packages/backend/src/controllers/authentication/strategies/oktaStrategy.ts).

## Per-org path

### Storage

Same table as Azure: `organization_sso_configurations`, one row per
`(organization_uuid, provider)` with `provider = 'okta'`. The encrypted
`config` JSON blob holds:

| Field | Purpose |
|---|---|
| `oauth2Issuer` | The OAuth issuer URL from the Okta application. |
| `oktaDomain` | The Okta org domain (e.g. `acme.okta.com`), used to build the issuer URI. |
| `oauth2ClientId` / `oauth2ClientSecret` | Okta application credentials. Secret encrypted at rest via `EncryptionUtil`; never returned by the API (`hasClientSecret` boolean instead). |
| `authorizationServerId` | Optional custom authorization server (Okta API Access Management). `null` for the default. |
| `extraScopes` | Optional space-separated scopes appended to `openid profile email`. `null` when unset. |

The shared `enabled`, `override_email_domains`, `email_domains` and
`allow_password` flag columns behave exactly as documented for Azure.

### Discovery flow

Identical to Azure — `UserService.getLoginOptions` is provider-generic. It
calls `OrganizationSsoModel.findEnabledMethodsForEmailDomain(domain)`, maps
each matching row's `provider` to its `OpenIdIdentityIssuerType` (`'okta'` →
`OKTA`), suppresses instance-level SSO for matched users, and applies the
lenient password rule and cross-org filter. No Okta-specific code path.

### Login route (`/api/v1/login/okta`)

`initiateOktaOpenIdLogin` calls `resolveOktaConfig(req)`, which:

1. Reads `?login_hint=<email>` and calls
   `OrganizationSsoService.findEnabledMethodForEmail(email, OKTA)` for a
   matching per-org config.
2. Falls back to `getOktaConfigFromEnv()` when no per-org match.
3. Returns 404 when neither is available.

It then builds the `openid-client` client from the resolved config,
initiates the PKCE flow, forwards `login_hint` to Okta, and **persists the
resolved `organizationUuid` on `req.session.oauth.oktaOrganizationUuid`** so
the callback can re-resolve the same config (the login hint isn't present on
the provider's redirect back).

The callback route (`/oauth/redirect/okta`) runs `passport.authenticate('okta')`.
`OpenIDClientOktaStrategy.authenticate` reads `oktaOrganizationUuid` from the
session: if set, it fetches the config via
`getConfigForOrganization(orgUuid, OKTA)`; otherwise it falls back to the env
config. Then it builds the client and completes the token exchange.

### Settings panel

`packages/frontend/src/components/UserSettings/OrganizationSsoPanel/OktaSsoPanel.tsx`
exposes the credential form + flags to org admins, mounted on the `/sso`
settings route alongside the Azure panel. Gated identically: `manage
Organization` CASL ability + the `sso-organization-settings` feature flag.

## File map (Okta-specific additions)

| Path | Purpose |
|---|---|
| `packages/common/src/types/organizationSso.ts` | `OKTA` provider, `OktaSsoConfig`, summary/upsert/response shapes |
| `packages/backend/src/models/OrganizationSsoModel.ts` | `OKTA → OktaSsoConfig` in the provider type map |
| `packages/backend/src/services/OrganizationSsoService/OrganizationSsoService.ts` | `getOktaConfig` / `upsertOktaConfig` / `deleteOktaConfig` (+ shared generic `getConfigForOrganization` / `findEnabledMethodForEmail`) |
| `packages/backend/src/ee/controllers/OrganizationSsoController.ts` | `/api/v1/org/sso/okta` endpoints |
| `packages/backend/src/controllers/authentication/strategies/oktaStrategy.ts` | `setupOktaIssuerClient(config)`, `getOktaConfigFromEnv`, `resolveOktaConfig`, per-request config resolution |
| `packages/backend/src/App.ts` | Always-register the `'okta'` strategy |
| `packages/frontend/src/components/UserSettings/OrganizationSsoPanel/OktaSsoPanel.tsx` | Admin UI |
| `packages/frontend/src/hooks/organization/useOrganizationSso.ts` | `useOktaSsoConfig` / `useUpsertOktaSsoConfig` / `useDeleteOktaSsoConfig` |
| `packages/frontend/src/components/common/ThirdPartySignInButton/index.tsx` | `forceShow` support for the Okta button |
