const aggregateOrigins = (sql: string): string =>
    `STRING_AGG(DISTINCT (${sql}), ', ' ORDER BY (${sql}))`;

// Aggregate retained context within the existing row; missing identity is not origin.
export const usageActivityOriginSql = (table: string): string => {
    const field = (name: string) => `\${${table}.${name}}`;
    switch (table) {
        case 'ai_usage':
            return "MAX('AI')";
        case 'agent_requests':
            return aggregateOrigins(
                `CASE WHEN ${field('surface')} = 'embed' THEN 'Embed / AI'
                WHEN ${field('surface')} = 'slack' THEN 'Slack / AI' ELSE 'AI' END`,
            );
        case 'data_app_events':
        case 'data_app_reach':
            return aggregateOrigins(
                `CASE WHEN ${field('view_context')} = 'embed' THEN 'Embed'
                WHEN ${field('view_context')} = 'mcp' THEN 'MCP' ELSE 'App' END`,
            );
        case 'content_reach':
            return aggregateOrigins(
                `CASE WHEN ${field('view_context')} = 'embed' THEN 'Embed' ELSE 'Content view' END`,
            );
        case 'query_events':
        case 'semantic_usage':
            return aggregateOrigins(
                `CASE WHEN ${field('context')} = 'embed' THEN 'Embed'
                WHEN ${field('context')} = 'ai' THEN 'AI'
                WHEN ${field('context')} LIKE 'mcp.%' THEN 'MCP'
                WHEN ${field('context')} IN ('gsheets', 'gsheetsAddon') THEN 'Google Sheets'
                WHEN ${field('workload_origin')} = 'scheduled' THEN 'Scheduled'
                WHEN ${field('workload_origin')} = 'autorefresh' THEN 'Auto-refresh'
                WHEN ${field('workload_origin')} = 'app' THEN 'App'
                ELSE 'Query' END`,
            );
        case 'tool_activity':
            return aggregateOrigins(
                `CASE WHEN ${field('source')} = 'mcp' AND ${field('actor_type')} = 'service_account' THEN 'MCP / service account'
                WHEN ${field('source')} = 'mcp' THEN 'MCP' ELSE 'AI tools' END`,
            );
        case 'export_events':
            return "MAX('Export')";
        case 'user_activity':
            return aggregateOrigins(
                `CASE ${field('stream')}
                WHEN 'ai_usage' THEN 'AI'
                WHEN 'agent_steps' THEN 'AI agent'
                WHEN 'mcp_tool_calls' THEN 'MCP'
                WHEN 'data_app_events' THEN 'App'
                WHEN 'export_events' THEN 'Export'
                WHEN 'query_events' THEN 'Query'
                WHEN 'content_views' THEN 'Content view'
                ELSE 'Origin unavailable' END`,
            );
        default:
            return "MAX('Origin unavailable')";
    }
};
