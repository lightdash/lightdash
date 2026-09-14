---
name: mcp-artifact-integration
description: Integrate Lightdash MCP query results into Claude-created HTML or React artifacts. Covers host bridges, response envelopes, polling, errors, CSV fallback and chart data. Not needed for ordinary chat or Lightdash's built-in chart app.
availability:
    - mcp
---

# Lightdash query results in HTML/React artifacts

Use this skill when creating an HTML/React artifact or app that calls Lightdash through Model Context Protocol (MCP). It describes the existing data contract; it does not add a new endpoint, SDK or browser bridge.

## Choose and start the query

Choose `run_metric_query` for questions expressible in the semantic layer. Discover field IDs with `grep_fields` / `get_metadata`, and supply required parameters explicitly: omitted parameters may silently use defaults. Use `run_sql` for other read-only SELECT queries in the warehouse's dialect. Read each tool's schema for its effective row limit; deployment configuration can change the maximum.

Call the query-start tool once. Keep its query UUID and original project/agent scope for subsequent polling. The artifact should track its own loading, success, empty and error states; a pending query is not an empty dataset.

## Read the result envelope

A full MCP CallToolResult can contain:

- `content`: an array of typed content blocks. Query tools put CSV or status/error text in the first text block. Additional blocks can contain an applied-parameters note, `queryUuid: <id>`, `[Scope: ...]` or a compatibility warning.
- `structuredContent.result`: the typed result, when exposed by the host. Prefer this over parsing CSV.
- `isError`: a tool failure flag. Check it, but also inspect `structuredContent.result.status`: terminal query statuses can arrive without `isError`.
- `_meta`: host/app metadata. Do not assume your artifact bridge exposes it.

Do not concatenate every content block into CSV. Do not parse an entire CallToolResult as row data. When the host exposes text only, follow the status text and parse only the data block with a real CSV parser (quoted delimiters, quotes and line breaks are legal). If the bridge discards necessary status or UUID information, show an integration error rather than guessing.

The companion [result contracts](resources/result-contracts.md) gives the exact completed/running/terminal shapes and link semantics. Native MCP clients can read the resource; fallback clients can call `read_skill_resource` with `name: "mcp-artifact-integration"` and `path: "resources/result-contracts.md"`.

## Poll without re-executing

1. Start the query once with `run_sql` or `run_metric_query`.
2. Check `isError` first. For structured results, branch on `result.status`.
3. `running`: retain the returned `queryUuid`, show "Query still running…", wait `nextPollAfterMs`, then call `get_query_result` with that same UUID and scope. Text-only clients use the UUID and wait instructions in the returned text. Never invent an ID or restart the original query to check progress.
4. `done`: stop polling and render the data. An empty `rows` array is successful completion with zero rows, not a parsing failure.
5. `error`, `cancelled` or `expired`: stop polling and display the returned error/status. These can be normal MCP results without `isError: true`.

Both the initial query-start call and each polling call can wait up to approximately 50 seconds server-side. Allow for that in the host bridge's timeout. This is not the warehouse execution timeout; warehouse timeouts come from the Lightdash connection. `heartbeatAt` records the latest Lightdash check that confirmed the query was still running, not a warehouse progress percentage.

If a polling call loses its connection or times out, retry only `get_query_result` with the same UUID, using bounded retries/backoff. Avoid overlapping polls; stop on terminal state, artifact teardown or user cancellation. Stopping local polling does not cancel warehouse execution. Ignore stale responses if the user starts a different query while an earlier call is in flight.

If the initial query-start call loses its response before you receive a UUID, do not automatically resubmit: the warehouse may already be executing it. Report that the outcome is unknown; a retry can duplicate execution.

Validation failures should be corrected before another query is started. Application/warehouse errors are terminal until corrected; do not put them into the transient polling retry loop.

## Build your artifact's own visualization

Use completed query `rows` as data for your HTML table or React chart library. For metric results, rows use stable field IDs and `fields` provides metadata; CSV headers instead use display labels. Keep stable IDs for data access, use labels for presentation, and do not treat labels as unique identifiers.

`render_chart` is a separate tool for Lightdash's built-in chart UI in MCP App-capable clients. It supports completed metric queries only and never starts, polls or reruns a query. Its model-visible `echartsOption` is a placeholder, not a downloadable chart specification. A custom artifact should build charts from query data rather than depend on `_meta` or copy that placeholder into ECharts.

`run_sql` and SQL polling return data only, never Lightdash chart artifacts. Your custom artifact may visualize that data itself; do not send SQL query UUIDs to `render_chart`.

Treat returned labels, cell values and error messages as untrusted display data: use escaped text/normal React rendering, not raw HTML injection. Use the structured value types rather than coercing every value with parseFloat/parseInt. Handle nulls and empty results explicitly.
