---
name: composer-chart-reference
description: Creating, reading, testing and editing a composer chart (a dashboard chart drawn from a pipeline of queries), and the SQL approval step for its warehouse SQL nodes.
---

# Composer Chart Reference

A composer chart is a dashboard chart whose definition is a pipeline of queries (nodes) plus a chart. A dashboard shows it in a `composer_chart` tile that names it by `chartSlug`. It belongs to that dashboard. You can create, read, run and edit one.

## Always state the type

Pass `type: "composer_chart"` to `createContent`, `readContent` and `editContent`. A composer chart can share its slug with a chart or SQL chart, so the type picks which one you mean.

## Create

Create one only when the user asks to save a result to a dashboard. It needs an existing dashboard (`dashboardSlug`) and gets a tile at the bottom of the dashboard's first tab. Pass the content in one of two shapes:

- **From a query node** (usual): `{ from: "node", nodeId, sessionId, dashboardSlug, name, description, vizConfig }`. `nodeId` names a node from a successful `query` call; the chart saves it and every node it reads. `vizConfig` references that node's result columns: pass the one the user saw with `visualize`, or over MCP the one you chose for the result. `sessionId` is the query result's session id over MCP, and null in an agent conversation. The node's SQL was approved when `query` ran it, so this asks no approval.
- **From full JSON**: `{ from: "json", dashboardSlug, name, description, pipeline, chart }`, with `pipeline` and `chart` shaped as `readContent` returns them; a `slug` is not kept. Warehouse SQL in it needs approval, as for a SQL chart.

Done when the result links the dashboard and `runContentQuery` on the new chart returns the rows the user saw.

## Read, test, edit

1. Read it: `readContent` with `type: "composer_chart"` and the tile's `chartSlug`. The result has `pipeline` (its `nodes` and `terminalNodeId`) and `chart` (`columns`, `chartConfig`, `pivotConfig`, `tableConfig`).
2. Test any node you change or add before saving it: run the changed pipeline with the `query` tool. Done when it succeeds and its terminal node returns every column `chart.columns` references (see Columns).
3. Patch exactly what you read with `editContent` (`type: "composer_chart"`), as RFC6902 operations on that JSON.
4. Check the saved chart with `runContentQuery` (`source.type: "dashboardChart"`, `chartType: "composer_chart"`, the dashboard's slug). Done when the terminal node's rows show the change you made.

The edit is saved in place as a new version of the chart, so the dashboard shows it straight away; restoring an earlier dashboard version restores the chart with it. `slug`, `contentType` and `dashboardSlug` cannot change. In a conversation bound to a dashboard, only that dashboard's composer charts can be edited.

## Columns

`chart.columns` and `chartConfig` name columns the terminal node returns, so keep them pointing at columns it still returns after the edit.

Dashboard filters reach a composer tile through the fields and SQL columns its nodes return. If an edit drops or renames a column a dashboard filter targets on this tile, that filter stops applying to it without an error. Keep those column names, or tell the user which filter no longer applies.

## Approval

Adding or changing the `sql` of a warehouse SQL node (`sourceType: "sql"`) publishes new SQL, so the user approves it first, as for a SQL chart; an MCP client approves the call itself. Write the full SQL as a string value in the patch (for example `replace` at `/pipeline/nodes/1/sql`); SQL copied or moved from elsewhere is refused. Without SQL mode, an edit that adds warehouse SQL is refused; other edits still save. Transformation nodes (DuckDB SQL, Python) need no approval.

- Rejected: nothing is saved. Ask the user what they want instead of resubmitting the same SQL.
- Timed out: nothing is saved. Tell the user and wait for them to ask again.
