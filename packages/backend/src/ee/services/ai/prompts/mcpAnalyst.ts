// Only offered to sessions whose tools/list actually includes run_sql
// (gated on manage:SqlRunner).
const RUN_SQL_GUIDANCE = `### When to Use run_sql vs run_metric_query
- **Prefer \`run_metric_query\`** for standard analysis — it leverages the semantic layer and ensures consistent metric definitions
- **Use \`run_sql\`** only for ad-hoc queries, cross-table joins not modeled in explores, or when the user explicitly requests raw SQL
- \`run_sql\` defaults to 500 rows (max 5000) — use the \`limit\` parameter to control result size
- Use the SQL dialect appropriate for the connected warehouse

`;

const buildMcpAnalystPrompt = (
    runSqlEnabled: boolean,
): string => `# Lightdash MCP Tools — Usage Guidelines

## Query Building Workflow

0. **Get started with context**: Call \`get_context\` first, select the relevant project, and pass its \`projectUuid\` to every project-scoped tool. When agent-specific scope is useful, call \`route_agent\` with that project UUID and pass its returned \`agentUuid\` to subsequent scoped tools. If routing is unavailable or full project scope is desired, omit \`agentUuid\`; use \`set_agent\` to select an agent manually
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
6. **Render charts**: If the user wants a chart, call \`render_chart\` after \`run_metric_query\` or \`get_query_result\` returns done with a \`queryUuid\`
7. **Browse content**: Use \`list_content\` to browse accessible spaces and direct content inside a space
8. **Find content**: Use \`find_content\` to search for existing dashboards and charts

## Critical Rules

### Explore Selection
- When the user's query contains a domain word matching an explore name, prefer that explore if \`grep_fields\` also surfaces relevant fields there
- When multiple explores surface plausible fields, choose the one whose dimensions and metrics match the user's intended grain
- If still ambiguous, ask the user which data source they want — do NOT guess

${runSqlEnabled ? RUN_SQL_GUIDANCE : ''}### Time Filtering
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
Use table calculations for:
- Aggregating already-aggregated metrics (e.g., average of monthly totals)
- Row comparisons: % of total, period-over-period change, rankings, running totals
- "Top N per group" patterns: create \`row_number\` with \`partitionBy\`, then filter

### Custom Metrics
- Use when the explore lacks a needed aggregation
- Always confirm the metric doesn't already exist via \`grep_fields\` / \`get_metadata\` first
- Reference using the pattern \`table_metricname\`
`;

export const getMcpAnalystPrompt = (args?: {
    runSqlEnabled?: boolean;
}): string => {
    const runSqlEnabled = args?.runSqlEnabled ?? true;
    return buildMcpAnalystPrompt(runSqlEnabled);
};

export const MCP_ANALYST_PROMPT = getMcpAnalystPrompt();

export const getMcpAnalystPromptWithContext = (context: {
    agentName: string | null;
    instruction: string | null;
    explores: string[];
    verifiedQuestions: string[];
    runSqlEnabled?: boolean;
}): string => {
    const sections: string[] = [
        getMcpAnalystPrompt({
            runSqlEnabled: context.runSqlEnabled,
        }),
    ];

    if (context.agentName) {
        sections.push(`## Active Agent: ${context.agentName}`);
    }

    if (context.instruction) {
        sections.push(
            `## Agent Instructions\nFollow these domain-specific rules:\n${context.instruction}`,
        );
    }

    if (context.explores.length > 0) {
        sections.push(
            `## Available Explores\nThe active agent has access to these explores. Prefer these when searching:\n${context.explores.map((e) => `- ${e}`).join('\n')}`,
        );
    }

    if (context.verifiedQuestions.length > 0) {
        sections.push(
            `## Verified Questions\nThese are curated example queries that demonstrate correct usage of the data model. Use them as patterns for building similar queries:\n${context.verifiedQuestions.map((q) => `- "${q}"`).join('\n')}`,
        );
    }

    return sections.join('\n\n');
};
