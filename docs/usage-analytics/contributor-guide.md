# Managed Analytics contributor guide

This guide is for agents and contributors turning a dashboard, data app, or Settings
prototype into a feature shipped with Lightdash Analytics. Use the merged PRs below as
examples and follow the current code when applying them.

## Choose the existing pattern

- **Built-in dashboard**. Use this for a report made of saved semantic charts, tables,
  and filters. Start with **Adoption → People & content** and
  [the Adoption dashboard PR](https://github.com/lightdash/lightdash/pull/30535).
- **Managed data app**. Use this for a richer workflow with its own interactions or
  state, such as the Adoption map and team selection. Ship one app that opens from the
  Analytics project and can also be previewed in Settings. Follow
  [the shipped Adoption data app PR](https://github.com/lightdash/lightdash/pull/32624). [The Settings-only map prototype](https://github.com/lightdash/lightdash/pull/32632)
  was closed in favor of this approach.
- **Analytics Settings**. Keep summary cards, date and project filters, and small chart
  subsets in the existing Settings components. A new interactive experience belongs in a
  managed data app preview, with a native fallback. Follow
  [the Settings overview PR](https://github.com/lightdash/lightdash/pull/32529),
  [the dashboard parity PR](https://github.com/lightdash/lightdash/pull/32550), and
  [the query performance PR](https://github.com/lightdash/lightdash/pull/32558).

## Add or change a built-in dashboard

1. Start from a working prototype. Identify the existing system Explore, exact field
   IDs, metric definitions, time grain, filters, and expected behavior with empty or
   partial capture. For instance, “recorded dashboard views” counts successful backend
   fetches and can include repeats. A weekly distinct count must be computed at week
   grain.
2. Define the dashboard, tabs, sections, and charts as typed `UsageDashboardSpec` and
   `UsageChartSpec` entries. Follow
   [adoptionDashboard.ts](../../packages/backend/src/analytics/systemExplores/adoptionDashboard.ts), or the general definitions in `usageDashboardDefinitions.ts` and
   `usageDashboardCharts.ts`. Register the specs in
   [usageDashboards.ts](../../packages/backend/src/analytics/systemExplores/usageDashboards.ts).
   [sampleContent.ts](../../packages/backend/src/analytics/systemExplores/sampleContent.ts)
   generates the content-as-code payload. If a semantic field is missing, add it to the
   backend-owned system Explore and register any new Explore in
   [createAnalyticsExplores.ts](../../packages/backend/src/services/ProjectService/analyticsProject/createAnalyticsExplores.ts).
3. Use stable keys. The bundle key is the dashboard slug, and chart slugs are
   `<bundle-key>-<chart-key>`. Keep existing slugs, field IDs, and filter targets when
   editing or renaming shipped content. Reference tiles by slug and let the target
   project assign UUIDs. Reserve the built-in slug namespace. Sync updates the exact
   managed slug, including replacing edits made to the shipped definition. Custom copies
   with separate slugs retain their own definitions.
4. Use the existing installer. It refreshes system explores, uploads the managed charts
   and layout, and applies verification after installation succeeds. Keep existing
   content in its space so inherited access stays intact. A removed tile can leave saved
   chart history behind. The [sample content guide](sample-content.md) documents
   collision and restoration behavior. See
   [managed content identity and verification](https://github.com/lightdash/lightdash/pull/31552).

## Ship a managed data app

1. Choose the ready source version you want to ship. Follow
   [the Adoption source README](../../packages/backend/assets/analytics/apps/adoption/README.md)
   and use `packages/backend/assets/analytics/apps/<app>/src/` for portable source. The
   normal build overlays those files on the standard template. Remove instance context,
   customer data, uploaded images, and environment-specific references. Ship source and
   synthetic fixtures.
2. Query the managed Analytics project's semantic layer through the standard app
   runtime. Reuse system Explores and stable fields, as Adoption does with
   [peopleAdoption.ts](../../packages/backend/src/analytics/systemExplores/peopleAdoption.ts). Keep query windows and controls explicit. Adoption uses its own rolling periods and
   team selection.
3. Wire the bundle through the existing managed content sync. Follow
   [managedAdoptionApp.ts](../../packages/backend/src/ee/services/AnalyticsProjectService/managedAdoptionApp.ts)
   and
   [AnalyticsProjectService.ts](../../packages/backend/src/ee/services/AnalyticsProjectService/AnalyticsProjectService.ts). Keep a stable manifest slug and use the normal Data Apps availability checks. Match
   the managed identity before updating an existing app. Use the content snapshot and
   source hash to reuse an unchanged ready version, avoid duplicate builds, and queue a
   version when shipped source changes. Send source through the normal app build
   pipeline. An unrelated app at the same slug must be handled as a collision.

## Add a data app to Settings

1. Use the managed Analytics project UUID from
   [LightdashAnalyticsPanel.tsx](../../packages/frontend/src/components/UserSettings/LightdashAnalyticsPanel.tsx). Resolve the app's stable slug on first tab activation and request the signed-in
   viewer's token for the latest ready version. Render through the existing
   `AppIframePreview` and preview transport. Keep the ready iframe mounted so switching
   tabs preserves app state. Follow
   [useAnalyticsAdoptionApp.ts](../../packages/frontend/src/components/UserSettings/AnalyticsOverview/useAnalyticsAdoptionApp.ts)
   and
   [AnalyticsAdoptionPreview.tsx](../../packages/frontend/src/components/UserSettings/AnalyticsOverview/AnalyticsAdoptionPreview.tsx).
2. Link to the standalone app. Show loading while resolving it, then keep the existing
   native charts, filters, and full dashboard link available when the app is disabled,
   inaccessible, or lacks a ready version. Document which filters the app owns.
   Adoption's own controls apply inside the app, and Settings filters apply to its
   native fallback.
3. For native Settings changes, use
   [analyticsOverviewConfig.ts](../../packages/frontend/src/components/UserSettings/AnalyticsOverview/analyticsOverviewConfig.ts)
   and the semantic query hooks. The selected reporting project filters the data, while
   execution stays in the managed Analytics project. Default to seven complete UTC days
   and keep results bounded. Reuse existing query specs, caching, and cancellation.
   Query the active tab, fetch comparison periods after current results settle, and
   stream only when more results are available.

## What the contributor should hand over

In the PR, link the prototype or ready app version, the intended surface, and the
closest merged precedent. Describe the metric grain, date window, filter ownership, and
what the user sees with empty history or unavailable app access. List the slugs and
model fields affected, and show screenshots or a preview of the actual feature. Use
seeded or synthetic data in examples sent outside the team.

### Verification

- **Dashboard**. Validate the bundle with `sampleContent.test.ts` and exercise the new
  semantic queries with the system Explore fixtures. Verify fresh **Create** and
  repeated **Sync** on an existing project. Check saved identities, access, and a
  customer-created copy.
- **Data app**. Verify the target project's semantic queries, standalone app, Settings
  preview, state after tab switches, access or feature disabled, and the fallback before
  a build is ready. Cover sync changes with `AnalyticsProjectService.test.ts` and
  Settings behavior with `AnalyticsOverview.test.tsx`. Check that unchanged source
  reuses the ready version and changed source queues one build.
- **Rollout**. Verify a deployed build and run a real chart or app query in the
  intended test instance. Create and nightly reconciliation use the same managed content
  path. Sync installs definitions and queues app builds. Fresh data depends on capture
  and compaction. The [content sync guide](content-sync.md) explains the schedule and
  administrator recovery. Use [local testing](local-testing.md),
  [live testing](live-testing.md), and the [repository's AGENTS.md](../../AGENTS.md)
  for environment and test commands.
