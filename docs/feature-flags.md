# Adding and operating feature flags

Internal implementation and rollout guide for engineers and reviewers. Use one
resolver for Console-managed Cloud rollouts and self-hosted ENV configuration.
Flag enablement does not replace authorization or supply infrastructure/credentials.

## Required implementation pattern

1. Register a stable ID in `FeatureFlags` or `CommercialFeatureFlags` in
   [featureFlags.ts](../packages/common/src/types/featureFlags.ts). Describe its
   purpose and decide whether rollout is per user, organization, or deployment.
2. In backend services, call the injected `FeatureFlagModel.get` or
   `FeatureFlagService.get`. Do not implement a rollout gate by reading
   `process.env`, `enabledFeatureFlags.has(...)`, or `NODE_ENV` directly.
3. In the frontend, use `useServerFeatureFlag`, which reads the resolved backend
   value. Do not independently resolve ENV or read PostHog flags for this feature.
4. Gate every backend entry point that needs the feature: direct API calls,
   background work, provisioning, queries, and access to existing cached results
   where applicable. Hiding UI is not backend enforcement.
5. Preserve normal permissions and tenant isolation. A flag grants availability,
   not organization-admin privileges or access to another organization's data.
6. Review preview defaults and infrastructure prerequisites; see
   [preview feature flags](preview-feature-flags.md). Preview success alone does
   not prove Console-only production enablement works.

Backend example inside an authenticated service (after validating the target
organization and the caller's normal permissions):

```ts
const { enabled } = await this.featureFlagModel.get({
  user,
  featureFlagId: FeatureFlags.MyFeature,
});
if (!enabled) {
  throw new ForbiddenError('This feature is not enabled');
}
```

Frontend example (replace the illustrative ID with the registered flag):

```tsx
const flag = useServerFeatureFlag(FeatureFlags.MyFeature);
const enabled = flag.data?.enabled === true;
```

Use the same rollout scope across entry points. For a user-scoped flag, pass the
actual authenticated user and organization. For an organization-scoped background
or warehouse operation, resolve the resource's organization through the shared
resolver; do not fabricate a user UUID or silently fall back to an instance-wide
check because an actor is unavailable. Document whether personal overrides are
supported. Never accept the target organization from an unvalidated request body.

Do not add a per-feature ENV variable or special handler just to support
self-hosting: the generic ENV lists already provide that. Operational configuration
(storage endpoints, credentials, provider availability) can remain ENV-backed,
but its validation is separate from the rollout decision. A custom resolver
handler is an exception that needs an explicit reason, documentation of whether
Console overrides apply, and matching UI/backend tests.

## Resolution and precedence

The source of truth is
[FeatureFlagModel.resolve](../packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts),
not the caller. For ordinary production resolution:

1. `LIGHTDASH_ENABLE_FEATURE_FLAGS` forces the flag on.
2. Otherwise, `LIGHTDASH_DISABLE_FEATURE_FLAGS` forces it off.
3. Otherwise, a registered per-flag handler decides, if present. Some handlers
   consult the database; others short-circuit it. Inspect the specific handler.
4. Otherwise, the database resolves user override → organization override →
   instance default; an absent value resolves off.

**Enable wins if both ENV lists contain the same ID.** Do not rely on ambiguous
configuration. To force a flag off, remove it from the enable list and put it in
the disable list. A Console override cannot defeat an ENV force-on in production.
Legacy per-flag ENV settings mapped by `LEGACY_ENABLE_ENV_VARS` and
`LEGACY_DISABLE_ENV_VARS` also participate; check them when diagnosing a conflict.
The current generic resolver does not fall back to PostHog.

Preview exception: when a flag is forced on by ENV or curated preview defaults,
the resolver consults stored user/org overrides first so QA can turn it off.
An ENV-disable without an ENV-enable still takes precedence. Keep tests with
`previewFeatureFlags.enabled = false` for production behavior.

## Console: Cloud organization rollouts

Lightdash staff manage database flags at [Console](https://console.lightdash.com).
Console writes `feature_flags` and `feature_flag_overrides` in the target
deployment's application database; it does not set pod environment variables.

1. Deploy the code that registers and consumes the flag.
2. Find the flag in Console and select the intended deployment/organization.
3. Prefer an organization override for a targeted organization rollout. Use a
   user override only when the feature explicitly supports user-scoped rollout.
   An instance default affects other organizations sharing that database.
4. Confirm no ENV enable/disable or custom handler overrides the Console choice.
5. Enable, refetch the UI flag, and exercise the actual backend action. Then
   disable and verify the backend rejects the action as intended.

Deleting an override means “fall back,” not “off.” Use an explicit off override
when that is the intended state, subject to the precedence above. Manage flags
through Console's audited workflow rather than ad-hoc SQL.

## Self-hosting: ENV configuration

Self-hosters do not need access to the internal Console. They can set the generic
comma-separated lists in their deployment configuration:

```ini
LIGHTDASH_ENABLE_FEATURE_FLAGS=my-feature,another-feature
LIGHTDASH_DISABLE_FEATURE_FLAGS=third-feature
```

These example IDs are placeholders: use exact registered IDs supported by the
installed version. Preserve existing entries. ENV enablement is deployment-wide,
not an organization isolation boundary. Apply it consistently to API and worker
processes that evaluate the feature, then redeploy/restart those processes.
Enabling a flag does not configure missing storage, credentials, or other required
services. Do not enable preview flag-management endpoints on production merely
to expose a self-hosted toggle UI.

For a temporary Cloud ENV workaround, record its removal: once the normal
Console-controlled path is deployed, remove the forced ENV setting and restart
so Console can turn the feature off again.

## Refresh, caching, and restart expectations

- The standard backend `FeatureFlagModel.get` does not cache database flag
  values; a subsequent database-backed resolution sees a committed Console change.
  Do not capture the resolved boolean at service construction or add a separate
  feature cache without a documented invalidation strategy.
- ENV sets are parsed at startup; changing a deployment configuration requires
  a process rollout. Mixed old/new pods can briefly disagree during rollout.
- `useServerFeatureFlag` uses React Query with `refetchOnMount: false`.
  A page can keep an older value until refetched. For in-app context changes,
  use the existing `refetchFeatureFlags(queryClient)` helper; an external Console
  change may require a page reload/refetch. Do not promise immediate UI refresh.
- Disabling a flag does not undo completed writes, cancel every in-flight job,
  erase downloaded data, or revoke already issued signed URLs. Define the
  cancellation/recheck boundary where that matters.

If the UI appears but the API says “not enabled,” compare the resolver, target
scope, ENV precedence, deployed version, and actual backend response before
attributing it to caching or advising a restart.

## Required tests and review checklist

For a default-off flag with no special handler, test production-mode resolution:

| Configuration                          | Expected                                   |
| -------------------------------------- | ------------------------------------------ |
| No ENV or DB enable                    | Off; existing non-feature paths still work |
| Console organization on, no ENV        | UI and backend action enabled for that org |
| Different organization, no enable      | Off; no cross-org data access              |
| Console organization off, no ENV       | UI/action disabled after refetch/recheck   |
| ENV enable, no DB row                  | On; self-hosting does not require Console  |
| ENV disable, Console on, no ENV enable | Off                                        |
| Both ENV enable and disable            | On, matching standard resolver precedence  |

Also verify:

- Enable → disable → enable on the same running service/client, without restart.
- Non-admin/unauthorized and cross-org requests stay denied while the flag is on.
- Existing projects, cached results, workers, and direct API calls follow the same
  intended gate; preview behavior is covered separately.
- Test the actual resolver with DB fixtures (or a narrowly mocked DB), not only
  a stubbed `enabled: true` result or a mocked authorization helper.
- At least one API/UI smoke test uses Console-style DB enablement **with ENV
  enable unset and preview defaults disabled**. Check the action, not only the menu.
- Document untested live paths and temporary ENV workarounds in the PR.

## Code references

- [Flag registration](../packages/common/src/types/featureFlags.ts)
- [Resolver and database lookup](../packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.ts)
- [Service wrapper](../packages/backend/src/services/FeatureFlag/FeatureFlagService.ts)
- [ENV parsing](../packages/backend/src/config/parseConfig.ts)
- [Frontend hook and refetch helper](../packages/frontend/src/hooks/useServerOrClientFeatureFlag.ts)
- [Resolver tests](../packages/backend/src/models/FeatureFlagModel/FeatureFlagModel.test.ts)

The internal analytics incident is the counterexample: the UI used the standard
resolver while its backend checked only ENV. Enabling Console made the menu
visible but could never enable the API. An ENV workaround can restore availability;
the proper fix is to use the standard resolver across entry points.

## Agent identity

`agent-identity` enables organisation identity rules for each warehouse type and
their API, the agent connection section in My warehouse connections, and the
connect gate in AI chat. The same flag gates Snowflake agent sign-in, BigQuery
AI service account slots, AI access checks, warehouse capabilities and marker
tests. Disabled routes return a typed `FeatureNotEnabledError` with HTTP 403.

Snowflake rules select the same credentials as the user or a separate agent
sign-in for each person. BigQuery rules select the same credentials as the user
or the AI service account saved on each project connection. Both actor rows use
the same rule. Service accounts cannot use a personal Snowflake agent sign-in.

Required rules refuse queries when the selected identity is missing. Optional
rules fall back to the user's credentials when it is missing. A saved BigQuery
AI service account that cannot sign in always refuses the query. Its queries
bypass result caches and pre-aggregates, carry the agent label, and disable the
BigQuery query cache. Replacing its credentials invalidates prior result
provenance.

During a rolling deploy, new pods read per-type rules. Old pods read the legacy
Snowflake switch. Rule writes keep that switch in sync with a required Snowflake
agent sign-in rule. BigQuery slot rules take effect on new pods.

The flag is off by default outside previews and uses the standard resolver with
no custom handler. Preview defaults enable it. Use organisation overrides for
Cloud rollouts; standard user overrides also apply. Self-hosted instances can
use the generic ENV lists and precedence described above.

Snowflake agent sign-in also needs an Enterprise licence and a second Snowflake
OAuth security integration with `IS_AGENTIC = TRUE`. An organisation admin saves
the client on Organization settings → Agent identity. Warehouse administrators manage
restricted session scopes and masking policies in Snowflake. The app does not
configure data access.

Each sign-in and token refresh checks agent activation with the new token. Each
new AI connection checks activation again and disables cached results. A failed
check refuses the connection. AI and dashboard credentials use separate rows and
client cache entries. Credential selection follows the organisation's
Snowflake identity rule.

Console changes apply to the next backend flag resolution. Reload or refetch the
page to update the UI. ENV and OAuth configuration changes need a process
restart. Disabling the flag preserves saved credentials and restores normal query
identity. It does not cancel queries in progress or revoke Snowflake tokens.

### Agent capability policy

The capability-policy API and `AgentPermissionService` resolve `agent-identity`
for the target organization only, without a user override. A missing policy starts
in `legacy` mode. Saving a ceiling or applying the pilot preset activates
`managed` mode; resetting restores `legacy`. Disabling the flag preserves the
saved policy and makes the permission service return `off` without new checks.

Managed policy resolution unions system-role matrix grants with custom-role
capability scopes. The pilot changes the system-role matrix and allowed projects;
it leaves custom roles unchanged. The organization agent switch bounds all
managed agent operations, and the content-write switch bounds content writes.
Raw SQL additionally needs an admin confirmation for the current warehouse
binding. The binding fingerprint uses non-secret routing and identity metadata,
credential generations and database row versions. Credential refreshes can also
invalidate a confirmation. This records an admin assurance, not a verification
of warehouse-side permissions. Entry-point enforcement is integrated separately.

### Snowflake silent agent refresh

`agent-identity-silent-refresh` is a default-on defect-fix kill switch. The
handler uses the standard database resolver with a true fallback. Console user
and organisation overrides and instance defaults apply. The generic ENV lists
have the precedence described above; there is no per-feature ENV setting.

The flag is resolved for the requesting user and organisation only after
`agent-identity` is enabled and a Snowflake agent sign-in provider is selected.
Other identity sources and disabled agent identity add no flag or credential
reads. It affects query refresh and side-effect-free connection status checks.

When on, the OAuth endpoint decides whether the grant is alive. Successful
refreshes update the token and grant deadline together through a guarded write.
Temporary failures keep credentials and return a retryable error. A confirmed
`invalid_grant` refusal emits expiry analytics on query evaluations. When off,
the stored-deadline checks and legacy refresh-error mapping apply.

Console changes affect the next resolution without a restart. ENV changes need
a process restart. Disabling this flag does not undo token rotations or revoke
issued tokens. It does not change non-agent Snowflake authentication.

### Warehouse OAuth refresh locking

`warehouse-oauth-refresh-lock` is a default-on kill switch. When it is on, a
Snowflake or Databricks OAuth refresh runs one at a time per credential row.
Databricks U2M and M2M refresh-token grants use the lock. M2M client-credentials
grants and submitted credentials without a stored owner stay unlocked. Callers
in one process share one refresh. A PostgreSQL advisory
transaction lock serializes refreshes of the row across processes, and the
waiter refreshes with the rotated token that the first caller saved.

Callers resolve the flag for the credential's organisation, without a user
UUID, so personal overrides do not apply. Instance defaults, organisation
overrides and the generic ENV precedence apply.

At most a quarter of the pool, minimum one, holds a refresh lock at
one time in each process. A caller waits up to 30 seconds for a slot and up to
5 seconds for the advisory lock. The guarded token write can wait longer for a
database row lock. Token requests close their sockets after 30 seconds
of inactivity. A timeout returns a retryable refresh error.

Console changes apply to the next refresh. Turning the flag off restores the
previous refresh behavior inside the resolver: no locked reread or request
deadline, with the legacy rotation-write policy. It does not undo rotations or
enable a disabled preview credential-resolution path. ENV changes need a process
restart.

### OAuth scope enforcement

`agent-identity` also enables OAuth scope checks. With that flag off, OAuth
permissions and scope validation keep their existing behaviour. With it on,
checks log refusals but preserve existing decisions by default.

`oauth-scope-enforcement` changes those checks from log mode to enforcement.
It is off by default, has no custom handler and is only resolved when
`agent-identity` is enabled. Enforcement limits OAuth tokens to their scopes,
filters MCP tools and rejects invalid requested scopes at grant issuance.
Personal access tokens, sessions and service accounts keep their permissions.

When `agent-identity` is on, OAuth callers cannot create or rotate personal
access tokens or service accounts, manage OAuth clients, or rotate SCIM tokens.
This separate credential guard refuses requests in both log and enforce mode.
Authentication failures also keep their existing refusal behaviour in both modes.

Both checks use the authenticated user's organisation and user UUID. Console
organisation and user overrides apply through the standard resolver. Generic
ENV enable/disable lists keep the precedence described above. There is no
separate OAuth-scope ENV setting. Console changes apply to the next request or
grant validation; ENV changes require a process restart. Disabling enforcement
restores log mode. Disabling agent identity restores the previous behaviour
without scope-refusal records. Neither change revokes issued tokens.

### Personal credential overlay

`agent-identity` also enforces which fields a personal warehouse credential can
set. Each warehouse has an allowlist of sign-in fields
(`packages/common/src/types/personalWarehouseCredentials.ts`). The query uses
the connection with its auth fields removed, plus the allowlisted personal
fields (`composePersonalWarehouseCredentials` in
`packages/backend/src/services/WarehouseClientFactory/personalCredentialOverlay.ts`).
Host, port, database, compute, TLS, SSH and policy fields such as the Snowflake
and Postgres roles and BigQuery cost limits always come from the connection.

Three auth details differ by warehouse. A Redshift IAM credential uses the
person's own role ARN and external ID, with the person's own AWS keys. Athena
uses only the person's key pair and drops the connection's role, session token
and web identity. A Databricks U2M credential with no OAuth client ID uses the
connection's OAuth app only when the connection itself uses U2M.

With the flag on, a save that sets another field returns HTTP 400. Stored rows
are projected to the allowlist on read, so old extra fields are ignored. A
stored row that cannot be used safely fails with one reconnect error and never
falls back to the shared credential. Databricks rows fail with
`DatabricksTokenError`; other warehouses fail with
`MissingWarehouseCredentialsError`.

The flag resolves for the project's organisation and the person whose credential
is used. A user with no organisation keeps the legacy save. With the flag off,
saves, reads and merges keep their previous behaviour. Disabling the flag does
not rewrite rows saved while it was on.

### Explicit dbt credentials

`dbt-explicit-credentials` is off by default. It uses the standard resolver for
the project's organisation, without a user UUID. Personal overrides do not
apply. Compile, test-and-compile, preview projects and scheduler workers use the
same policy. Console changes apply to the next policy resolution. The generic
ENV lists use the precedence above and need an API and worker restart.

When enabled, local dbt compilation refuses authentication modes that depend on
the server's cloud identity. Use an explicit key or a person's sign-in instead.
The dbt child process also stops inheriting the cloud credential variables in
`CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS`, including those in the machine
allowlist. Project environment variables and target-injected credentials remain
available. The server environment does not change.

Disabling the flag restores the existing profile and child-environment behaviour.
It does not change credential selection, revoke credentials or stop work already
in progress. This policy does not isolate the child from host files or metadata
endpoints; it rejects known ambient modes and filters inherited variables.
