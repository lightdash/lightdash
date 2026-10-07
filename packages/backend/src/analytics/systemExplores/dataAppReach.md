# Data App reach

Answer who loads which app and how observed usage changes over time. Select **Apps → App name**, **Users → User name**, **Event ts → Day/Week**, **Total loads** and **Distinct viewers**. Keep app/user UUIDs in grouping when names are duplicated. Names come from current snapshots; missing users retain their captured UUID and missing apps fall back to the app UUID.

**View context** distinguishes standalone apps, dashboard tiles, builder previews, custom chart types, deliveries, embeds and unknown historical context. Filter to `standalone` and `dashboard` for reader-facing surfaces. This identifies where an app was opened, not whether the viewer has ever built it. Reloads remain included. Token renewal does not reload an open iframe, so its context remains the context at its original navigation.

These are existing raw HTML-load events, not sessions, confirmed rendering or proof of human attention. Embed loads with captured embed context remain in load totals but exclude the token issuer from known-viewer counts. Older events lack context, so their embedded identity cannot be reconstructed. Distinct viewers cannot be summed across apps or dates.

The model reuses `data_app.view`, the existing organization `analytics-project` flag sink gate and closed-day compactor. One optional `view_context` column is captured from the signed preview capability; older Parquet files receive NULL through the existing reader's schema alignment. Existing Data app events and User activity keep their raw-load meanings. There is no extra event, browser collector, request-time database lookup, new job, historical rebuild or historical window calculation. User/app name joins are requested only when needed by the query.

Launch cohorts, render outcomes, reload identity, builder history and returning/non-builder adoption metrics are deferred to PROD-11820. This model includes apps with observed loads; Content health remains available for inventory and zero-observed-load content. No managed dashboards are changed here.
