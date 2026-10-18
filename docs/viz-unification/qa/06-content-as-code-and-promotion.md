# QA: content as code, CLI, promotion, preview projects, validation

## Scope

- **Charts as code** gain an optional `pipeline:` block
  (`packages/common/src/types/contentAsCode/charts.ts`, schema
  `packages/common/src/schemas/json/chart-as-code-1.0.json`, still version 1.0).
  Folded SQL charts and composer charts download as `charts/<slug>.yml` with
  `pipeline:` and `tableName` set to the terminal node id.
- **SQL charts as code** (`/code/sqlCharts`) are served by the `SavedSqlModel`
  adapter over saved charts. The CLI has always written them as
  `charts/<slug>.sql.yml`. Uploading one creates or updates a pipeline chart.
- The CLI (`packages/cli`), `PromoteService`, `ValidationService` and
  `SavedSqlService` have no code changes on the branch; their behaviour changes
  through the adapter and the models.
- **No migration tool or command exists for customer repos.** This doc decides
  whether one is needed.

## Setup

- Upgraded rig; `manifest.asCode.file` holds the as-code snapshot taken on the
  old release.
- A git repo produced by `lightdash download` on the old release (CLI
  `@lightdash/cli@2.603.0`) before the upgrade. Keep it; most tests run against
  it after the upgrade.
- CLI 2.603.0 from npm and the branch CLI (`pnpm -F @lightdash/cli build`).
- For promotion: a second project with the first as its upstream (Settings, Data
  ops). For previews: `lightdash start-preview` from the dbt project.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-CODE-U01 | Old repo, CLI 2.603.0: `lightdash upload` with no changes | Succeeds; no chart changes, no duplicates |
| QA-CODE-U02 | Old repo: edit a `*.sql.yml` (change SQL), `lightdash upload` | The folded chart gets a new version with the new SQL; it runs |
| QA-CODE-U03 | Old repo, `lightdash download` (2.603.0 and branch CLI) | Record the files: expect `charts/<slug>.yml` with `pipeline:` for every folded chart and no fresh `*.sql.yml`; the old `*.sql.yml` files stay because the CLI never deletes |
| QA-CODE-U04 | After U03 the repo has both `x.sql.yml` and `x.yml` for each SQL chart. Edit one of them and upload | Record which wins. Expected by the code: both are written, last write wins (see P02) |
| QA-CODE-U05 | `lightdash lint` with CLI 2.603.0 on the re-downloaded repo | Fails on `pipeline:` (old schema has `additionalProperties: false`). Branch CLI lint passes |
| QA-CODE-U06 | Slug collision chart: upload the old repo's `<slug>.sql.yml` | The SQL chart (now `<slug>-sql-<uuid8>`) is updated, or the upload fails loudly (see P03) |
| QA-CODE-U07 | `verify-upgrade.mjs --mutate`, "re-upload the v1 sqlCharts snapshot" | Every SQL chart in the snapshot uploads; no duplicate charts appear |
| QA-CODE-U08 | Dashboard YAML downloaded on the old release with `sql_chart` tiles, uploaded after the upgrade | Dashboard keeps its tiles, now as chart tiles |
| QA-CODE-U09 | Promote a folded chart to the upstream project | Creates or updates the upstream chart as a pipeline chart that runs; promoting again updates instead of duplicating |
| QA-CODE-U10 | Preview project from a project with folded charts and a dashboard with legacy SQL tiles | The preview has each chart once and every tile draws (see P05) |
| QA-CODE-U11 | Run validation on the upgraded project | No errors on folded charts or on the dashboard (verifier "validation" check) |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-CODE-N01 | Branch CLI: download, edit a pipeline chart's `pipeline.queries[0].sql`, upload | New version with the new SQL |
| QA-CODE-N02 | Upload a pipeline chart's YAML with the `pipeline:` block removed | Refused, or the chart keeps its pipeline (see P01) |
| QA-CODE-N03 | Upload YAML with `pipeline:` for a user without `manage:SqlRunner` | Forbidden: "runs warehouse SQL, which needs SQL runner access" |
| QA-CODE-N04 | `lightdash deploy` of a dbt project whose repo also holds content as code with pipeline charts | Deploy succeeds; charts unaffected |
| QA-CODE-N05 | Composer chart round trip: download, upload unchanged | No change, no duplicate |
| QA-CODE-N06 | Content as code write-back (propose to git) of a pipeline chart | YAML in the PR has the `pipeline:` block |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-CODE-C01 | CLI 2.603.0 `download` | Works; see U03 for the files |
| QA-CODE-C02 | CLI 2.603.0 `upload` of chart YAML with `pipeline:` (copied from a branch download) | Accepted by the server; chart keeps its pipeline |

And the reverse, for customers on mixed versions:

| ID | Steps | Expected |
|---|---|---|
| QA-CODE-R01 | Branch CLI `upload` of a chart with `pipeline:` to an instance on 2.603.0 | Record what the old server stores. Expected by the code: it drops `pipeline` and saves a chart over explore `sql`, which is broken |

## Customer repo migration (decide)

Without tooling, a customer repo needs, after the upgrade: re-download; delete
`charts/**/*.sql.yml` (the same charts now live in `charts/<slug>.yml` with
`pipeline:`); update dashboard YAML references to any `-sql-<uuid8>` suffixed
slug; upgrade the CLI if CI runs `lightdash lint`. Leaving the old files does
not fail outright but writes each SQL chart twice per upload. Testers: confirm
or refute each step, and say whether a `lightdash` command should do it.

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-CODE-P01 | Uploading chart YAML without `pipeline:` onto an existing pipeline chart writes a version with no pipeline, turning it into a chart over explore `sql`, which then fails | `CoderService.ts` chart upsert (`pipeline: undefined` spread over the existing chart) |
| QA-CODE-P02 | A repo holding both `x.sql.yml` and `x.yml` writes the chart twice per upload, last write wins | CLI `upload` handles `sqlCharts` and `charts` separately |
| QA-CODE-P03 | Uploading `<slug>.sql.yml` whose slug now belongs to an explore chart (collision) finds no SQL chart, creates with the exact slug, hits the unique slug and silently returns the explore chart's uuid as a "create": the SQL is dropped **Confirmed on the rig (2026-10-18):** the upload returns 200 with action `create` and the explore chart's uuid, and writes nothing. Cause: `SavedChartModel` create with a forced slug returns the active owner's uuid. | `CoderService.upsertSqlChart`, `SavedChartModel` create with a taken slug |
| QA-CODE-P04 | `GET /code/sqlCharts` without `ids` returns nothing; with ids it returns folded charts the legacy converter can express **Confirmed on the rig (2026-10-18):** 0 charts without ids, 10 with ids. | `SavedSqlModel.findUuids` |
| QA-CODE-P05 | Preview projects copy both `saved_queries` (pipeline charts) and `saved_sql` rows under new uuids, so folded charts are duplicated, and legacy SQL tiles are remapped to the new `saved_sql` uuid, under which no chart exists: those tiles break in previews | `ProjectModel.ts` preview copy |
| QA-CODE-P06 | The migration's slug suffix uses each chart's own uuid, so the same chart in an upstream and a downstream project can end up with different slugs; promotion then duplicates | migration `20261018150000` |
| QA-CODE-P07 | Dashboard YAML downloads take legacy tile chart slugs from `saved_sql` (pre-suffix, stale after rename), so a re-upload can bind a tile to the wrong chart | `DashboardModel.ts` legacy tile join |

## Evidence

`git status` and `git diff` of the repo after each step; CLI output; the charts
list before and after uploads (`GET /api/v2/content?projectUuids=…`).
