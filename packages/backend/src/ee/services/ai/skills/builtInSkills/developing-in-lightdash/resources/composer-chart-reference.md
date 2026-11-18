---
name: composer-chart-reference
description: Reading, testing and editing a composer chart (a dashboard chart drawn from a pipeline of queries), and the SQL approval step for its warehouse SQL nodes.
---

# Composer Chart Reference

A composer chart is a dashboard chart whose definition is a pipeline of queries (nodes) plus a chart. A dashboard shows it in a `composer_chart` tile that names it by `chartSlug`. It belongs to that dashboard. You can read, run and edit one; you cannot create one with `createContent`.

## Always state the type

Pass `type: "composer_chart"` to `readContent` and `editContent`. A composer chart can share its slug with a chart or SQL chart, so the type picks which one you mean.

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
