# Data App reach

`data_app_reach` answers who consumed which app over time. It uses a dedicated `data_app_reach_events` stream plus the existing current content inventory and user lookup. Existing Data app events, User activity and their raw HTML-load counts keep their meanings. This PR does not change managed dashboards.

## Definitions

- **Launch:** the first captured transition to an app with a ready version in a shared space, outside preview projects. A personal app launches when first moved into a space. A later build does not invent a launch for an already shared historical app. Creation alone is not launch. Missing pre-deployment history stays unknown.
- **Captured loads:** deduplicated navigation attempts, including preview, delivery, reload and failed/aborted loads.
- **Qualifying views:** a signed-in standalone or dashboard navigation to a ready shared app, with HTML served and SDK startup observed, excluding reloads, preview projects, builder/editor UI, chart-type rendering, deliveries and embeds. A builder reading their own shared app in the consumer UI is a qualifying view.
- **Consumers:** qualifying viewers who were neither the app creator nor a version author when the capability was minted. Missing author history remains unknown and is excluded from non-builder counts. Becoming a builder later does not rewrite prior events. Embedded viewers have no registered-user identity; the token issuer is not counted as the reader.
- **Returning consumers:** a qualifying non-builder viewer seen on a later UTC day for the same app. Repeated visits on the same day are not a return. Distinct consumers cannot be added across apps or dates.
- **Seven-day adoption:** among captured launches at least seven days before the latest inventory's closed UTC day, the share with a non-builder view during the first seven days. Younger launches and unknown launches are excluded. This measures adoption observed in retained, processed events; it does not certify uninterrupted capture, complete historical readership or human attention. A capture outage or compaction backlog can delay observations. No observed adoption is not proof of no use.
- **Render status:** `SDK started` is an SDK startup signal, not proof that every visual rendered successfully. New SDK bundles report observed uncaught runtime errors without error content. Older bundles and apps without an SDK may have unknown outcomes. A later error can change an earlier view's qualification after daily processing.

Names come from current snapshots. Keep app/user IDs in grouping when distinct items can share a name. Users absent from the current lookup retain their captured UUID.

## Capture and refresh

Capture uses the existing `USAGE_EVENTS_ENABLED` sink gate. Signed preview capabilities retain actor, organization, app/version and backend-derived author/share context; the client supplies only the UI context hint and a navigation UUID. Context lookup is indexed and limited to one second, and failure falls back to an ordinary preview capability. It never rejects the app request. Existing permissions and capability validation remain unchanged.

The optional browser hook correlates one HTML attempt with SDK startup/errors. No frontend analytics.track call or runtime-error text is stored. It does not navigate on token renewal. Refreshes get new IDs and a reload label. The backend ignores body-supplied identities.

The existing compactor processes the new stream with the same closed-day, bounded, atomic publication and missed-night/late-file behavior. No new job, migration, version bump or historical rebuild is introduced. Deduplication, first visits and adoption are computed at query time before date filters. The stream is excluded from User activity to avoid counting lifecycle signals as extra activity.

## Example

In **Data app reach**, select:

- Dimensions: **Users → User name**, **App name**, **Event ts → Day**.
- Metrics: **Qualifying views**, **Distinct consumers**, **Returning consumers**.
- Filter **Qualifying views > 0** to remove inventory-only and excluded attempts.

For adoption, use **App name**, **Launched at**, **Adoption status**, **First non builder view at**, and **Launch to first consumer seconds**. Include **Total apps** so zero-view inventory remains visible. Do not filter the view date when comparing the launch cohort denominator; filter launch date instead.

A runnable local query fixture (real projection, MinIO raw gzip JSONL → compaction → signed Parquet → compiled Explore):

```sh
DATA_APP_REACH_SMOKE_ENDPOINT=http://localhost:9000 pnpm -F backend test src/analytics/systemExplores/dataAppReach.test.ts
```

The test creates and removes only its unique local bucket, checks tenant isolation, redelivery, late failures, zero/unknown history, stable reruns and a 20,000-event fixture. Plain native DuckDB tests run without this variable. For the indexed PostgreSQL attribution query, point `DATA_APP_REACH_SMOKE_PGPORT` to an isolated local development database and run `src/models/AppModel.reach.smoke.test.ts`; it owns a separate schema.
