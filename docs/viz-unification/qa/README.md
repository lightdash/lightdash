# Viz unification QA pack

This folder is the brief for verifying the viz unification branch
(`claude/friendly-heisenberg-atf1t3`) before it ships. One QA doc per feature
area tells a tester, human or agent, what changed, how to seed the previous
release's content, how to upgrade, what to check after the upgrade, and what
the code predicts will break.

What changed and why is in [`../migration.md`](../migration.md). Which
features need data migrations and what they cost to maintain is in
[`../migration-review.md`](../migration-review.md).

## The QA docs

| Doc | Area | Needs |
|---|---|---|
| [01-sql-runner.md](01-sql-runner.md) | SQL runner: run, chart tab, save, edit, share links, downloads | Base instance |
| [02-charts-and-pipeline-charts.md](02-charts-and-pipeline-charts.md) | Chart pages, folded SQL charts, composer charts, history, trash, listings, search | Base instance |
| [03-dashboards.md](03-dashboards.md) | Dashboard tiles, filters, date zoom, exports, editing | Base instance |
| [04-deliveries-alerts-syncs.md](04-deliveries-alerts-syncs.md) | Scheduled deliveries, threshold alerts, Google Sheets syncs, link unfurls | Scheduler worker; Google OAuth and Slack for some cases |
| [05-documents.md](05-documents.md) | Documents: inline SQL charts, linked charts, PDF export | `documents` flag |
| [06-content-as-code-and-promotion.md](06-content-as-code-and-promotion.md) | CLI download, upload, deploy, lint; customer repos; promotion; preview projects; validation | CLI 2.603.0 and branch CLI |
| [07-embed-and-sdks.md](07-embed-and-sdks.md) | Iframe embed, `@lightdash/sdk` (new and old versions), `@lightdash/query-sdk`, `@lightdash/visualization` | EE licence (embedding) |
| [08-ai-agents-mcp-slack.md](08-ai-agents-mcp-slack.md) | Agent thread UI, composer and SQL artifacts, agent content tools, Slack images and unfurls, MCP `render_chart`, managed agents | EE licence, AI key, Slack app, `multi-source-query` flag |
| [09-data-apps.md](09-data-apps.md) | Data app generation from charts and dashboards | EE licence, data apps enabled |
| [10-api-compatibility.md](10-api-compatibility.md) | Every changed, deprecated or removed endpoint; rolling update; old clients | Base instance |

[FLEET.md](FLEET.md) has a ready prompt per QA doc for running them as parallel
agents, and the prompt for merging their reports.

Each doc has the same sections: scope, setup, upgrade tests, new behaviour,
old clients against the new server, predicted defects, evidence.

## Test IDs and statuses

Every test has an ID such as `QA-DASH-04`. Report one row per ID.

- **Upgrade tests** (`-Uxx`) start from content created on the previous release
  and check it after the upgrade.
- **New behaviour tests** (`-Nxx`) run on the new release only.
- **Old client tests** (`-Cxx`) run a client of the previous release (browser tab,
  CLI, SDK) against the new server.
- **Predicted defects** (`-Pxx`) were found by reading the code before QA. Each
  says what the code predicts. Confirm or refute it, and say which.

Statuses already confirmed on the QA rig are marked **Confirmed on the rig** with
the date. Everything else is unverified until a tester reports it.

## The upgrade rig

Every upgrade test needs one instance that runs the previous release first and
the branch second, on the same database. The steps work on any deployment where
you can choose the image tag:

1. **Fresh instance on the previous release.** Deploy Lightdash 2.603.0 (commit
   `a7333cf`) on an empty database, then seed the demo project (`dbt seed`,
   `dbt run` and `pnpm -F backend seed-production` from the image, as the
   development seed does). Enable the flags the docs need with
   `LIGHTDASH_ENABLE_FEATURE_FLAGS=documents,multi-source-query`. Without an EE
   licence key, the development seed needs the `organization_homepage_settings`
   table, which only an EE migration creates; create it by hand first (the
   column list is in
   `packages/backend/src/ee/database/migrations/20260803110000_create_organization_homepage_settings.ts`).
2. **Seed the previous release's content.** Run
   [`tools/seed-v1.mjs`](tools/seed-v1.mjs) against it. It creates, through the
   APIs the old release offers: one SQL chart per chart kind and layout the fold
   converts differently, a chart in the trash, a chart with two versions, a slug
   collision, a dashboard of SQL chart tiles with a filter, a Google Sheets sync
   on a SQL chart (pointing at a placeholder sheet: the previous release had no
   email delivery for SQL charts), an image delivery on the dashboard, a document
   with an inline SQL chart and linked charts, an old SQL runner share link and an
   as-code snapshot. Turn soft delete on (`SOFT_DELETE_ENABLED=true`) so the
   trashed chart is a soft delete.
   It runs every chart on the old release and records the numbers as a baseline.
   Seed the AI and Google Sheets content by hand where a doc says so.
3. **Look at the old release.** Before upgrading, open the seeded dashboard,
   charts and document in the UI and take screenshots. The after-upgrade
   screenshots are compared with these.
4. **Upgrade in place.** Change the image to the branch build and restart the
   backend and the scheduler worker. Migrations run on boot. Set
   `INTERNAL_LIGHTDASH_HOST` to an address the headless browser can reach, or
   image deliveries and unfurls fail for reasons unrelated to this change.
   Give the headless browser at least 1 GiB of memory.
5. **Run the verifier.** [`tools/verify-upgrade.mjs`](tools/verify-upgrade.mjs)
   reads the manifest, checks every seeded item through the new APIs, compares
   numbers with the baseline and probes the predicted defects. Run it read-only
   first, then with `--mutate` for the probes that change content.
6. **Run your doc's manual tests.** The verifier covers the API. The docs cover
   the UI, the CLI, the SDKs and the integrations.

```bash
cd docs/viz-unification/qa/tools
node seed-v1.mjs --base "$OLD_URL" --email "$LD_EMAIL" --password "$LD_PASSWORD" --out ./qa-manifest.json
# upgrade the instance to the branch image, then:
node verify-upgrade.mjs --base "$OLD_URL" --email "$LD_EMAIL" --password "$LD_PASSWORD" --manifest ./qa-manifest.json
node verify-upgrade.mjs --base "$OLD_URL" --email "$LD_EMAIL" --password "$LD_PASSWORD" --manifest ./qa-manifest.json --mutate
```

The tools need Node 20 or later and no dependencies. The environment-specific
rig for the team's development cluster (deployment names, image registry, load
balancer) is not in this public repository; ask for it with the fleet brief.

A rig can be used once: after the upgrade its database cannot go back to the
previous release. Rebuild it for the next run.

## Rig results

One full run on 2026-10-18: Lightdash 2.603.0 seeded with `seed-v1.mjs`, then
upgraded in place to the branch build (commit `d4bdf4c`). No EE licence, AI key,
Slack app or Google account, so embed, AI, data apps, Slack and Sheets sends
were not exercised.

**Held up**

- Migrations ran on boot. Every SQL chart reads as a saved chart with a
  pipeline, with the same name, space and slug.
- Numbers match the previous release for every chart and every dashboard tile
  (amount total 4149.12, order count 151, table totals equal). The grouped bar
  returns more pivot rows (26 to 39) with equal totals.
- A chart that failed on the previous release (bar sorted by its y-axis column)
  now runs.
- The colliding slug was suffixed `-sql-<uuid8>`.
- The trashed chart stays in the trash.
- Dashboard tiles convert to chart tiles, run, and keep custom titles. Available
  filters resolve.
- The dashboard image delivery draws every former SQL tile (QA-SCHD-U01, U03).
- The document's inline SQL chart and linked SQL chart run.
- The old SQL runner share link resolves. Spaces and the v2 content list show
  each chart once. Validation reports no new errors.
- Deprecated SQL chart endpoints serve with `Deprecation` headers.
- Re-uploading the previous release's `sqlCharts` snapshot updates the folded
  charts in place and revives a deleted one, as content-as-code does for charts.

**Confirmed defects**

| ID | Result |
|---|---|
| QA-CODE-P03 | A re-uploaded SQL chart whose slug now belongs to an explore chart returns 200 "create" with the explore chart's uuid and writes nothing |
| QA-DASH-P02 | Saving a dashboard after a tile's chart is deleted returns 404 |
| QA-SCHD-P01 | Deprecated scheduler create on a chart made after the upgrade returns 500 |
| QA-DOCS-P01 | `<saved-sql-chart>` link to a chart made after the upgrade returns 400 |
| QA-CHRT-P01 | Homepage most popular and recently updated lists folded charts twice |
| QA-DASH-P01 | API tile `chartName` is stale after a rename; the UI shows the current name |
| QA-SCHD-P03, P04 | Legacy SQL chart syncs are not listed on the chart, and show the old name after a rename |
| QA-CODE-P04 | `sqlCharts` download without ids returns nothing |
| QA-SQLR-P02, P03 | Config round-trips are lossy; the colliding chart's old slug opens the other chart |

**Expected changes seen**

- Query results use field ids (`aggregated_amount_sum`, `sql_amount`) instead of
  the previous release's column names.

**Rig notes**

- The previous release renames inline document chart ids on save (`inline_sql`
  becomes `c1`); the tools read the ids back from the document.
- Image deliveries need the headless browser to have more than 512 MiB of
  memory; at 512 MiB it is OOM-killed and every image delivery fails,
  explore-only dashboards included.

## Performance

Dashboard load is covered in the Performance section of
[`../migration.md`](../migration.md), with the harness in
[`../perf/`](../perf/). Re-run the A/B method there (previous image, branch
image, previous image, five runs each) if the branch changes the query path.

## Evidence

Report per test ID:

| ID | Status | Environment | Evidence | Notes |
|---|---|---|---|---|
| QA-DASH-U01 | pass / fail / blocked / confirmed / refuted | image tag, flags | screenshot path, API response excerpt, log line | what differed from the expected result |

Attach before and after screenshots for every UI upgrade test. For a failure,
include the request, the response status and the first 500 characters of the
body, or the browser console error.
