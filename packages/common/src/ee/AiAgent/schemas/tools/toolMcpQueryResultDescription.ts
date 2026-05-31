export const MCP_QUERY_SYNC_WAIT_MS = 50_000;
export const MCP_QUERY_POLL_INTERVAL_MS = 1000;

export const MCP_QUERY_SYNC_WAIT_SECONDS = MCP_QUERY_SYNC_WAIT_MS / 1000;
export const MCP_QUERY_SYNC_WAIT_LABEL = `~${MCP_QUERY_SYNC_WAIT_SECONDS}s server-side`;

export const MCP_QUERY_CLIENT_SUPPORT_NOTE = `Some clients expose structuredContent; others only expose content text plus isError. Prefer structuredContent.result when present. Otherwise parse content text and use isError as the success/failure signal.`;

export const MCP_QUERY_TIMING_NOTE = `This tool waits up to ${MCP_QUERY_SYNC_WAIT_LABEL}. If unfinished, call get_query_result again with queryUuid after nextPollAfterMs. Warehouse execution timeout comes from the Lightdash warehouse connection, not MCP. Client/transport timeouts are retryable with the same queryUuid.`;

export const MCP_QUERY_ERROR_NOTE = `Validation errors fail before a query starts and should be fixed, not retried. Application errors and warehouse execution errors are terminal until the request is corrected.`;

export const MCP_QUERY_STRUCTURED_RUNNING_NOTE = `heartbeatAt is an ISO timestamp for the latest Lightdash check that confirmed the query is still running.`;

export const MCP_QUERY_COMMON_NOTES = `- ${MCP_QUERY_CLIENT_SUPPORT_NOTE}
- ${MCP_QUERY_TIMING_NOTE}
- ${MCP_QUERY_ERROR_NOTE}`;

type BuildMcpQueryRunResponseDescriptionArgs = {
    contentDescription: string;
    completedResultShape: string;
};

export const buildMcpQueryRunResponseDescription = ({
    contentDescription,
    completedResultShape,
}: BuildMcpQueryRunResponseDescriptionArgs) => `Response shape (MCP CallToolResult):
- content: [{ type: "text", text: string }] — human-readable fallback. Completed queries return ${contentDescription}; running queries return polling status text; errors return an error message.
- If the query finishes before the MCP wait window, structuredContent: {
${completedResultShape}
  }
- If the query is still running, structuredContent: {
    result: {
      status: "running",
      queryUuid: string,
      nextPollAfterMs: number,
      heartbeatAt: string
    }
  }
  Use get_query_result with this queryUuid to poll until the query is done. ${MCP_QUERY_STRUCTURED_RUNNING_NOTE}`;

export const MCP_GET_QUERY_RESULT_RESPONSE_DESCRIPTION = `Response shape (MCP CallToolResult):
- Running: content contains polling status text and structuredContent.result contains { status: "running", queryUuid, nextPollAfterMs, heartbeatAt }. ${MCP_QUERY_STRUCTURED_RUNNING_NOTE}
- Completed SQL: content contains CSV text and structuredContent.result contains { status: "done", queryUuid, rows, columns, rowCount }.
- Completed metric query: content contains bare CSV text and structuredContent.result contains { status: "done", queryUuid, rows, fields }.
- Failed/cancelled/expired: content contains status/error text and structuredContent.result contains { status, queryUuid, error }.`;
