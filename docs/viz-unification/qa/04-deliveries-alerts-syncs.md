# QA: scheduled deliveries, threshold alerts, Google Sheets syncs, link unfurls

## Scope

- **Schedulers** carry `saved_chart_uuid`, `dashboard_uuid`, `saved_sql_uuid` or
  `app_uuid`. The migration did not touch the `scheduler` table: deliveries and
  syncs created on SQL charts before the upgrade keep `saved_sql_uuid`, which
  still has a foreign key to `saved_sql`. The scheduler worker runs them through
  the `SavedSqlModel` adapter (`scheduler/SchedulerTask.ts`).
- **New schedulers** on SQL charts are created from the chart page as saved chart
  schedulers (`saved_chart_uuid`). The sync modal's SQL chart branch was removed
  in phase 4; the deprecated `POST sqlRunner/saved/{uuid}/schedulers` remains.
- **Dashboard deliveries** draw legacy SQL tiles as chart tiles (the worker's SQL
  tile branches no longer run).
- **Unfurl**: Slack previews of `/projects/:p/sql-runner/:slug` links render
  `/minimal/projects/:p/sql-runner/:uuid`, now the saved pipeline chart.
- **Images** of pipeline charts render through `MinimalSavedPipelineChart`.

## Setup

- Upgraded rig with the scheduler worker running (`SCHEDULER_ENABLED=true`).
- Email: a catch-all SMTP sink or the worker logs. Google Sheets: Google OAuth
  client and Drive API key on the instance, a Google account. Slack: a Slack app
  installed for the org, for unfurls and Slack targets.
- The seed creates a Google Sheets sync on `bar_sum` that points at a placeholder
  sheet. With a Google account, seed real syncs by hand on the old release on
  `bar_sum` and `table_styled`, and record the sheets' header rows.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-SCHD-U01 | `verify-upgrade.mjs`, "delivery" checks | Both seeded schedulers are readable; the dashboard image delivery's "send now" completes. The SQL chart sync points at a placeholder sheet and is not sent |
| QA-SCHD-U02 | Note: on the previous release a SQL chart could have Google Sheets syncs only. Email and Slack deliveries of SQL charts did not exist (`SchedulerTask.getChartOrDashboard` has no SQL chart branch), so there is nothing to upgrade there | — |
| QA-SCHD-U03 | Receive the dashboard image delivery | Every former SQL tile is drawn, fully painted, no loading spinners |
| QA-SCHD-U04 | Google Sheets sync of `bar_sum` and `table_styled` seeded on the old release, run now | Rows written. Compare the header row with the old release's sheet (see P02) |
| QA-SCHD-U05 | Open the seeded CSV delivery from the chart page's Scheduled deliveries modal | Listed and editable (see P03) |
| QA-SCHD-U06 | Project settings, Scheduled deliveries page: the seeded deliveries | Listed with the chart's current name; the link opens the chart and the delivery |
| QA-SCHD-U07 | Rename `bar_sum`, then check the deliveries list and the next delivery email | New name everywhere (see P04) |
| QA-SCHD-U08 | Paste the old `/projects/:p/sql-runner/:slug` link of `bar_sum` into Slack | Unfurl shows the chart image |
| QA-SCHD-U09 | Permanently delete a folded chart that has a seeded delivery | The delivery is removed or disabled; the worker logs no repeated failures (see P05) |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-SCHD-N01 | From a new SQL runner chart's page: create an email CSV delivery, an image delivery, a Slack delivery and a Google Sheets sync; send each now | All arrive with correct content |
| QA-SCHD-N02 | Threshold alert on a folded `bar_preaggregated` chart (numeric field) and on `table_styled` | The field picker offers numeric fields; the alert fires when the threshold is crossed (see P06) |
| QA-SCHD-N03 | Delivery with filter overrides on a pipeline chart | Overrides apply to the delivered data and image (see P07) |
| QA-SCHD-N04 | Image delivery of a composer chart and of a dashboard holding one | Images complete, no half-drawn charts |
| QA-SCHD-N05 | Unfurl `/saved/:uuid/view` of a pipeline chart in Slack | Image preview |
| QA-SCHD-N06 | Scheduled deliveries as code: download, edit, upload one that targets a folded chart | Round-trips |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-SCHD-C01 | `POST /api/v1/projects/:p/sqlRunner/saved/:uuid/schedulers` for a folded chart | 201; `Deprecation` header |
| QA-SCHD-C02 | Same for a SQL chart created after the upgrade | 201 (see P01) |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-SCHD-P01 | The deprecated scheduler create for a chart created after the upgrade returns 500: the project lookup reads `saved_sql`, where the chart does not exist, and the foreign key on `scheduler.saved_sql_uuid` would reject it anyway **Confirmed on the rig (2026-10-18):** returns 500 "Cannot resolve the project for the scheduled delivery resource". | `SchedulerModel/index.ts` `getSchedulerProjectUuid`; `SavedSqlService.createScheduler` |
| QA-SCHD-P02 | Google Sheets syncs of SQL charts write column headers from the pipeline run's keys (`aggregated_amount_sum` style) instead of the old column names; and a sync on a chart whose type the legacy converter cannot express fails with "Saved sql not found" | `SchedulerTask.ts` Sheets branch for `savedSqlUuid`; `SavedSqlModel.toSqlChart` |
| QA-SCHD-P03 | Deliveries and syncs created on SQL charts before the upgrade are not listed in the chart page's Scheduled deliveries and Google Sheets modals, which list `saved_chart_uuid` schedulers only **Confirmed on the rig (2026-10-18):** the seeded Sheets sync is missing from `GET /api/v2/saved/{uuid}/schedulers`. | `SavedChartService.ts` scheduler listing, `SchedulerModel` |
| QA-SCHD-P04 | The project schedulers list and delivery names take the chart name and space from `saved_sql`, stale after a rename or move **Confirmed on the rig (2026-10-18):** after a rename the delivery still shows the old chart name. | `SchedulerModel` SQL chart joins |
| QA-SCHD-P05 | Deleting a folded chart through saved charts does not delete or disable its `saved_sql_uuid` schedulers (the cascade hangs off `saved_sql`, which is never deleted), so they keep failing | `SavedChartService` delete; FK `scheduler.saved_sql_uuid → saved_sql` |
| QA-SCHD-P06 | Threshold alerts on folded table charts saved without column types see only string fields ("No numeric fields available") | `useSchedulerFormModal.ts`, column typing in `sqlChartPipeline.ts` |
| QA-SCHD-P07 | Filter overrides on deliveries and alerts of pipeline charts are dropped: they are not passed to the pipeline run, and the image path draws the unfiltered chart | `AsyncQueryService.executeAsyncSavedChartQuery`; `MinimalSavedExplorer.tsx` |
| QA-SCHD-P08 | Screenshots of pipeline charts skip the paint wait the explorer path has and may capture mid-animation | `MinimalSavedExplorer.tsx` (`needsPaintSignal`) |

## Evidence

The delivered files and emails (or worker log lines with the job id), the
Google sheet's header row before and after, Slack unfurl screenshots.
