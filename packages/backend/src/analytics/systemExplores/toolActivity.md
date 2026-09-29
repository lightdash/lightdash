# Tool activity

`tool_activity` combines MCP calls from `mcp_tool_calls` with internal agent tool
calls from `agent_steps`. The `source` dimension distinguishes them. Agent loop
steps are excluded. Existing event-specific metrics keep their definitions.

MCP calls use the existing `mcp_tool_call` emission, including non-query tools and
failures caught by the tool wrapper. The usage projection retains identifiers,
client metadata, status and duration; it excludes arguments, results, raw user
agents and error text. `tools/list` protocol discovery is not a tool invocation.
Query UUIDs are populated from structured responses or polling arguments when
available. Unknown project, client, session and query metadata stays null.

Registered MCP callers can join the current Users name dimension. Service
principals retain an actor UUID but have no user UUID. Internal agent records
retain their existing user attribution and have unknown actor type, because the
historical stream does not identify the authentication principal. Unique actors
include service principals; unique users count attributed user UUIDs. These
counts do not measure seat eligibility or membership history.

Tool activity deduplicates stable call IDs within organization, source and
agent prompt. Separate invocations remain separate calls. Legacy records without
IDs are retained. Historical agent records without an outcome are `unknown`;
error rate divides failures by calls with explicit success/error outcomes and
returns null when there are none. Latency uses observed call durations, not
warehouse query duration or external assistant time.

MCP capture uses the existing `USAGE_EVENTS_ENABLED` writer gate, configured
usage storage, nightly compactor and organization-scoped signed reader. It starts
after deployment; historical MCP analytics are not automatically imported.
Missing MCP files produce a typed empty table, so existing installations can
query historical agent tools before their first MCP event. Sync analytics content
to refresh cached Explore definitions. No new backfill CLI or scheduled job is
required. Existing compaction and User activity catch-up apply to the new stream.

User activity adds `total_mcp_calls` over captured event counts. Unlike the Tool
activity logical invocation count, that raw-event summary can include redelivery;
it preserves the summary model's existing counting semantics.

## Verification

- `toolActivity.test.ts`: native DuckDB executes compiled dimension/metric
  combinations, duplicate IDs, tenant-safe joins, unknown outcomes and old schemas.
- `mcpToolCallsStream.test.ts`: projection allowlist and principal attribution.
- `McpService.queryPolling.test.ts`: early failures and returned query UUID capture.
- `UsageUserActivityBuilder.smoke.test.ts`: opt-in local MinIO test covering six
  streams, compaction, signed reads, user summaries, duplicates and reruns. Set
  `USAGE_USER_ACTIVITY_SMOKE_ENDPOINT=http://localhost:9000` to run against a
  uniquely named disposable bucket; it does not modify production storage.

## Example: MCP adoption and reliability

Open **Tool activity**, select **Users → User name**, **Client name**, **Tool
name**, and **Event ts → Day**. Select **Total calls**, **Unique actors**,
**Failed calls**, **Error rate**, and **Avg duration ms**; filter **Source = mcp**
and run the query. This answers who uses each MCP client/tool per day and how
often those calls fail. Add **Actor type** and **Actor id** to distinguish service
principals from registered users. An empty result before MCP capture is expected.
