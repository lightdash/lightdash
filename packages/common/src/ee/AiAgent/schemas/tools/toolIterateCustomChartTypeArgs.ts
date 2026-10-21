import { z } from 'zod';
import { MCP_CUSTOM_CHART_TYPE_AGENT_SCOPE_GUIDANCE } from './toolCreateCustomChartTypeArgs';

export const MCP_TOOL_ITERATE_CUSTOM_CHART_TYPE_DESCRIPTION = `Tool: iterate_custom_chart_type

Start a build that adds a version to an existing custom chart type from a follow-up brief. For a new chart type use create_custom_chart_type; for a data app use iterate_data_app, if available.

- Describe the change, not the whole chart type. The build keeps the chart type's inputs, so charts that already use it keep working. Pass queryUuid to share the first rows of a completed run_metric_query as sample data. Pass themeSlug only to switch the theme.
- Poll get_data_app_build_status with appSlug set to the slug until it is "ready", "error" or "cancelled". If a version is already building, wait for it to end before calling again.
${MCP_CUSTOM_CHART_TYPE_AGENT_SCOPE_GUIDANCE}
`;

export const mcpIterateCustomChartTypeArgsSchema = z.object({
    slug: z
        .string()
        .describe(
            'Slug of the custom chart type to change, from an earlier create_custom_chart_type result or its Chart Studio URL.',
        ),
    prompt: z
        .string()
        .describe(
            "Self-contained brief of the change for the coding agent, which works from the chart type's current source. The agent does not see this conversation, only the sample rows from queryUuid if given.",
        ),
    queryUuid: z
        .string()
        .uuid()
        .nullish()
        .default(null)
        .describe(
            'Optional uuid of a completed run_metric_query whose first rows are shared with the build as sample data. It does not bind the chart type to that query.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(
            'Organization theme to rebuild the chart type with: its slug, from list_data_app_themes. Omit it to keep the current theme. An unknown slug returns an error and starts no build.',
        ),
});

export type McpIterateCustomChartTypeArgs = z.infer<
    typeof mcpIterateCustomChartTypeArgsSchema
>;
