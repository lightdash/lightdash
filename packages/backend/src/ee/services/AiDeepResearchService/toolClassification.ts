const WAREHOUSE_TOOL_NAMES = new Set([
    'generateVisualization',
    'runContentQuery',
    'runSavedChart',
    'runSql',
    'searchFieldValues',
]);
const EVIDENCE_QUERY_TOOL_NAMES = new Set([
    'generateVisualization',
    'runContentQuery',
    'runSavedChart',
    'runSql',
]);

const WAREHOUSE_MCP_TOOL_RE =
    /__(?:run_metric_query|run_sql|search_field_values)(?:_\d+)?$/;
const EVIDENCE_QUERY_MCP_TOOL_RE = /__(?:run_metric_query|run_sql)(?:_\d+)?$/;
const RAW_SQL_MCP_TOOL_RE = /__run_sql(?:_\d+)?$/;

export const isDeepResearchWarehouseTool = (toolName: string): boolean =>
    WAREHOUSE_TOOL_NAMES.has(toolName) || WAREHOUSE_MCP_TOOL_RE.test(toolName);

export const isDeepResearchWarehouseMcpTool = (toolName: string): boolean =>
    WAREHOUSE_MCP_TOOL_RE.test(toolName);

export const isDeepResearchEvidenceQueryTool = (toolName: string): boolean =>
    EVIDENCE_QUERY_TOOL_NAMES.has(toolName) ||
    EVIDENCE_QUERY_MCP_TOOL_RE.test(toolName);

export const isDeepResearchRawSqlTool = (toolName: string): boolean =>
    toolName === 'runSql' || RAW_SQL_MCP_TOOL_RE.test(toolName);

export const isDeepResearchRawSqlMcpTool = (toolName: string): boolean =>
    RAW_SQL_MCP_TOOL_RE.test(toolName);
