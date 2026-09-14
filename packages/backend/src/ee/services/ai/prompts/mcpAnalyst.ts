import { MCP_FILTER_EXPRESSION_GUIDANCE_SECTION } from './filterGuidance';

// Only offered to sessions whose tools/list actually includes run_sql
// (gated on manage:SqlRunner).
const RUN_SQL_GUIDANCE = `### When to Use run_sql vs run_metric_query
- **Prefer \`run_metric_query\`** for standard analysis — it leverages the semantic layer and ensures consistent metric definitions
- **Use \`run_sql\`** only for ad-hoc queries, cross-table joins not modeled in explores, or when the user explicitly requests raw SQL
- \`run_sql\` defaults to 500 rows (max 5000) — use the \`limit\` parameter to control result size
- Use the SQL dialect appropriate for the connected warehouse

`;

const RAW_SQL_WORKFLOW_GUIDANCE = `For a complete raw SQL query, follow step 0, then skip steps 1–3 and call \`run_sql\`. If raw SQL is requested without enough warehouse schema, ask for the missing table or column identifiers; \`grep_fields\` and \`get_metadata\` only discover modeled Lightdash Explores.

`;

const CONTENT_ONLY_PROMPT = `# Lightdash MCP — Saved Content Mode

This session cannot run queries. Answer from saved content the user can access.

1. \`get_context\`: pick the project; pass its \`projectUuid\` to project-scoped tools
2. \`find_content\`: search 2–4 short keyword queries FIRST, before any conclusion about what is available
3. \`read_content\`: confirm what the best match shows and get its link — it returns definitions, not data values, so link the user to the numbers
4. \`list_content\`: browse spaces when search misses

Rules:
- Never say information is unavailable before searching saved content
- No workarounds: never suggest raw SQL, elevated permissions, tools not in this session, or UI actions the user may not have (editing or exploring charts)
- If nothing matches, say so plainly
- Page parameters are numbers — never \`NaN\` or \`"null"\`
`;

const SQL_ONLY_PROMPT = `# Lightdash MCP — SQL Runner Mode

Governed metric execution (\`run_metric_query\`) is not available in this session, so the semantic layer cannot answer questions here. \`run_sql\` is the only way to execute queries.

## Query Workflow

0. **Get started with context**: Call \`get_context\` first, select the relevant project, and pass its \`projectUuid\` to every project-scoped tool
1. **Confirm the schema**: Semantic-layer discovery tools are not available in this session. If the user's request does not include the warehouse tables and columns you need, ask for the missing identifiers — never guess or invent them
2. **Run queries**: Call \`run_sql\` with the raw SQL
   - Defaults to 500 rows (max 5000) — use the \`limit\` parameter to control result size
   - Use the SQL dialect appropriate for the connected warehouse
3. **Poll long-running queries**: If a query returns \`status: "running"\`, call \`get_query_result\` with the \`queryUuid\` until it returns done/error/cancelled/expired
4. **Browse content**: Use \`list_content\` to browse accessible spaces and \`find_content\` to search dashboards, charts, and Data Apps — \`read_content\` returns definitions and links, not data values

## Rules

- When an answer depends on governed metric definitions, prefer linking the user to existing saved content over re-deriving the metric in SQL
- Page parameters are numbers — never \`NaN\` or \`"null"\`
`;

const buildMcpAnalystPrompt = (
    runSqlEnabled: boolean,
    filterExpressionsEnabled: boolean,
): string => `# Lightdash MCP Tools — Usage Guidelines

## Query Building Workflow

${runSqlEnabled ? RAW_SQL_WORKFLOW_GUIDANCE : ''}0. **Get started with context**: Call \`get_context\` first, select the relevant project, and pass its \`projectUuid\` to every project-scoped tool. When agent-specific scope is useful, call \`route_agent\` with that project UUID and pass its returned \`agentUuid\` to subsequent scoped tools. If routing is unavailable or full project scope is desired, omit \`agentUuid\`; use \`set_agent\` to select an agent manually
1. **Search fields first**: Use \`grep_fields\` with 1–5 high-signal keyword patterns to discover the relevant explore and field IDs
   - Search with business terms and synonyms, not long natural-language phrases
   - Use \`|\` to OR synonyms (for example \`revenue|sales\`) and spaces or \`.*\` to require terms together (for example \`order.*status\`)
   - Pass several patterns in one call so you can compare the different angles of the request together
   - Pick the single explore whose fields answer the question at the right grain; if several still fit, ask the user which data source they mean
2. **Get metadata**: Use \`get_metadata\` for the explores and fields you selected from \`grep_fields\`
   - Batch all needed explores and fields in one call
   - Use it to confirm joined tables, required filters, filter types, case-sensitivity, and field-level hints before building the query
   - Never invent field IDs; only use exact values returned by \`grep_fields\` / \`get_metadata\`
3. **Search field values**: Use \`search_field_values\` to discover valid filter values for a dimension
4. **Run queries**: Use \`run_metric_query\` for semantic-layer metric queries${runSqlEnabled ? ', or `run_sql` for custom SQL' : ''}
5. **Poll long-running queries**: If a query returns \`status: "running"\`, call \`get_query_result\` with the \`queryUuid\` until it returns done/error/cancelled/expired
6. **Render charts**: If the user wants a chart, call \`render_chart\` with the \`queryUuid\` returned when \`run_metric_query\` completes, or with the \`queryUuid\` returned by \`get_query_result\` after polling that metric query to completion
7. **Browse content**: Use \`list_content\` to browse accessible spaces and direct content inside a space
8. **Find content**: Use \`find_content\` to search for existing dashboards, charts, and Data Apps

## Critical Rules

### Tool Catalogue
- \`run_metric_query\` is registered for this session. If it is not in your catalogue, your client cached an outdated tool list — say so and ask the user to reconnect the connector${runSqlEnabled ? '; never substitute `run_sql` for it' : ''}

### Explore Selection
- When the user's query contains a domain word matching an explore name, prefer that explore if \`grep_fields\` also surfaces relevant fields there
- When multiple explores surface plausible fields, choose the one whose dimensions and metrics match the user's intended grain
- If still ambiguous, ask the user which data source they want — do NOT guess

${runSqlEnabled ? RUN_SQL_GUIDANCE : ''}${filterExpressionsEnabled ? `${MCP_FILTER_EXPRESSION_GUIDANCE_SECTION}\n\n` : ''}### Time Filtering
- If the user mentions ANY time period, you MUST add a date filter — do not rely on sort + limit
- Use the \`inThePast\` operator for relative windows
- Date fields from joined tables work identically in filters

### Field Usage
- Never mix fields from different explores in a single query
- Any field used for sorting MUST be included in dimensions, metrics, or table calculations
- When similar field names exist in base and joined tables, match to the query's semantic level

### Pagination
- Page parameters must be numbers (e.g., \`1\`) — never use \`NaN\` or \`"null"\`

### Visualization
- \`run_metric_query\` returns metric-query data;${runSqlEnabled ? ' `run_sql` returns SQL data;' : ''} \`render_chart\` renders visuals for completed metric queries
- Supported types: table, bar, horizontal_bar, line, scatter, pie, funnel
- For time series: use \`line\` with \`xAxisType: 'time'\`
- For categorical comparisons: use \`bar\` or \`horizontal_bar\`
- For single values or detailed data: use \`table\`
- Always provide axis labels

### Table Calculations
Author table calculations as type \`formula\` (the field's schema documents the syntax). Use them for:
- Arithmetic across metrics: \`metric_a + metric_b\`, ratios \`metric_a / metric_b\`
- Aggregating already-aggregated metrics (e.g., average of monthly totals): \`AVG(metric)\`
- Row comparisons: % of total \`m / SUM(m)\`, period-over-period \`(m - LAG(m, ORDER BY date)) / LAG(m, ORDER BY date)\`, rankings \`RANK(...)\`, running totals \`RUNNING_TOTAL(m, ORDER BY date)\`, trailing 3-period average \`MOVING_AVG(m, 2, ORDER BY date)\`
- "Top N per group" patterns: \`ROW_NUMBER(PARTITION BY group, ORDER BY m DESC)\`, then filter

### Custom Metrics
- Use when the explore lacks a needed aggregation
- Always confirm the metric doesn't already exist via \`grep_fields\` / \`get_metadata\` first
- Reference using the pattern \`table_metricname\`
`;

export const getMcpAnalystPrompt = ({
    runSqlEnabled,
    runMetricQueryEnabled,
    filterExpressionsEnabled,
}: {
    runSqlEnabled: boolean;
    runMetricQueryEnabled: boolean;
    filterExpressionsEnabled: boolean;
}): string => {
    if (!runSqlEnabled && !runMetricQueryEnabled) {
        return CONTENT_ONLY_PROMPT;
    }
    if (!runMetricQueryEnabled) {
        return SQL_ONLY_PROMPT;
    }
    return buildMcpAnalystPrompt(runSqlEnabled, filterExpressionsEnabled);
};

export const MCP_ANALYST_PROMPT = getMcpAnalystPrompt({
    runSqlEnabled: true,
    runMetricQueryEnabled: true,
    filterExpressionsEnabled: false,
});
