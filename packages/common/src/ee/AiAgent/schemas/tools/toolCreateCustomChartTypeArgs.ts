import { z } from 'zod';
import {
    DATA_APP_THEME_SLUG_DESCRIPTION,
    MCP_DATA_APP_AGENT_SCOPE_GUIDANCE,
} from './toolGenerateDataAppArgs';

export const MCP_TOOL_CREATE_CUSTOM_CHART_TYPE_DESCRIPTION = `Tool: create_custom_chart_type

Start building a custom chart type: a reusable visualization that saved charts in this project can render with. Use it when the built-in chart types cannot draw what the user wants; for a whole interactive app, use generate_data_app.

- Describe the data the chart type expects by role (a date, a category, a value), not by one query's field names.
- The build takes a few minutes. Poll get_data_app_build_status with appSlug set to the returned slug until it is "ready", "error" or "cancelled", then send the user to Chart Studio. Call this tool once per request.
- Refer to the chart type by the returned slug: a name already taken gets a numeric suffix.
${MCP_DATA_APP_AGENT_SCOPE_GUIDANCE}
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
            'Self-contained brief for the coding agent: what the visualization draws, how it encodes the data and how it behaves. The agent does not see this conversation.',
        ),
    themeSlug: z
        .string()
        .nullish()
        .default(null)
        .describe(DATA_APP_THEME_SLUG_DESCRIPTION),
});

export type McpCreateCustomChartTypeArgs = z.infer<
    typeof mcpCreateCustomChartTypeArgsSchema
>;
