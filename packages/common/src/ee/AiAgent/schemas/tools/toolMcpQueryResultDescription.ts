export const MCP_QUERY_SYNC_WAIT_MS = 50_000;
export const MCP_QUERY_POLL_INTERVAL_MS = 1000;

export const MCP_QUERY_SYNC_WAIT_SECONDS = MCP_QUERY_SYNC_WAIT_MS / 1000;
export const MCP_QUERY_SYNC_WAIT_LABEL = `~${MCP_QUERY_SYNC_WAIT_SECONDS}s server-side`;

export const MCP_QUERY_TIMING_NOTE = `Each get_query_result call waits up to ${MCP_QUERY_SYNC_WAIT_LABEL}. If a polling request times out or its connection fails, retry get_query_result with the same queryUuid. Warehouse execution timeouts are governed by the warehouse connection, not the MCP wait window.`;

export const MCP_QUERY_ERROR_NOTE = `Validation errors fail before a query starts and should be fixed, not retried. Application errors and warehouse execution errors are terminal until the request is corrected.`;

export const MCP_ARTIFACT_INTEGRATION_NOTE = `When building an HTML/React artifact that calls MCP, load the mcp-artifact-integration skill (read_skill with name: "mcp-artifact-integration") for response parsing, polling, errors and chart data. This is not needed for ordinary chat or the built-in chart app.`;

export const MCP_QUERY_RESULT_USAGE_NOTE = `Prefer structuredContent.result when available; otherwise use content text. Check both isError and terminal result.status values. If running, wait as instructed and call get_query_result with the same queryUuid; never resubmit the original query.`;

type McpVisualizationSourceTool =
    | 'run_metric_query'
    | 'run_sql'
    | 'get_query_result';

export const buildMcpVisualizationFollowUpInstruction = (
    toolName: McpVisualizationSourceTool,
) =>
    toolName === 'run_sql'
        ? 'For visuals supported by the semantic layer, prefer run_metric_query then render_chart. render_chart does not support run_sql results.'
        : `For a visual, call render_chart after ${toolName} returns done for a metric query.`;
