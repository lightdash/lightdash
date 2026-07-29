const WAREHOUSE_TOOL_NAMES = new Set([
    'generateVisualization',
    'runContentQuery',
    'runSavedChart',
    'runSql',
    'searchFieldValues',
]);

const WAREHOUSE_MCP_TOOL_RE =
    /__(?:run_metric_query|run_sql|search_field_values)(?:_\d+)?$/;

export const isDeepResearchWarehouseTool = (toolName: string): boolean =>
    WAREHOUSE_TOOL_NAMES.has(toolName) || WAREHOUSE_MCP_TOOL_RE.test(toolName);

export const isDeepResearchWarehouseMcpTool = (toolName: string): boolean =>
    WAREHOUSE_MCP_TOOL_RE.test(toolName);
