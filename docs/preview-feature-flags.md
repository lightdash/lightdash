# Feature flags in preview environments

Preview environments (`LIGHTDASH_MODE=pr`) and the Okteto agent dev environment
enable most feature flags by default and expose an API for toggling them, so QA
can validate recent features without a redeploy.

## Defaults

`PREVIEW_ENABLED_FEATURE_FLAGS` (`packages/common/src/featureFlags/previewFeatureFlags.ts`)
is every flag in `FeatureFlags` and `CommercialFeatureFlags` minus a short
exclusion list. New flags are therefore on in previews by default; add an
exclusion, with a reason, when that isn't safe. Flags are excluded when they:

- block or degrade every page (trial block/warning),
- change query or compile semantics, so QA results would mislead,
- change the signup flow (`new-onboarding` also needs SMTP for its email OTP,
  and the register page evaluates it anonymously so no override can undo it),
- act outside the environment (`ai-preview-deploy-setup` opens pull requests on
  real repos),
- are off pending a security review, or are deprecated,
- derive their value from instance configuration (`ai-copilot`,
  `results-cache-enabled`, `enable-timezone-support`) — these are left to their
  config handler so a preview never advertises an unconfigured backend. To test
  AI copilot in a preview, configure a provider (`AI_COPILOT_ENABLED` plus
  credentials) rather than forcing the flag.

Flags that only gate UI can still be enabled while their backend is
unconfigured (for example email whitelabel needs a Postmark token, data apps
need an app runtime). Those surfaces render but won't work end to end.

This is controlled by `LIGHTDASH_PREVIEW_FEATURE_FLAGS_ENABLED`, which defaults
to `true` in PR mode. Set it to `false` for production-like flag resolution, or
`true` in any other environment (the Okteto dev compose file does this).

## Managing flags at runtime

The management endpoints require an organization admin and only work when
`LIGHTDASH_PREVIEW_FEATURE_FLAGS_ENABLED` resolves to true — elsewhere they
return 404. Overrides are stored per organization in `feature_flag_overrides`.

```bash
# List every flag with its resolved value
curl -H "Authorization: ApiKey $LDPAT" "$SITE_URL/api/v2/feature-flag"

# Turn a flag off (or on) for the organization
curl -X POST -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  -d '{"enabled": false}' "$SITE_URL/api/v2/feature-flag/enable-data-apps"

# Drop the override and fall back to the environment default
curl -X DELETE -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v2/feature-flag/enable-data-apps"
```

Unknown flag ids are rejected, so a typo can't silently create a dead override.

In an Okteto dev environment the backend runs from the committed TSOA output, so
run `pnpm generate-api` (and restart the API) if these routes 404. Preview
environments build with `pnpm build`, which regenerates them.

## Resolution order

`FeatureFlagModel.get()` resolves in this order:

1. `LIGHTDASH_ENABLE_FEATURE_FLAGS` and `LIGHTDASH_DISABLE_FEATURE_FLAGS`. Enable
   wins when a flag is in both; disable is absolute — no override overrides it.
2. In preview environments, a stored override for the user or organization,
   consulted only for flags the environment forces on.
3. `PREVIEW_ENABLED_FEATURE_FLAGS`, in preview environments.
4. Per-flag config handlers (for example `EDIT_YAML_IN_UI_ENABLED`).
5. Database: user override, then organization override, then flag default.

Consulting overrides costs a couple of extra indexed lookups per flag check, in
preview environments only.
