# Azure AD SSO

Two parallel paths exist for Azure Active Directory single sign-on:

1. **Instance-wide (env-based)** — a single Azure tenant configured via
   environment variables. Applies to every user on the instance. This is the
   original implementation and works the same as before.
2. **Per-organization (DB-stored)** — each organization on a shared multi-org
   instance configures its own Azure tenant via the *Settings → Single
   Sign-On* admin panel. Added for shared deployments where every customer
   needs their own tenant.

Both paths coexist. Per-org config takes precedence over env-based config
when both apply to a user's email domain.

## When to use which

| Scenario | Path |
|---|---|
| Self-hosted / on-prem single-org instance | Env-based — set `AUTH_AZURE_AD_OAUTH_*` env vars. No DB rows needed. |
| Single-tenant dedicated cloud instance (one customer) | Env-based, same as on-prem. |
| Shared multi-org cloud instance (`app.lightdash.cloud`) | Per-org DB config, one row per customer. Env vars left unset. |
| Migrating a customer from instance Google to org-specific Azure | Per-org DB config — overrides instance Google for that customer's domain. |

## Env-based path (unchanged)

`AUTH_AZURE_AD_OAUTH_CLIENT_ID`, `AUTH_AZURE_AD_OAUTH_CLIENT_SECRET`,
`AUTH_AZURE_AD_OAUTH_TENANT_ID` (and the cert-based variants for
`private_key_jwt` flow) are read at startup in `parseConfig.ts`. If the
client ID is set, `App.ts` registers a passport strategy under the name
`'azuread'` via `createAzureAdPassportStrategy` in
`packages/backend/src/controllers/authentication/strategies/azureStrategy.ts`.

The `/api/v1/login/azuread` and `/api/v1/oauth/redirect/azuread` routes in
`apiV1Router.ts` invoke `passport.authenticate('azuread', …)` against this
startup-registered strategy.

## Per-org path

### Storage

Table `organization_sso_configurations`
([migration](../packages/backend/src/database/migrations/20260511105509_add_organization_sso_configurations.ts),
[extension](../packages/backend/src/database/migrations/20260511120638_extend_organization_sso_configurations.ts)).

One row per `(organization_uuid, provider)` — `provider` is currently always
`'azuread'`. Columns:

| Column | Purpose |
|---|---|
| `config` | Encrypted JSON blob with `oauth2ClientId`, `oauth2ClientSecret`, `oauth2TenantId`. Encrypted at rest via `EncryptionUtil` (AES-256-GCM, key derived from `LIGHTDASH_SECRET`). |
| `enabled` | Master on/off switch for this method. Off → not offered to anyone. |
| `override_email_domains` | If true, the row's own `email_domains` list governs discovery. If false, the org's existing `organization_allowed_email_domains` list is used. |
| `email_domains` | Strict whitelist (only consulted when `override_email_domains = true`). Empty list + override on = method invisible to discovery. |
| `allow_password` | If true, users matched by this method can also use email/password sign-in. If false, password input is hidden and only Azure is offered for matched users. |

### Discovery flow

When a user enters their email at the 2-step login precheck:

1. `UserService.getLoginOptions(email)` calls
   `OrganizationSsoModel.findEnabledMethodsForEmailDomain(domain)`.
2. The model returns all `enabled = true` rows whose effective whitelist
   contains the email's domain — either via `email_domains` (when override
   is on) or via the org's `allowed_email_domains` (when override is off).
3. The matching rows replace instance-level SSO providers in
   `showOptions` — per-org SSO **suppresses** env-based SSO for matched
   users. Example: a customer's domain matched by their per-org Azure
   config no longer sees instance-level Google.
4. Password input visibility follows a lenient rule: if **any** matching
   method has `allow_password = true`, password is shown. Otherwise hidden.

### Cross-org filter

If the email belongs to an existing Lightdash user, the matching SSO methods
are filtered down to orgs that user already belongs to. Discovery is scoped
to the user's own organizations.

```text
existing user @ example.com on org A
  + per-org Azure config on org B that lists `example.com`
  → discovery returns []
  → user sees instance-default precheck, no Azure button
```

Brand-new users (no Lightdash account yet) still get the full discovery,
gated by the feature flag below.

### Login route (`/api/v1/login/azuread`)

The route reads `?login_hint=<email>` from the query and calls
`resolveAzureAdStrategyName(req)` in
[`apiV1Router.ts`](../packages/backend/src/routers/apiV1Router.ts). The
resolver:

1. Calls `findEnabledAzureAdMethodForEmail(email)` to find the matching
   per-org config.
2. If found, dynamically registers a passport strategy named
   `azuread:<orgUuid>` with that org's config and returns the strategy
   name. The strategy is cached for 10 minutes (TTL) and re-registered on
   each request so config changes (e.g. rotated secrets) take effect.
3. If no per-org match, falls back to the env-based `'azuread'` strategy
   when configured at startup. If neither is available, returns 404.
4. Stores the resolved strategy name on `req.session.oauth.azureAdStrategyName`.
5. Forwards `login_hint` to Microsoft so Azure surfaces the right account
   (prevents the wrong-account auto-pick when a browser has a stale
   Microsoft session for another user).

The callback route (`/oauth/redirect/azuread`) reads the strategy name back
from session, re-registers if the cache was evicted (e.g. server restart),
then runs `passport.authenticate`.

### Settings panel

`packages/frontend/src/components/UserSettings/OrganizationSsoPanel/`
exposes the four flags + credential form to org admins. Gated behind:

- `manage Organization` CASL ability (org admins only)
- Feature flag `sso-organization-settings` (see "Rollout" below)

The panel UI lets the admin:

- Enter Azure Application (client) ID, Directory (tenant) ID, and the
  client secret value
- Toggle the master `enabled` switch
- Tick "Override organization's allowed email domains" and edit a domain
  whitelist — when unticked, the org's existing allowed domains apply
- Tick "Allow password sign-in for users matching this method" to permit
  email/password login alongside Azure for that domain

## Login UX scenarios

For an instance with env Google + per-org Azure on `acme.com`:

| Email entered | `showOptions` | UI |
|---|---|---|
| *(no email)* | `[email, google]` | Instance defaults — email input + Google button |
| `someone@unrelated.com` | `[email, google]` | Instance defaults |
| `existing@acme.com` (member of Acme, has password) | `[email, azuread]` | Password input + Azure button. **Google is suppressed.** |
| `newcomer@acme.com` (no account, domain matches) | `[azuread]` + `forceRedirect=true` | Auto-redirect to Azure. Single option, no password fallback. |
| `someone@acme.com` (existing user, but in a *different* org from the Azure config) | `[email]` | Cross-org filter scopes Azure to the user's own org. Falls back to instance options. |

## Rollout

`sso-organization-settings` is a server-side feature flag
(`packages/common/src/types/featureFlags.ts`). Off by default.

**Per-org enablement (shared cloud)** — ops inserts a row into
`feature_flag_overrides` for the customer's org:

```sql
INSERT INTO feature_flags (flag_id, default_enabled)
VALUES ('sso-organization-settings', false)
ON CONFLICT (flag_id) DO NOTHING;

INSERT INTO feature_flag_overrides (flag_id, organization_uuid, enabled)
VALUES ('sso-organization-settings', '<org-uuid>', true)
ON CONFLICT (flag_id, organization_uuid)
WHERE organization_uuid IS NOT NULL AND user_uuid IS NULL
DO UPDATE SET enabled = true, updated_at = now();
```

After this, the customer's org admin sees the "Single Sign-On" entry under
*Organization settings*.

**Instance-wide enablement (self-hosted)** — set the env var:

```bash
ENABLED_FEATURE_FLAGS=sso-organization-settings
```

This makes the panel available to every org admin on the instance. On a
self-hosted single-customer deployment, no further gating is needed.

## File map

| Path | Purpose |
|---|---|
| `packages/common/src/types/organizationSso.ts` | Common types (`OrganizationSsoProvider`, `AzureAdSsoConfig`, summary/upsert shapes) |
| `packages/common/src/types/featureFlags.ts` | `SsoOrganizationSettings` flag enum |
| `packages/backend/src/database/entities/organizationSsoConfigurations.ts` | Knex table type |
| `packages/backend/src/database/migrations/20260511105509_add_organization_sso_configurations.ts` | Table creation |
| `packages/backend/src/database/migrations/20260511120638_extend_organization_sso_configurations.ts` | Adds `enabled`, `override_email_domains`, `email_domains`, `allow_password` |
| `packages/backend/src/models/OrganizationSsoModel.ts` | CRUD + discovery query |
| `packages/backend/src/services/OrganizationSsoService/OrganizationSsoService.ts` | Admin gating, validation, cross-org filter |
| `packages/backend/src/ee/controllers/OrganizationSsoController.ts` | `/api/v1/org/sso/azuread` endpoints |
| `packages/backend/src/controllers/authentication/strategies/azureStrategy.ts` | `createAzureAdOidcStrategyForConfig` |
| `packages/backend/src/routers/apiV1Router.ts` | Dynamic `azuread:<orgUuid>` strategy registration, `login_hint` forwarding |
| `packages/backend/src/services/UserService.ts` | `getLoginOptions` rewrite for discovery + cross-org filter |
| `packages/frontend/src/components/UserSettings/OrganizationSsoPanel/` | Admin UI |
| `packages/frontend/src/hooks/organization/useOrganizationSso.ts` | Frontend hooks for CRUD |
| `packages/frontend/src/pages/Settings.tsx` | Route + nav link, gated by flag |
| `packages/frontend/src/features/users/components/LoginLanding.tsx` | Forwards `preCheckEmail` as `loginHint` to SSO buttons |
