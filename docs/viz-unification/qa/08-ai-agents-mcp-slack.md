# QA: AI agents, MCP, Slack

## Scope

- **Agent thread UI** (phase 1): composer artifacts and SQL (`runSql`)
  artifacts draw through the classic chart stack with the explorer config panel
  (Chart bar), a viz switcher (table, bar, horizontal bar, line, scatter, pie,
  funnel; big number dropped from the switcher), and grouped charts that pivot
  on the compose engine (`POST …/versions/{v}/pivot-query`). Stored composer viz
  schema v1 is upgraded on read (`packages/common/src/ee/AiAgent/composerArtifact.ts`);
  `PATCH …/viz-config` is replaced by `PATCH …/viz`.
- **Saving** (phase 2, 4): composer results save as pipeline charts
  (`AiComposerSaveChartButton.tsx`); SQL artifacts save through the SQL runner's
  save modal, which now creates a saved chart.
- **Agent content tools** (`read_content`, `edit_content`, `create_content`,
  `find_content`) are unchanged in code but read SQL charts through the
  `SavedSqlModel` adapter, and folded charts are now also charts.
- **Slack images and MCP `render_chart`** (phase 4) draw with
  `@lightdash/visualization` (`packages/backend/src/ee/services/ai/utils/renderAiChart.ts`):
  the tool's chart config becomes an explorer chart config, grouped results are
  pivoted in process, `renderEcharts` rasterizes. The Slack ECharts builders and
  the DuckDB pivot are deleted.
- **Managed agents**: chart fixes keep `merge` and `pipeline`.

## Setup

EE licence, AI provider key, an agent with content tools, `multi-source-query`
flag on, a Slack app installed for the org (images and unfurls), an MCP client
(Claude Desktop or Claude Code) connected to the instance.

Seed by hand on the old release (the seed script cannot without AI):
- a composer artifact grouped by a column with a SUM per series (v1 viz with
  aggregation);
- a composer big number and a composer horizontal bar;
- a SQL artifact saved as a SQL chart (links `ai_artifact_versions.saved_sql_uuid`);
- a Slack thread where the agent sent a chart image.

## Upgrade tests

| ID | Steps | Expected |
|---|---|---|
| QA-AI-U01 | Open each seeded composer artifact | Grouped chart shows one series per group from the rows as produced (the v1 per-series SUM is gone: numbers may differ if the pipeline did not aggregate; record); big number draws; horizontal bar draws as a horizontal bar or as a table (record) |
| QA-AI-U02 | Change the viz of a seeded composer artifact and reload | Persists (written as v2) |
| QA-AI-U03 | Seeded SQL artifact that was saved as a SQL chart: open it and use "Save another copy" | Link to the saved chart still shows; saving another copy works (see P01) |
| QA-AI-U04 | Ask the agent "find <seeded SQL chart name>" | Returns the chart once, with a `/saved/:uuid` link that opens the chart page |
| QA-AI-U05 | Ask the agent to read and then edit a folded SQL chart (change its title) | Works; the agent may use type `chart` or `sql_chart`; record which and whether both work |
| QA-AI-U06 | Old Slack thread: click the agent's old `/sql-runner/<slug>` link | Opens the chart page |

## New behaviour

| ID | Steps | Expected |
|---|---|---|
| QA-AI-N01 | Ask a question that runs a composer query; switch the viz through every kind; open the Chart bar and change axes and colours | Draws each kind; config edits persist on the artifact version |
| QA-AI-N02 | Composer result: "Save as chart" into a space | Pipeline chart saved; opens on its page with the same drawing; adds to a dashboard |
| QA-AI-N03 | SQL mode: `runSql`, then Save | Chart saved and linked to the artifact; "Save another copy" appears (see P01) |
| QA-AI-N04 | Same as N03 as a user without `manage:SqlRunner` | The save buttons are hidden or refused with a clear message; no stray 403 toast from the composer Save button (see P02) |
| QA-AI-N05 | Slack: ask for a bar chart, a grouped stacked bar, a line, a scatter, a pie and a funnel | Each arrives as an image that looks like the web chart (formats, colours, legend). A table answer sends no image. A custom chart type exports through the headless browser |
| QA-AI-N06 | Slack: a time series in a non-UTC project timezone | Dates on the axis match the web chart (see P05) |
| QA-AI-N07 | MCP `render_chart` in Claude Desktop for bar, line with dates, pie, funnel | Chart app draws; record axis label formatting and pie tooltips (see P04) |
| QA-AI-N08 | MCP tool list and descriptions | Unchanged: `pnpm check:mcp-tools-snapshot` passes |
| QA-AI-N09 | Agent `edit_content` type `chart` patching a pipeline chart's SQL (`/pipeline/queries/0/sql`) | The user is asked to approve the SQL, as for `sql_chart` edits (see P03) |
| QA-AI-N10 | Managed agent asked to fix a broken folded SQL chart | Fix is attempted and verified, or the agent reports it cannot fix pipeline charts (see P06) |
| QA-AI-N11 | Click a folded SQL chart or composer chart link inside the agent chat (inline chart preview) | Preview draws (see P07) |
| QA-AI-N12 | Deep research or document generation (EE) that includes SQL charts | Charts render in the output |

## Old clients against the new server

| ID | Steps | Expected |
|---|---|---|
| QA-AI-C01 | Previous release tab on an agent thread: change a composer artifact's viz | 404 on `PATCH …/viz-config` until reload (declared `viz-unification-p1-composer-artifact-viz-contract`) |

## Predicted defects

| ID | Prediction from the code | Where |
|---|---|---|
| QA-AI-P01 | Saving a SQL artifact creates the chart, then linking it to the artifact fails with 404 "Saved SQL chart not found": the link check reads `saved_sql`, and `ai_artifact_versions.saved_sql_uuid` has a foreign key to `saved_sql`. The artifact stays unlinked and "Save another copy" never appears. Also, the save stores a table whatever chart type was showing | `AiSqlArtifactVisualization.tsx` `onSaved`; `AiAgentModel.isSavedSqlInProject`; migration `20260724144502` FK |
| QA-AI-P02 | SQL artifacts show two save buttons (composer panel's and the SQL artifact's); the composer one checks only chart create permission, so users without `manage:SqlRunner` get a 403 from the server | `AiComposerArtifactPanel.tsx`, `AiComposerSaveChartButton.tsx`, `SavedChartService` |
| QA-AI-P03 | The agent's SQL approval applies to `sql_chart` edits only; editing a pipeline chart as type `chart` changes warehouse SQL without the approval step (the user still needs `manage:SqlRunner`) | `AiAgentToolsService.ts` edit_content; `AiAgentContentValidation.ts` banned paths |
| QA-AI-P04 | MCP `render_chart` options lose function formatters in JSON, so axis ticks, pie and funnel labels show raw values; the chart app's pie tooltip reads `Object.keys(value)[1]` of dataset rows | `McpService.buildRenderChartResponse`; `mcp-chart-app/src/chart-app.ts` |
| QA-AI-P05 | Slack and MCP images pass no timezone to the chart engine, so dates format in UTC | `renderAiChart.ts` callers |
| QA-AI-P06 | Managed agent fixes on pipeline charts cannot pass their own check: it runs the chart's metric query against explore `tableName` (`sql`) | `ManagedAgentService.assertChartQueryRuns` |
| QA-AI-P07 | The agent chat's inline saved chart preview has no pipeline branch and may fail for folded SQL charts and composer charts | `AiSavedChartVisualization.tsx` |
| QA-AI-P08 | Composer "Save as chart" is not linked back to the artifact, so each click saves a duplicate | `AiComposerSaveChartButton.tsx` |
| QA-AI-P09 | Dashboard SQL tiles now read as chart tiles whose explore name is the placeholder `sql`; agents building dashboard filters from tile explores may target table `sql` | migration placeholder `explore_name`; agent dashboard tools |

## Evidence

Thread screenshots, Slack screenshots, the MCP tool response JSON (`_meta.result.echartsOption`
excerpt), server logs for 4xx/5xx.
