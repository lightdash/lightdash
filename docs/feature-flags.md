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
