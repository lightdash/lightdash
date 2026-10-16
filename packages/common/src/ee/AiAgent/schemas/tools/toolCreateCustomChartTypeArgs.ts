import { z } from 'zod';

export const MCP_CUSTOM_CHART_TYPE_AGENT_SCOPE_GUIDANCE =
    '- An agent-scoped session restricted to specific spaces cannot read a personal chart type. Call this tool and get_data_app_build_status without agentUuid to build and poll a chart type you own.';

export const mcpCustomChartTypeBuildStartedOutputSchema = z.object({
    slug: z
        .string()
        .describe(
            "The chart type's permanent slug. Pass it as appSlug to get_data_app_build_status.",
        ),
    version: z
        .number()
        .int()
        .positive()
        .describe('The version of the chart type this build produces.'),
});

export const MCP_TOOL_CREATE_CUSTOM_CHART_TYPE_DESCRIPTION = `Tool: create_custom_chart_type

Start building a custom chart type: a reusable visualization that saved charts in this project can render with. Use it when the built-in chart types cannot draw what the user wants; for a whole interactive app, use generate_data_app.

- Describe the data the chart type expects by role (a date, a category, a value), not by one query's field names. Pass queryUuid to share the first rows of a completed run_metric_query as sample data.
- The build takes a few minutes. Poll get_data_app_build_status with appSlug set to the returned slug until it is "ready", "error" or "cancelled", then send the user to Chart Studio. Call this tool once per request.
- Refer to the chart type by the returned slug: a name already taken gets a numeric suffix.
${MCP_CUSTOM_CHART_TYPE_AGENT_SCOPE_GUIDANCE}
`;

export const mcpCreateCustomChartTypeArgsSchema = z.object({
    name: z
        .string()
        .describe(
            'Short title-case name for the chart type ("Sankey Flow"). It sets the slug and is not renamed later.',
        ),
    prompt: z
        .string()
        .describe(
            'Self-contained brief for the coding agent: what the visualization draws, how it encodes the data and how it behaves. The agent does not see this conversation, only the sample rows from queryUuid if given.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'Organization theme to build the chart type with: its slug, from the attached context ("Theme: <name> (slug: <slug>)"). Omit it to use the organization default. An unknown slug returns an error and starts no build.',
        ),
    queryUuid: z
        .string()
        .uuid()
        .nullish()
        .default(null)
        .describe(
            'Optional uuid of a completed run_metric_query whose first rows are shared with the build as sample data. It does not bind the chart type to that query.',
        ),
});

export type McpCreateCustomChartTypeArgs = z.infer<
    typeof mcpCreateCustomChartTypeArgsSchema
>;
