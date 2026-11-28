---
name: composer-chart-reference
description: Creating, reading, testing and editing a composer chart (a chart drawn from a pipeline of queries, saved in a space or on a dashboard), and the SQL approval step for its warehouse SQL nodes.
---

# Composer Chart Reference

A composer chart has a pipeline of query nodes and a chart. A space or a dashboard owns it. A space's composer chart opens on its own page, as a chart in a space does. A dashboard's composer chart shows in a `composer_chart` tile that names it by `chartSlug`. You can create, read, run and edit one.

## Always state the type

Pass `type: "composer_chart"` to `createContent`, `readContent` and `editContent`. A composer chart can share its slug with a chart or SQL chart, so the type picks which one you mean.

## When to create one

A new chart is a chart from explore fields by default. Pick its type with these rules:

- The user asked for a composer chart: create it.
- The node to chart reads other nodes (a merge, a duckdb or python node): create a composer chart. Judge that node and the nodes it reads, not every node of the `query` call.
- A lone semanticLayer node is saved as a chart that keeps its fields, filters, sorts, custom metrics, period comparisons (`period-over-period-reference`) and parameters; a lone `sql` node follows `sql-chart-reference`.
- Where the `query` tool is available, one explore cannot produce the chart but a `query` pipeline over explores can (a merge across explores, a duckdb or python step): build it with `query` and save it as a composer chart.

When you save a composer chart, tell the user it is a composer chart built from that pipeline. Do not claim a normal chart could not show the result.

A pipeline with an `external` node cannot be saved. Composer charts already on a dashboard were chosen for those tiles; a new tile there follows these rules too.

## Create

Save it into a space with `spaceSlug`, as you save a chart, unless the user names a dashboard or the conversation is bound to one. In that case, save it onto that dashboard with `dashboardSlug`, where it gets a tile at the bottom of the first tab. Pass the content in one of two shapes:

- **From a query node** (usual): `{ from: "node", nodeId, sessionId, dashboardSlug, spaceSlug, name, description, vizConfig }`. `nodeId` names a node from a successful `query` call; the chart saves it and every node it reads. `vizConfig` references that node's result columns: pass the one the user saw with `visualize`, or over MCP the one you chose for the result. `sessionId` is the query result's session id over MCP, and null in an agent conversation. The node's SQL was approved when `query` ran it, so this asks no approval.
- **From full JSON**: `{ from: "json", dashboardSlug, spaceSlug, name, description, pipeline, chart }`, with `pipeline` and `chart` shaped as `readContent` returns them; a `slug` is not kept. Warehouse SQL in it needs approval, as for a SQL chart.

Done when the result links the chart's page and `runContentQuery` on the new chart returns the rows the user saw. For a dashboard's chart, the link is the dashboard.

## Read, test, edit

1. Read it: `readContent` with `type: "composer_chart"` and the tile's `chartSlug`, or the slug a list or find row with `chartSource: "composer"` gives. The result has `pipeline` (its `nodes` and `terminalNodeId`) and `chart` (`columns`, `chartConfig`, `pivotConfig`, `tableConfig`).
2. Test any node you change or add before saving it: run the changed pipeline with the `query` tool. Done when it succeeds and its terminal node returns every column `chart.columns` references (see Columns).
3. Patch exactly what you read with `editContent` (`type: "composer_chart"`), as RFC6902 operations on that JSON.
4. Check the saved chart with `runContentQuery` and `chartType: "composer_chart"`. For a chart on a dashboard, use `source.type: "dashboardChart"` with the dashboard's slug. When the chart's `dashboardSlug` is null, a space owns the chart, so use `source.type: "chart"`. Done when the terminal node's rows show the change you made.

On a dashboard, `editContent` saves the edit in place as a new version of the chart, so the dashboard shows the edit straight away. Restoring an earlier dashboard version restores the chart with it. In a space, where `dashboardSlug` is null, the `editContent` description says how each field saves. Repeat the result's `warnings` to the user. `slug`, `contentType` and `dashboardSlug` cannot change. In a conversation bound to a dashboard, only that dashboard's composer charts can be edited.

## Rename

A saved composer tile starts with its `title` set to the chart's `name`, and shows its `title` over the chart's `name`. When you change `name`, update each `composer_chart` tile with this `chartSlug` whose `title` equals the old name: set it to the new name with `editContent` on the dashboard. Leave other titles as they are.

## Columns

`chart.columns` and `chartConfig` name columns the terminal node returns, so keep them pointing at columns it still returns after the edit.

Dashboard filters reach a composer tile through the fields and SQL columns its nodes return. If an edit drops or renames a column a dashboard filter targets on this tile, that filter stops applying to it without an error. Keep those column names, or tell the user which filter no longer applies.

## Approval

Adding or changing the `sql` of a warehouse SQL node (`sourceType: "sql"`) publishes new SQL, so the user approves it first, as for a SQL chart; an MCP client approves the call itself. Write the full SQL as a string value in the patch (for example `replace` at `/pipeline/nodes/1/sql`); SQL copied or moved from elsewhere is refused. Without SQL mode, an edit that adds warehouse SQL is refused; other edits still save. Transformation nodes (DuckDB SQL, Python) need no approval.

- Rejected: nothing is saved. Ask the user what they want instead of resubmitting the same SQL.
- Timed out: nothing is saved. Tell the user and wait for them to ask again.
