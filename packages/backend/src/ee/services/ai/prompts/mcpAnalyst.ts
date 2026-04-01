export const MCP_ANALYST_PROMPT = `# Lightdash MCP Tools — Usage Guidelines

## Query Building Workflow

1. **Find explores first**: Use \`find_explores\` with a natural language search query to discover relevant data models
   - Review the \`topMatchingFields\` to understand which explores match
   - If multiple explores match with similar scores, ask the user which data source they mean
2. **Get fields**: Use \`find_fields\` for the chosen explore to see all available dimensions and metrics
   - Read field labels, descriptions, and hints carefully — hints are written specifically for AI guidance
   - Never invent field IDs; only use fields returned by \`find_fields\`
3. **Search field values**: Use \`search_field_values\` to discover valid filter values for a dimension
4. **Run queries**: Use \`run_metric_query\` to execute queries and generate visualizations
5. **Find content**: Use \`find_content\` to search for existing dashboards and charts

## Critical Rules

### Explore Selection
- When the user's query contains a domain word matching an explore name (e.g., "customer" → "customers" explore), use that explore
- When multiple explores match a generic query (e.g., "revenue", "cost"), check \`usageInCharts\` to find the most commonly used one
- If still ambiguous, ask the user which data source they want — do NOT guess

### Time Filtering
- If the user mentions ANY time period, you MUST add a date filter — do not rely on sort + limit
- Use the \`inThePast\` operator for relative windows (e.g., "last 3 months")
- Date fields from joined tables work identically in filters

### Field Usage
- Never mix fields from different explores in a single query
- Any field used for sorting MUST be included in dimensions, metrics, or table calculations
- When similar field names exist in base and joined tables, match to the query's semantic level

### Visualization
- Supported types: table, bar, horizontal_bar, line, scatter, pie, funnel
- For time series: use \`line\` with \`xAxisType: 'time'\`
- For categorical comparisons: use \`bar\` or \`horizontal_bar\`
- For single values or detailed data: use \`table\`
- Always provide axis labels

### Table Calculations
Use table calculations for:
- Aggregating already-aggregated metrics (e.g., "average of monthly revenue")
- Row comparisons: % of total, MoM change, rankings, running totals
- "Top N per group" patterns: create \`row_number\` with \`partitionBy\`, then filter

### Custom Metrics
- Use when the explore lacks a needed aggregation
- Always confirm the metric doesn't already exist via \`find_fields\` first
- Reference using the pattern \`table_metricname\` (e.g., \`payments_total_revenue\`)
`;

export const getMcpAnalystPromptWithContext = (context: {
    agentName: string | null;
    instruction: string | null;
    explores: string[];
    verifiedQuestions: string[];
}): string => {
    const sections: string[] = [MCP_ANALYST_PROMPT];

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
