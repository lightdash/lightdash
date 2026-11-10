import { z } from 'zod';

export const MCP_CUSTOM_CHART_TYPE_AGENT_SCOPE_GUIDANCE =
    "- A chart type created over MCP is the caller's personal one, in no space, so a space-restricted agent-scoped session cannot read it. Omit agentUuid here and in get_data_app_build_status.";

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

Build a custom chart type: a reusable visualization for saved charts in the project, when built-in chart types cannot draw what the user wants. For a whole interactive app, use generate_data_app, if available.

- Describe the expected data by role (a date, a category, a value), not by a query's fields.
- Poll get_data_app_build_status with the returned slug as appSlug (a taken name gets a numeric suffix) until "ready", "error" or "cancelled", then send the user to Chart Studio. Call this tool once per request.
- For a named theme, brand or look, find its themeSlug with list_data_app_themes.
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
            'Organization theme to build the chart type with: its slug, from list_data_app_themes. Omit it to use the organization default. An unknown slug returns an error and starts no build.',
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
