export const MCP_QUERY_SYNC_WAIT_MS = 50_000;
export const MCP_QUERY_POLL_INTERVAL_MS = 1000;

export const MCP_QUERY_SYNC_WAIT_SECONDS = MCP_QUERY_SYNC_WAIT_MS / 1000;
export const MCP_QUERY_SYNC_WAIT_LABEL = `~${MCP_QUERY_SYNC_WAIT_SECONDS}s server-side`;

export const MCP_QUERY_CLIENT_SUPPORT_NOTE = `Client support note: some MCP clients expose structuredContent and some connector-style clients expose only content text plus isError. Prefer structuredContent.result when present; otherwise parse the content text fallback and use isError as the success/failure signal.`;

export const MCP_QUERY_TIMING_NOTE = `Timing and timeouts: each run_sql, run_metric_query, and get_query_result call waits up to ${MCP_QUERY_SYNC_WAIT_LABEL} before returning a running response. If unfinished, call get_query_result again with the queryUuid after nextPollAfterMs. Even simple accepted queries can require at least one poll because queue/warehouse startup latency can exceed the first wait window. The warehouse execution timeout is the warehouse connection timeout configured in Lightdash, not an MCP-specific timeout. If the client or transport times out while waiting for a response, retry polling with the same queryUuid instead of treating it as warehouse query failure.`;

export const MCP_QUERY_ERROR_NOTE = `Error handling: schema/input validation errors fail before a query starts and should be fixed rather than retried. Application errors such as unknown queryUuid/explore and warehouse execution errors such as SQL syntax failures are terminal until the request is corrected. Transport/client timeouts are retryable.`;

export const MCP_QUERY_STRUCTURED_RUNNING_NOTE = `A running response includes heartbeatAt, an ISO timestamp for the most recent Lightdash check that confirmed the query was still running.`;

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
- content: [{ type: "text", text: "<CSV string>" }] — ${contentDescription}
- Direct MCP clients that support structured tool results also receive structuredContent.
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
