# Migration and maintenance review

For hand review before the viz unification ships. It answers three questions:
which features need a data migration, which keep an old shape alive beside the
new one (and for how long), and whether the branch retires behaviour or adds
options. The QA pack that tests each claim is in [`qa/`](qa/README.md); test IDs
are quoted where a claim has one.

## Short answer

- **The frontend got simpler.** The SQL runner's chart stack, the DataViz
  components, the query runner and the chart data models are deleted:
  about 9,400 lines net out of the frontend and 2,200 out of common.
- **The data and API layer got wider.** Phase 3 copied saved SQL charts into
  saved charts and left the old tables and their references in place. The
  backend now has two sources of truth for SQL charts, an adapter that
  translates between them, and a new content shape (pipeline charts) that every
  chart consumer has to understand. Backend source grew by about 1,200 lines.
- **So the read is right for the backend.** As it stands, the branch adds a
  capability (pipeline charts) and wraps the old SQL chart world rather than
  retiring it. The retirement is deferred to a later release that has not been
  written. Until it lands, the seams between the two worlds are where the
  defects are (the QA docs list about 40 predicted ones).
- **What would make it a consolidation**: finish the fold in this release
  (rewrite every `saved_sql_uuid` reference, materialize the converted charts,
  stop reading `saved_sql`), then drop the tables one release later. See
  "Recommendation".

## Lines changed

Against `main` at 2.603.0 (`a7333cf`):

| Kind | Files | Added | Removed |
|---|---|---|---|
| Source | 249 | 7,645 | 18,044 |
| Tests | 66 | 2,064 | 5,294 |
| Migrations | 5 | 215 | 0 |
| JSON schema | 1 | 604 | 0 |
| Docs and benchmark reports | 13 | 57,503 | 64 |

| Package (source only) | Added | Removed | Net |
|---|---|---|---|
| frontend | 3,475 | 12,835 | −9,360 |
| common | 1,836 | 4,085 | −2,249 |
| backend | 2,295 | 1,124 | +1,171 |

The pull request's headline (+68k, −23k) is dominated by 55,000 lines of raw
benchmark JSON under `docs/viz-unification/perf/`. Without them, source and
tests are net −13,600 lines.

## Kinds of migration

- **DB copy**: a migration copies rows into the new shape. Old rows stay.
- **DB rewrite**: a migration changes rows in place. Old shape gone.
- **Read-time**: old stored shape is converted every time it is read; rewritten
  only when the user saves. Both shapes live forever unless a migration
  materializes them.
- **Adapter**: an old endpoint or model keeps its contract by translating to
  the new shape. Removed after a deprecation window.
- **Customer action**: something outside the database (a repo, an SDK version,
  a link) needs the customer to change it. Section "Code in the wild" lists
  every one.
- **None**: code change only.

## Feature by feature

Effort is the cost to keep it as it is per release (maintenance) and the cost
to finish it (removal). Low, medium, high.

| Feature | Stored data | Kind of migration | Old shape still accepted | Maintenance | To finish | QA |
|---|---|---|---|---|---|---|
| Saved SQL charts | `saved_sql`, `saved_sql_versions` | DB copy into `saved_queries` (same uuid) + read-time (pipeline schema version 0 converted on every read) | Yes: `saved_sql` rows kept; schema 0 pipelines read forever until re-saved | High: two converters (`sqlChartPipeline.ts`, 700 lines, both directions), adapter model, stale copies | Materialize schema 0 to 1; drop `saved_sql*` next release | CHRT-U01, SQLR-U05 |
| SQL chart version history | `saved_sql_versions` | DB copy of the **latest version only** | Old history only in `saved_sql_versions`, unreadable from the app | Low | Copy every version, or accept the loss and say so | CHRT-U04 |
| SQL chart slugs | `saved_sql.slug` | DB copy; colliding slugs suffixed `-sql-<uuid8>` | Old slug now resolves to the other chart | Low | Customer action for links and translation keys; promotion slugs diverge across projects | CHRT-U05, CODE-P06, EMBD-U06 |
| Direct access grants | `saved_sql_*_access` | DB copy | Old tables kept | Low | Drop with `saved_sql` | CHRT-U10 |
| Views, favourites, verification, pinning | `saved_sql.views_count`, uuid-keyed tables | Views: DB copy. Others keyed by uuid: none | Deprecated API reports `views: 0` | Low | — | CHRT-U08 |
| Dashboard SQL tiles | `dashboard_tile_sql_charts` | Read-time (returned as chart tiles); rewritten lazily on the next dashboard save | Yes, indefinitely for dashboards nobody saves | High: name, slug and deleted state read from stale `saved_sql`; embed permission check misses them; deleted charts block dashboard saves | DB rewrite into `dashboard_tile_charts` | DASH-U01, DASH-P01, DASH-P02, EMBD-P01 |
| SQL chart schedulers (Sheets syncs) | `scheduler.saved_sql_uuid` (FK to `saved_sql`) | None: run through the adapter | Yes | High: hidden from the chart page, stale names, orphaned on delete, deprecated create fails for new charts | DB rewrite to `saved_chart_uuid` | SCHD-P01 to P05 |
| Document links to SQL charts | `document_version_saved_charts.saved_sql_uuid`, `<saved-sql-chart>` tags in stored markdown | None | Yes; new links of that kind fail | Medium | DB rewrite of the column and of the tag in stored markdown; keep parsing the tag as an alias | DOCS-P01 to P03 |
| Document inline SQL charts | `content.charts[*] = { source: 'sql', chart: { config } }` in document versions | Read-time (converted to a pipeline chart on every run) | Yes, forever unless rewritten | Medium: the legacy SQL runner config stays a supported input | DB rewrite of document content to a pipeline source, or keep the converter | DOCS-U01 |
| Agent SQL artifacts linked to SQL charts | `ai_artifact_versions.saved_sql_uuid` (FK to `saved_sql`) | None | Yes; new links fail (save then 404) | Medium | DB rewrite to a saved chart column | AI-P01 |
| Composer artifact viz | artifact version viz JSON (schema v1) | Read-time upgrade to v2 (lossy: per-series aggregation dropped) | Yes, forever unless rewritten | Low | Optional DB rewrite to v2 | AI-U01 |
| Content reviews of SQL charts | `content_review_requests` type `SQL_CHART` | None | Yes; read from stale `saved_sql` | Low | DB rewrite of the type | CHRT-P05 |
| Space and homepage listings | — | None | `getSpaceSqlCharts` still unions `saved_sql`, so folded charts list twice | Low code, high visibility | Delete the union | CHRT-P01 (confirmed) |
| Preview projects | — | None | Copies both worlds; legacy tiles break in previews | Medium | Stop copying `saved_sql` | CODE-P05 |
| SQL runner share links | `share_urls.params` with the old SQL runner state and config | Read-time | Yes, forever (links live in chat history) | Low: one converter | Keep | SQLR-U04 |
| SQL runner UX | — | None | — | — | Aggregation moved into the SQL; aggregated legacy charts cannot be edited in the SQL runner any more | SQLR-U03 |
| Saved SQL chart API (`sqlRunner/saved*`) | — | Adapter, deprecated 2026-10-18, sunset 2027-01-18 | Yes until sunset | Medium: adapter plus lossy config rebuild | Delete after sunset | API-U05 |
| v2 SQL chart query endpoints | — | None (response shape changed) | No: keys changed from column names to field ids | — | Decide: compatibility mode or `breaking` declaration (the declared first-party-only claim does not hold for a public endpoint) | API-U02 |
| Dashboard, space, content API shapes | — | None | `sql_chart` tiles and `sqlCharts` arrays no longer returned | — | Customer action for API scripts | API-U03, API-U04 |
| Embed SQL tile endpoints | — | Dead (always 400) | — | Low | Delete | EMBD-C03 |
| Content as code: charts | YAML in customer repos | None (additive `pipeline:`; schema still 1.0) | Old YAML valid; new YAML fails old CLI lint | Low | — | CODE-U05 |
| Content as code: SQL charts | `charts/*.sql.yml` in customer repos | Adapter (`/code/sqlCharts` writes pipeline charts) | Yes; download returns them as `charts/*.yml` too, so repos end up with both | Medium | **Customer action**: delete `*.sql.yml` after re-download; ideally a CLI command that does it | CODE-U03, CODE-U04, CODE-P01 to P03 |
| `@lightdash/sdk` | Customer apps pin a version | None | Old SDK versions cannot draw pipeline charts (explore `sql` 404) | — | **Customer action**: upgrade the SDK | EMBD-C01 |
| `@lightdash/query-sdk`, `@lightdash/visualization` | — | None | — | None; the backend now depends on the visualization package | — | EMBD-N05, N06 |
| Slack images, MCP `render_chart` | — | None | — | Lower than before: one chart engine instead of two | — | AI-N05, AI-N07 |
| Pipeline charts (new content shape) | `saved_queries_version_pipelines` | New table | — | **High and ongoing**: every chart consumer needs a pipeline branch. Today these do not have one: dashboard date zoom, semantic dashboard filters, totals and subtotals, drill and underlying data, data app generation, managed agent fixes, embed available filters and filter search, alerts and filter overrides, chart page downloads | Either build pipeline support in each, or keep the list documented as "not applied" | DASH-N03, N04; APPS-P01; EMBD-P02 to P05; CHRT-P03, P04 |

## Code in the wild

Everything outside this database that holds the old shape. These are what
stop a change from landing overnight: we can rewrite our own rows in one
migration, but a pinned SDK, a customer's git repo, a script, a bookmarked
link or a browser tab is changed by the customer, on the customer's schedule.
"Window" is the deprecation period we owe; "customer action" is what they
must do; "ours" means we can change it in one release.

| What | Where it lives | Old shape | Today | To retire | Who moves it |
|---|---|---|---|---|---|
| Saved SQL chart REST API (9 operations under `sqlRunner/saved*`) | Customer scripts, Terraform-style tooling, anything written against the public API | SQL chart with a SQL runner config | Adapter over saved charts; `Deprecation` and `Sunset` headers; sunset 2027-01-18 | Delete after sunset. Add a deprecated-call log alert so we know who still calls them | Window, then customer action |
| `POST /api/v2/…/query/sql-chart`, `…/query/dashboard-sql-chart` | Public, documented endpoints; any script that read SQL chart results | Rows keyed by column names (`amount_sum`) | Rows keyed by field ids (`aggregated_amount_sum`); declared first-party-only, which a public endpoint is not | Decide: a compatibility mode that maps keys back, or a `breaking` declaration and a deprecation window | Ours to decide; customer action either way |
| Dashboard, space and content API shapes | Customer scripts; the generated OpenAPI clients customers build from `swagger.json` | `sql_chart` tiles with `savedSqlUuid`; `sqlCharts` array on spaces; SQL chart content type in search | Tiles come back as `saved_chart`; `sqlCharts` is empty; one content type. Not declared | Declare it; keep accepting `sql_chart` tiles on write (we do) for a window | Customer action |
| Embed SQL tile endpoints (`embed/{p}/sql-chart-tile/{tile}`, `embed/{p}/query/dashboard-sql-chart`) | Host apps that call the embed API directly (rare; the SDK calls it for them) | SQL tile and its query | Always 400; dead | Delete | Window |
| `@lightdash/sdk` | Pinned in customer `package.json`; bundles our tile components | SQL tile component requests explore `sql` | Old versions cannot draw folded or pipeline charts (404 on the explore) | Nothing server-side fixes this short of keeping the old tile shape | **Customer action**: upgrade the SDK. The single biggest overnight blocker |
| `@lightdash/query-sdk` | Pinned in customer apps | `savedChart(uuid)` | Same call; folded charts run as pipelines and return field-id keys | None | None (keys change for former SQL charts) |
| Embed JWTs | Minted by host apps; name content by uuid | Chart and dashboard uuids | Same uuids (the fold keeps them) | None | None |
| Content-as-code YAML: `charts/*.sql.yml` | Customer git repos; CI runs `lightdash upload` | `SqlChartAsCode` (`contentType: sql_chart`) | Accepted through the adapter, written as a pipeline chart; download under `sqlCharts` returns nothing without ids; a repo re-downloaded on the branch holds both `x.sql.yml` and `x.yml` and writes the chart twice per upload; a slug now owned by another chart is dropped silently (CODE-P03) | Keep accepting `.sql.yml` for a window; ship a `lightdash` command that deletes them after re-download | Window, then customer action |
| Content-as-code YAML: `dashboards/*.yml` | Customer git repos | Tiles of `type: sql_chart` | Accepted and stored as chart tiles; legacy tile slugs in downloads come from `saved_sql` (pre-suffix, stale after rename) | Keep accepting `sql_chart` tiles; fix the download to use the saved chart slug | Window |
| Content-as-code YAML: `charts/*.yml` with `pipeline:` | Customer git repos; CI runs `lightdash lint` | No `pipeline` key | Old CLI lint fails (`additionalProperties: false`); old CLI upload passes it through | Nothing to retire; schema is still `chart-as-code-1.0` with a new optional key | Customer action: upgrade the CLI where CI lints |
| `@lightdash/cli` | Pinned in customer CI (`npm i -g @lightdash/cli@x`) | Downloads SQL charts as `.sql.yml` | No CLI code changed on the branch; behaviour changes through the server. An old CLI keeps working except lint | None | Customer action for lint only |
| Document content: `<saved-sql-chart uuid>` tags and inline `source: 'sql'` charts | Our `document_versions` rows and documents-as-code YAML in repos | SQL chart link; SQL runner config | Tag parsed and rewritten to a chart link on read; inline config converted on every run; a new tag for a post-upgrade chart is rejected (DOCS-P01) | Rewrite stored rows; keep parsing the tag as an alias of `<saved-chart>` forever (it costs one regex) | Ours, plus alias kept |
| URLs: `/projects/:p/sql-runner/:slug` | Bookmarks, chat, Slack unfurls, delivery emails, other dashboards' markdown tiles | SQL chart page | Redirects to `/saved/:uuid/view` and keeps the query string; the colliding chart's old slug opens the other chart | Keep the redirect forever | None, except the collision cases: tell those customers |
| SQL runner share links | `share_urls.params` in our database, but the links live in chat history | SQL runner state and config | Converted when opened | Keep the converter forever (one file) | None |
| Translation keys (`contentOverrides`, keyed by chart slug) | Host apps | Slug | Same slug except colliding charts | None | Customer action for the collision cases |
| MCP tools | Any MCP client; the committed tool snapshot | `render_chart` returned the Slack builders' ECharts option | Tool schemas unchanged (snapshot check passes); the option is the web engine's | None | None |
| AI agent content tools (`create_content`, `edit_content`, `read_content`) | Agent prompts and skills written against type `sql_chart` | `sql_chart` type | Accepted through the adapter; `edit_content` as `chart` bypasses SQL approval (AI-P03) | Keep `sql_chart` as an alias | Ours |
| `PATCH …/artifacts/…/viz-config` | The web app only; behind the agent flag | Viz config body | Removed; replaced by `…/viz`; declared, flag-gated | Done | None |
| Public docs (docs.lightdash.com) | SQL runner chart docs describe per-value aggregation; API reference lists the deprecated operations | | Docs describe the old UI until `mintlify-docs` is updated | Update with the release; deprecation banners on the API pages | Ours |
| Old browser tabs during a rolling update | Users' browsers | Old assets call the old tile endpoints | Declared; errors until refresh | None | None |
| Old backend pods during a rolling update | Cloud rollouts | Write `saved_sql` | A SQL chart saved by an old pod after the fold migration ran is never copied and disappears (API-P01) | Run the fold as a post-rollout step, or re-run the copy on the first new-pod boot after the last old pod stops | Ours |

What this means for "finish the fold overnight": the database side can. The
API side cannot: the nine deprecated operations and the public v2 query
endpoints need their window, and `.sql.yml` files, `sql_chart` dashboard
tiles and `<saved-sql-chart>` tags need to stay accepted as aliases for as
long as customer repos carry them. The SDK is the one place where nothing on
our side helps: a host app on an old SDK shows broken tiles from the moment
of the upgrade until it ships a new build.

## Removed capabilities: intended or gap

The full list of what a user loses is the "Removed and narrowed
capabilities" table in [`migration.md`](migration.md). The judgement:

- **Intended, and should be in the release notes**: aggregation leaves the
  SQL runner config for the SQL; the runner's own config panel and pivoted
  results table go; legacy aggregated charts cannot have their SQL edited in
  the runner any more; big number leaves the agent viz switcher; composer
  per-series aggregation moves to the pipeline. These were decisions of the
  plan. The legacy-chart SQL editing one is the one customers will raise:
  most saved SQL charts aggregated in the chart, so most of them lose the
  Edit SQL path. A "rewrite with the aggregation in SQL" helper in the
  runner would soften it.
- **Gap, fix before release**: the conversion losses (y-axis formats, date
  formats, 100% stacking, table column order and bar colours, big number
  conditional formatting). The explorer config can express every one of
  them; the converter just does not carry them. A dashboard of folded charts
  loses its currency symbols on upgrade day, which reads as a regression,
  not a migration.
- **Gap, fix before release**: string-typed columns on folded tables (number
  formatting and filter operators), and the colliding-slug link retarget
  (at least log and surface which charts were suffixed).
- **Gap, decide**: chart page downloads for pipeline charts; alerts and
  filter overrides; version history beyond the latest version; validation.
  Each worked for SQL charts before. Either build the pipeline branch or
  say in the release notes that it is gone.
- **Accepted cost**: tile load time. Measured; documented.

## What the branch retires and what it adds

Retired:
- The SQL runner chart stack: `components/DataViz`, `features/queryRunner`,
  `features/sqlRunner/runners`, the SQL chart tile, the document SQL chart view.
- The chart data models in `common/src/visualizations` (`CartesianChartDataModel`,
  `PieChartDataModel`, `TableDataModel`, `BigNumberDataModel`).
- The Slack ECharts builders and the in-process DuckDB pivot for agent images.
- The per-series aggregation in the SQL runner (moved into SQL).

Added and kept alive:
- Pipeline charts: a table, an execution path (`savedPipelineExecution.ts`,
  `submitSavedPipelineRun`), a page, a chart-as-code block.
- Converters between the SQL runner config and pipeline charts, in both
  directions, plus the schema version 0 read path.
- `SavedSqlModel` as an adapter, nine deprecated endpoints, the dashboard tile
  translation, the composer v1 upgrade, the share link converter, the document
  inline SQL conversion.
- The `saved_sql*` tables and six tables with foreign keys into them.

## Recommendation

1. **Finish the fold in this release** with a second migration, so the old
   world stops being read:
   - `dashboard_tile_sql_charts` rows into `dashboard_tile_charts`;
   - `scheduler.saved_sql_uuid` into `saved_chart_uuid`;
   - `document_version_saved_charts.saved_sql_uuid` into `saved_chart_uuid`, and
     `<saved-sql-chart>` into `<saved-chart>` in stored markdown;
   - `ai_artifact_versions.saved_sql_uuid` into a saved chart reference;
   - `content_review_requests` of type `SQL_CHART` into `CHART`;
   - every `saved_sql_versions` row into chart versions (keeps history);
   - pipeline schema version 0 materialized to version 1 (drops the read path).
   Then delete the `saved_sql` reads (`getSpaceSqlCharts`, the legacy tile joins,
   the scheduler and document SQL lookups, preview copy).
   This is a rolling-update break for the previous release's pods (they read the
   moved rows), so it needs a `breaking` release-safety declaration with a
   required stop. That cost is paid once, instead of carrying ~40 seams.
2. **Drop `saved_sql*` one release later**, with the deprecated endpoints at
   their sunset.
3. **Decide the v2 SQL chart query endpoints**: either keep returning the old
   keys for `sql-chart` and `dashboard-sql-chart` (a small mapping), or declare
   them `breaking` and tell API users.
4. **Ship a repo cleanup for content as code**: a `lightdash` command (or
   upload behaviour) that replaces `*.sql.yml` with the downloaded chart YAML.
5. **Decide what pipeline charts must support at launch.** The minimum that
   avoids visible regressions for folded SQL charts: chart page downloads,
   embed filters and filter search, filter overrides in deliveries, and the
   legacy dashboard filter targets. The rest can stay on the "not applied" list.
6. **Fix the confirmed and high-severity predicted defects before release**:
   duplicate listings (CHRT-P01, confirmed), embed 403 on legacy tiles
   (EMBD-P01), dashboard save failure after a chart delete (DASH-P02,
   confirmed), agent SQL artifact link (AI-P01), as-code slug collision
   (CODE-P03, confirmed) and pipeline removal (CODE-P01), agent SQL approval for
   pipeline edits (AI-P03).
7. **Carry the SQL runner styling through the fold**: y-axis formats, x-axis
   date formats, 100% stacking, table column order and bar colours, big
   number conditional formatting. The explorer config holds all of them; the
   gap is in `sqlChartPipeline.ts`. Re-run the fold's conversion for schema 0
   pipelines once it does (they are converted on read, so no data migration).
8. **Write the release notes from the "Removed and narrowed capabilities"
   table** in `migration.md`, and update the SQL runner docs: aggregation is
   in the SQL now.
9. **Decide the public-API posture** for the v2 SQL chart query endpoints and
   the dashboard, space and content shape changes (section "Code in the
   wild"): a compatibility mode, or a `breaking` declaration and a window.

## Confirmed on the QA rig

The rig ran 2.603.0 on a fresh database, was seeded with
`qa/tools/seed-v1.mjs`, then upgraded in place to the branch build. The upgrade
results are recorded in the [QA README](qa/README.md) section "Rig results".

- **Data held.** Every folded chart and every converted dashboard tile returned
  the previous release's numbers. Names, spaces, slugs, trash and dashboard
  image deliveries survived the upgrade.
- **Every confirmed defect comes from the half-finished fold.** Each is either
  a `saved_sql` read left behind or the adapter that maps the old SQL chart API
  onto saved charts. The confirmed ones are CHRT-P01, DASH-P01, DASH-P02,
  SCHD-P01, SCHD-P03, SCHD-P04, DOCS-P01, CODE-P03 and CODE-P04. Finishing the
  fold, as recommended above, removes the reads. Patching them one by one keeps
  both tables alive.
- **Not exercised:** embed, AI agents, data apps, Slack and Google Sheets sends.
  The rig had no EE licence, AI key, Slack app or Google account.
