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

## AI conversation images

`ai-thread-images` is off by default on Cloud, self-hosted instances and previews.
It resolves through a config handler that needs an uploads bucket (below). Prefer
Console organization overrides; standard user overrides and the generic self-hosted
ENV lists also apply.
The upload action and new image context items are gated on the backend, and the
composer uses the server-resolved flag. Existing text attachment routing is unchanged.

The first version supports regular browser chat with a specific agent: first and
follow-up prompts in one conversation. Auto-routing and comparison composers ask
users to choose an agent or start a single conversation before attaching images;
these paths cannot await one definitive attachment claim. Deep research cannot
consume an image-bearing draft. Urgent steering sends text immediately and leaves
images unsent for the next normal message. Image submission failures keep the draft
and local previews; successful claims release local previews. History shows metadata,
dimensions, not downloadable images or persisted thumbnails.

Enable only after every API/worker pod and browser bundle supports `thread_image`.
Reload existing browser tabs before use. Older readers cannot load image-bearing
threads, so after activation rollback must use compatible code or a forward fix,
not the pre-feature version. Console changes affect subsequent backend resolutions;
the composer needs a flag refetch or page reload. ENV changes need a process restart.

Images additionally require a private, durable `UPLOADS_S3_BUCKET`: without one the
flag's handler resolves it off, whatever is stored for the organization, and the
purgeable exports-bucket fallback is refused. Forcing the flag on with
`LIGHTDASH_ENABLE_FEATURE_FLAGS` skips the handler, so the composer offers images
and the server refuses the upload. The bucket uses the base S3 endpoint and credentials. The
scheduler must run even while the flag is off. Images are kept for as long as their thread exists. Deleting the thread,
by hand or through thread retention, removes its images; physical deletion is
asynchronous and retried in bounded batches. Unsent uploads expire after 24 hours.
An independent cleanup ledger survives thread, prompt and organization deletion.
Unreferenced objects have a one-hour grace period for interrupted uploads.
Operators must ensure bucket versioning/noncurrent-object retention does not retain
deleted image versions. Disabling the flag stops new
attachments, not historical replay or cleanup, and does not erase completed writes.

The final serialized model request is measured after provider image encoding,
including system instructions, tools and conversation history. Image-bearing
request ceilings are 32 MB for direct Anthropic, 512 MB for direct OpenAI, and a
conservative 20 MB for custom OpenAI/Anthropic gateways, Google, Vertex, Bedrock,
Azure and OpenRouter (decimal MB). Unknown
routes and gateways may impose lower limits; these application ceilings do not
promise route compatibility. Text-only requests are not subject to this guard.
An over-limit conversation must remove unsent images or start a new thread.
Streaming or multipart provider bodies are not buffered or measured; a one-time
server warning identifies that transport gap. Current language-provider request
serialization is covered by tests.
See [Claude request limits](https://platform.claude.com/docs/en/api/overview#request-size-limits),
[Gemini inline requests](https://ai.google.dev/gemini-api/docs/image-understanding)
and [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision).

The server identifies an image by its leading bytes before decoding it, then always
re-encodes it in its own format, so no metadata block (EXIF, XMP, IPTC, colour
profile, comments) or appended data reaches the bucket or the model. PNG and
lossless WebP keep their pixels exactly. JPEG and lossy WebP are re-encoded at
quality 92, stepping down to 85 then 75 only when the result would exceed the size
limit. Malformed images may need re-saving before upload.

Application limits are 3 MiB and a 2560-pixel longest edge per uploaded image,
and 5 images per prompt. A thread has no image limit of its own; every image is
replayed each turn, so a long thread is bounded only by the request-size
guard on the model call. Browser input
limits are 10 MiB and 40 megapixels, checked from headers before decoding and again
on the oriented bitmap. Backend decoding and validation remain mandatory. These are application limits, not universal provider limits.

A user may start 30 uploads a minute. Images are counted from the cleanup ledger,
so deleting an upload does not free its slot. One image per user is checked and
decoded at a time on each backend process, and more than 10 waiting uploads from
one user are refused. A missing uploads bucket is reported as a storage error, not
as a missing image; if the bucket is unset after images exist, conversations carry
on and the agent is told those images are unavailable. Title generation never reads
image bytes.
Preserve screenshot labels: proportional downscaling, no cropping/upscaling, no
lossy fallback for PNG. Image bytes must not be recorded in model input telemetry
or exception payloads; cost and audit metadata remain available.

Both Sentry tracing modes exclude incoming bodies across the entire thread-files
upload prefix, including documents. Parsed raw bytes move into request-identity
private custody before JSON/error middleware; controllers read them through an
accessor, preventing Express error capture from reintroducing the body. Browser
upload requests also opt out of network-history payload capture. Other request-body
capture is unchanged. Operations follow-up: separately assess global customer query
body capture; do not treat this narrow upload control as global body redaction.

Existing text/CSV follow-ups, outside this image rollout: homepage Auto navigation
carries only prompt text and loses attachment context; comparison conversations
reuse claim-once document IDs; and rejected mixed-image submissions retain CSV
source ownership even while the draft remains. Those legacy routing/ownership
semantics are not redesigned here. Validate browser clipboard/encoding behavior,
model vision support and gateway image forwarding before enabling an organization.

## Pre-aggregates

Pre-aggregates are not behind a feature flag. They are on for every
organization when the instance has a licence, `PRE_AGGREGATES_ENABLED=true` and
pre-aggregate results storage. Preview mode, `LIGHTDASH_ENABLED_FEATURE_FLAGS`
and Console overrides have no effect on them. See
[Enablement](pre-aggregates/CONTEXT.md#enablement).

## Agent identity

`agent-identity` enables organisation identity rules for each warehouse type and
their API, My agent identity, and the connect gate in AI chat. My agent identity
has Agent connections and Warehouse sign-ins tabs. With no connections and no
list error, it shows warehouse sign-ins alone. The same flag gates Snowflake
agent sign-in, BigQuery shared agent accounts, AI access checks, warehouse
capabilities and marker tests. Disabled warehouse identity routes return a typed
`FeatureNotEnabledError` with HTTP 403. Approval returns
`AgentConnectionApprovalError` with code `agent_identity_disabled` and HTTP 403.
The owner list and revoke APIs make no flag check.

Agent connection approval requires the flag for both the person and organisation.
Approval is review-only: it creates no connection, code or token.
An agent connection limits requests using its credential; it does not isolate
[local CLI programs](../packages/cli/README.md#scoped-cli-credentials).

Snowflake rules select **The person**, **The person's agent sign-in** or
**Shared agent account**.
BigQuery rules select **The person** or the **Shared agent account** saved on
each project connection. Both actor rows use the same rule. Service accounts
cannot use a personal Snowflake agent sign-in.

Required rules refuse queries when the selected identity is missing. Optional
rules fall back to the user's credentials when it is missing. A saved BigQuery
shared agent account that cannot sign in always refuses the query. Its queries
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

### Preview shared agent accounts

With `agent-identity` enabled, a preview with a parent project uses the parent's
shared agent account. The original connection matches the parent's original
connection. Additional connections match by name and warehouse type.
The preview ignores its stored account. Save and Test with submitted credentials
are refused. The Agent identity page shows the inherited account read-only.
Test checks the parent's account against the preview's connection. A preview
without a parent keeps its own account.

When the rule requires a shared agent account and the parent has none for the
matching connection, agents are refused on the preview. The page links to the
parent's Agent identity settings.

An inherited account's query failure keeps the warehouse error message.
Postgres and Redshift SQLSTATE `42501`, Trino `PERMISSION_DENIED`, and ClickHouse
code `497` or type `ACCESS_DENIED` add this guidance before it:
"This preview uses the parent's shared agent account, which can't read this
preview's data. Ask an admin to grant it access."
These checks use structured error fields. They do not match message text.
BigQuery, Snowflake, Databricks and Athena do not receive this guidance.
Authentication failures retain their existing handling. Other query failures
retain their original messages.

### Agent capability policy

The capability-policy API and `AgentPermissionService` resolve `agent-identity`
for the target organization only, without a user override. A missing policy starts
in `legacy` mode. Saving with limits on activates `managed` mode; resetting
restores `legacy` and clears the organization capability list. Disabling the flag preserves the
saved policy and makes the permission service return `off` without new checks.

Managed policy resolution gives built-in roles every capability, adds
custom-role capability scopes, then intersects the result with
`allowedCapabilities` when it is not null. Null preserves existing grants until the first save. New policy
defaults contain all eleven capabilities. An empty saved list refuses agent
turns on every covered surface. Custom roles keep their own scopes. MCP owns
Agents over MCP and Allow content changes via MCP; neither setting limits
in-app, Slack or OAuth API operations.
Raw SQL for agents needs the person's own permission and the raw-SQL grant. It
needs no project confirmation.

The credential generation counters on project, shared organization and
extra-connection credentials are still written when the persistent credentials,
credential type or credential subject changes. Nothing reads them.

The ceiling applies to MCP tools and resource reads, in-app and Slack agent tools
and fast data paths, and OAuth REST operations. SQL nodes in mixed-source
pipelines and SQL-source schema scans require the raw-SQL grant
before dispatch or cache access. Semantic-only pipelines require
the query grant. Connected MCP tools also require `external_tools` and an
explicit entry in that server's `enabledToolNames`, matched by server UUID and
original tool name. A null tool list does not admit tools in managed mode.
Personal-access-token and service-account MCP calls are not narrowed, including
composer SQL nodes and schema scans. Personal-access-token and browser-session
REST calls are not narrowed. Existing browser-session MCP authentication behavior
is unchanged. Managed OAuth REST calls cannot change role definitions, role assignments,
membership, space or direct access grants, agent policy, identity or AI-access
settings, personal tokens, service accounts or OAuth
clients, even with the administration capability. Role, project membership,
organization membership, invite creation or resend, and group mutation services
also reject managed OAuth and agent execution contexts. Space creation, including
spaces-as-code imports and missing ancestors, is human-only in managed mode.
Space updates and spaces-as-code imports reject changes to inheritance,
project-member access, or user and group grants at the service boundary.
Metadata-only space edits remain under `content_write`; resubmitting unchanged
access is allowed, but managed OAuth and agent writes omit those access fields
so they cannot restore a concurrent human revocation. Ordinary human and PAT
administration keeps its existing behavior.

Group admission uses the same organization-level `agent-identity` flag.
`allowedGroupUuids: null` allows everyone whose role allows AI. A list admits
members of at least one listed group. If all listed groups are deleted, it
reads as `[]` and admits nobody. It applies with capability limits off and on,
on MCP tools and resource reads, in-app and Slack agents, OAuth REST, and query
sources. Slack requires a verified sender when the restriction is active.

A valid deployment licence allows new group restrictions. Saved restrictions still apply when groups later
become unavailable. Clearing a restriction is always allowed. Personal-access-token
and service-account calls keep their existing exemptions. With `agent-identity`
off, group admission adds no checks or reads. A PUT can set
`mode: 'legacy'` to save group admission.
Reset keeps groups and clears the capability list. Old people and project lists
are ignored and omitted from GET, PUT and reset. An old browser save succeeds
and drops those choices. The page uses the final policy API for Same as the
person, Read and query, and Custom. Capability and group changes require review
before saving.

### Snowflake silent agent refresh

With `agent-identity` enabled and a Snowflake agent sign-in provider selected,
the OAuth endpoint decides whether the grant is alive. Successful refreshes
update the token and grant deadline together through a guarded write.
Temporary failures keep credentials and return a retryable error. A confirmed
`invalid_grant` refusal emits expiry analytics on query evaluations.
Side-effect-free connection status checks do not reject a sign-in solely because
its stored deadline has passed. Non-agent Snowflake authentication is unchanged.

### OAuth scope enforcement

OAuth scope enforcement has no feature flag. Every OAuth bearer token is
limited to its granted scopes on every request: `read` and `mcp:read` allow
read operations, `write` and `mcp:write` also allow writes, and MCP tools
need `mcp:read` or `mcp:write`. A token with no scopes has no access.
Personal access tokens, sessions and service accounts keep their permissions.

At grant issuance, an authorize request without a scope receives the scopes
registered for the client. The request fails with `invalid_scope` when the
client has no registered scopes or when it asks for an unknown scope.
Admin-created clients can only request scopes they registered. Self-registered
and URL-identified clients can request any known scope, because their
registration is not authenticated. The same rules apply on refresh. The
consent page lists the resolved scopes.
Refreshing a token that has no scopes gives it the client's registered scopes.
Each use of the registered scopes logs `oauth_scope_defaulted`. Admin-created
OAuth clients are registered with `read`, `write`, `mcp:read` and `mcp:write`.

OAuth tokens cannot create or rotate personal access tokens, service accounts
or SCIM tokens, manage OAuth clients, or run Learn sandbox commands. Each
refusal logs `oauth_credential_mint_refused` with the operation, client id,
scopes, user, organization and the CLI version from the user agent when
present.

One temporary exception keeps browser login in CLI releases before 3.88.0
working until 15 March 2027 (`CLI_OAUTH_PAT_COMPAT_UNTIL` in
`auth/oauthScopes/credentials.ts`). A token for the `lightdash-cli` client
with the `write` scope, not bound to an agent connection, in an organization
without `agent-identity`, can create a personal access token. That token
expires after at most 30 days, or sooner if `PAT_MAX_EXPIRATION_TIME_IN_DAYS`
is lower. Each use logs `oauth_cli_pat_compat_used`. Rotation and every other
credential operation stay refused. After that date, old CLI browser login
fails with `Failed to create PAT: 403 Forbidden`; upgrade the CLI to 3.88.0 or
later, or use `lightdash login --token`.

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

When enabled, local dbt compilation refuses ambient authentication modes.
Use an explicit key, a person's sign-in or BigQuery workload identity federation
instead. The dbt child process also stops inheriting the cloud credential
variables in `CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS`, including those in
the machine allowlist. Project environment variables and target-injected
credentials remain available. The server environment does not change.

BigQuery workload identity federation counts as explicit credentials because its
provider is configured per project and its federated principal is scoped by the
customer's workload identity pool. The dbt child receives a generated
`external_account` file through `GOOGLE_APPLICATION_CREDENTIALS`, without a
service account key or inherited Application Default Credentials (ADC). Its
subject token still comes from the server's Google identity, so
`bigquery-workload-identity-auth` must stay off on shared instances.

Disabling the flag restores the existing profile and child-environment behaviour.
It does not change credential selection, revoke credentials or stop work already
in progress. This policy does not isolate the child from host files or metadata
endpoints; it rejects known ambient modes and filters inherited variables.

### Mixed warehouse connections

`mixed-warehouse-connections` is off by default on Cloud and self-hosted. It
allows originals and extras of every user-connectable warehouse type, in any
mix. With it off, only Postgres, Athena and Snowflake originals can hold extras,
and extras must use the original type. Trino is refused with the flag off.
Backend-provisioned DuckDB variants are always refused. The multi-connection rollout flag and
licence checks still apply.

Create, credential update and switch requests resolve this flag for the requesting
user and the project's organisation. User and organisation Console overrides
apply. The add-connection modal uses the server-resolved flag. Console changes
apply to the next backend request and frontend flag refetch. The generic ENV
precedence above applies; ENV changes require an API restart.

Disabling the flag restores the original allowlist for new saves and switches.
An existing extra cannot change its type with either flag value; add a new
connection instead. It does not remove
saved connections or change query execution. Mixed-type extras keep their own
user-credential requirement; same-type extras still inherit the original's.

### Previews inherit across warehouses

`preview-inherits-across-warehouses` is off by default; organisation scope. With
it on, a CLI preview on a different Snowflake warehouse than its parent inherits
the parent's connection settings. It applies when a preview is created or its
credentials are refreshed from the CLI; saved previews are not changed.

### Composer charts

`composer-charts` is off by default; organisation scope. It gates composer
charts shown as dashboard tiles.

Rollout rule: do not enable it for an organisation that embeds dashboards with
`@lightdash/sdk` until its apps run version **3.245.0** or later, the first
SDK release containing PR #32548. Older SDKs throw on the unknown
`composer_chart` tile type, and the whole embedded dashboard shows the error
fallback. Turning the flag off later
does not hide tiles already added. Iframe embeds and the web app are not
affected. Check an organisation's SDK versions in request logs before enabling:
`sdkVersion`, or `clientVersion` for SDKs older than 0.2617.0.

### Mobile app access

`mobile-app-access` is on by default. It decides whether an organisation can use
the mobile apps. It has a handler that supplies the default; overrides and the
generic ENV lists still apply. It resolves for the organisation only: user
overrides are ignored.

A mobile token is an OAuth token of a client registered with a
`com.lightdash.mobile:` redirect URI. The server reads the client and the
organisation from the stored token row. It never trusts a request header.

With the flag off for an organisation, the server:

- denies every request that carries a mobile access token with HTTP 401,
  `MobileOrgDisabledError`, `data.code = "mobile_org_disabled"` and
  `data.organizationUuid`;
- denies refresh for a mobile client with HTTP 400 `invalid_grant` and does not
  consume the refresh token;
- denies every other grant for a mobile client, and QR claim, cancel, probe and
  redeem, with HTTP 403 `access_denied`;
- sends a browser sign-in for a mobile client back to the app with
  `error=access_denied`;
- refuses QR code creation on the web with reason `mobile_app_disabled`;
- sends no push notification and no live activity update for the organisation;
- refuses a new push installation, push-to-start token or live activity
  registration with the 401 above, for any credential, and creates no start
  attempts for a new prompt;
- removes the push installations of a mobile grant when it denies that grant,
  together with the installations the same person registered with a cookie
  session;
- removes the push installations a person registered with a cookie session
  when it answers that person with the 401 above on the health check or on a
  push registration route.

OAuth responses carry `error_description = "mobile_org_disabled"` and
`organization_uuid`. The organisation is always the one the presented
credential belongs to. `GET /api/v1/mobile/access` is the health check for the
apps: 200 when enabled, the 401 above when disabled.

Web sessions, personal access tokens, service accounts, the CLI, MCP clients and
other organisations are not affected. `POST /api/v1/oauth/revoke` still works.

**Console.** Create the flag with no default. A default of off disables mobile
access for every organisation in that deployment. Add an organisation override
set to off to disable one organisation. Remove the override, or set it to on, to
enable it again.

**Propagation.** The server reads the flag on each check and keeps no cache. A
Console change applies to the next request. A response that is already streaming
finishes.

**Enable again.** The server keeps no revocation record. New sign-ins work at
once, and an unexpired token works again. An app that received the denial has
deleted its tokens, so the person signs in again. A device that the
server answered with the denial has no push installation left, so it receives
pushes again only after the app registers one, which needs a valid sign-in.
This does not depend on a request from the app to remove the installation. A
device that stayed offline for the whole time keeps its installation and its
sign-in.

**ENV.** `LIGHTDASH_DISABLE_FEATURE_FLAGS=mobile-app-access` turns mobile access
off for the whole deployment. `LIGHTDASH_ENABLE_FEATURE_FLAGS=mobile-app-access`
forces it on, and Console cannot turn it off there. ENV changes need a restart.

**Limits.**

- An app that stays offline keeps its cached data until it next contacts the
  server.
- The 401 and `invalid_grant` pair makes app versions that do not know the code
  sign out through their expired-session path.
- The apps can also sign in with a password and a cookie session. The server
  cannot tell that session from a web session and does not deny it. The apps
  call the health check, which answers 401 for a cookie session too; that check
  is not a security control.
- A person who registers an OAuth client of their own with another redirect URI
  keeps the API access that the CLI has. A personal access token that a person
  created earlier also keeps working. The flag controls the apps, not the API.
- The token exchange grant (QR code and Microsoft ID token) accepts mobile
  clients only.
- The sign-in redirect carries `organization_uuid` only when it goes to the
  app's own redirect scheme.
- If the database read for the flag fails, the resolver logs a warning and uses
  the default, which is on.

### Mobile QR sign-in and source project support

QR sign-in has no feature flag of its own. It needs Cloud mode, and
`mobile-app-access` refuses every QR action when it is off. Mode, user and project
access checks still apply.

`GET /api/v1/mobile/sign-in-capabilities` advertises implemented protocol support,
not QR availability or permission. Its static response always has `schemaVersion: 1`
and `capabilities.mobile_sign_in_source_project: 1`, independent of flags, sessions,
users and organisations. It resolves no flags and sends `Cache-Control: no-store`.

Mint validates optional source project access, organisation and DEFAULT type.
Token exchange returns stored context only when `include_source_project=true`.
The web makes one uncached, bounded discovery request per mint attempt with a source
project. Unknown or failed discovery uses the exact legacy mint shape. It retains
no positive result. Static protocol discovery grants no access and issues no code
or token.

## BigQuery OAuth Drive access

`bigquery-oauth-drive-access` is organization-scoped and off by default. When on,
"Sign in with Google" for BigQuery (`/login/bigquery`) also requests
`https://www.googleapis.com/auth/drive.readonly`, so personal BigQuery
credentials can query external tables backed by Google Sheets or other Drive
files. BigQuery rejects `drive.file`, `spreadsheets` and `spreadsheets.readonly`
for these tables.

`drive.readonly` is a restricted Google scope. Only enable the flag for an
organization once the instance's OAuth app is verified for it; until then users
see Google's unverified-app screen, which counts towards the 100-user cap.
Existing users must sign in to BigQuery again to grant the scope. The Google
login with `AUTH_GOOGLE_INCLUDE_BIGQUERY_SCOPE` does not request it, because the
organization is unknown at login. Disabling the flag stops new requests for the
scope; it does not revoke tokens already granted.
