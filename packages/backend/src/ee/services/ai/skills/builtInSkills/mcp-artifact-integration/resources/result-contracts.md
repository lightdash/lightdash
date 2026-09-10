---
name: result-contracts
description: Response shapes and data handling for Lightdash MCP SQL, metric-query, polling and chart-rendering tools used from custom artifacts.
---

# Query result contracts

These shapes describe `structuredContent.result`, not the whole CallToolResult. Inspect the host bridge to locate that envelope; never assume it is returned unwrapped. Optional host omission of structuredContent is different from a query returning zero rows.

## Completed SQL

`run_sql` returns:

```text
{
  status: "done",
  rows: Array<Record<string, unknown>>,
  columns: string[],
  rowCount: number,
  sqlRunnerUrl: string | null
}
```

- Rows are keyed by column name; `columns` gives their order and `rowCount` is the number returned.
- Initial synchronous `run_sql` completion does NOT include `queryUuid`. Do not require one when the query is already done.
- If SQL required polling, completed `get_query_result` adds `queryUuid` to this shape.
- First content block contains CSV with column-name headers, or prose such as `Query returned 0 rows. Columns: ...` for empty results. Do not pass the empty-result prose to a CSV parser.
- Structured empty results still have `status: "done"`, `rows: []`, `columns`, `rowCount: 0` and `sqlRunnerUrl`.
- Lightdash applies the requested row limit to SQL. Submit a complete SELECT statement; malformed SQL can produce an error near the generated LIMIT.

## Completed metric query

Both `run_metric_query` and metric-query completion from `get_query_result` return:

```text
{
  status: "done",
  queryUuid: string,
  rows: Array<Record<string, unknown>>,
  fields: Record<string, unknown>,
  exploreUrl: string | null
}
```

- Rows are keyed by field ID; `fields` is Lightdash's field metadata map. Use IDs to access values and metadata for display labels/formatting.
- First text block is CSV with DISPLAY-LABEL headers, not stable field IDs. Duplicate display labels are possible. Do not map CSV columns back to field IDs by guessing.
- Further text blocks may include an applied-parameters note and `queryUuid: <id>`. Keep them separate from CSV. Empty results use `Query returned 0 rows.` and `rows: []`.
- When calling `render_chart`, copy this query's exact UUID from the result or its UUID text block. Never reuse an ID from a different query/session.

## Running: all query-start tools and get_query_result

```text
{
  status: "running",
  queryUuid: string,
  nextPollAfterMs: number,
  heartbeatAt: string
}
```

There are no completed rows yet. The text response also contains the UUID, wait instructions and a warning not to resubmit the original query. Honor `nextPollAfterMs` (currently 1000 ms) instead of hard-coding an immediate retry loop. `heartbeatAt` is an ISO timestamp of the latest Lightdash status check.

## Terminal and tool errors

`get_query_result` can return a NORMAL CallToolResult with:

```text
{
  status: "error" | "cancelled" | "expired",
  queryUuid: string,
  error: string | null
}
```

`isError` may be absent here. Stop polling and show the terminal status/error; never classify this as success merely because `isError` is false or absent.

Startup, validation, authorization and execution exceptions instead return `isError: true` with error text in `content[0]` and no structuredContent. Never parse that text as CSV. Text-only bridges must surface both error flags and status text; if necessary information is hidden, fail explicitly instead of guessing.

## Values and links

Numbers and booleans in structured rows are not pre-stringified; do not blindly apply parseFloat/parseInt. Strings, ISO date strings and null are valid values. CSV is a formatted text representation, not a substitute for typed structured values. Preserve null instead of silently converting it to zero or an empty string.

`sqlRunnerUrl` and `exploreUrl` are nullable, query-specific links returned by Lightdash. Use the returned link when an artifact offers an inspect/edit action; hide the action if null. Do not construct project-level links and claim they reproduce this query. Do not add your own SQL Runner link to the assistant's final prose: the platform already provides a query-specific continuation action, and a prose link can target the wrong query when several tools run in one turn.

## render_chart: built-in MCP App output, not artifact chart data

```text
{
  status: "done",
  queryUuid: string,
  exploreUrl: string | null,
  echartsOption: {} | null
}
```

The empty object is a lightweight placeholder. The full chart option and rows/fields live in `_meta.result` for the built-in MCP App; artifact bridges may not expose that metadata. Null means no ECharts option (for example a table or zero rows), not a failed query. Content contains a short render-status message, not the query CSV.

This tool supports completed `run_metric_query` results only. It rejects SQL Runner/run_sql query UUIDs and does not execute or poll queries. Custom HTML/React artifacts should obtain rows from query tools and render their own visuals, not rely on a built-in chart frame or on metadata reaching the model.
