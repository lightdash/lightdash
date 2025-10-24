import { z } from 'zod';
import { AiResultType } from '../../types';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_RUN_SAVED_CHART_QUERY_DESCRIPTION = `Tool: runSavedChartQuery

Purpose:
Execute an existing saved chart by its UUID. Use this when the user asks about specific saved charts or wants to see results from charts that already exist in the project.

When to use:
- User asks about a specific saved chart (e.g., "show me the results of [chart name]")
- Need to retrieve data from an existing chart rather than creating a new one
- Want to use an existing chart's pre-configured query, filters, and visualization

Parameters:
- chartUuid: The UUID of the saved chart to execute (required)
- versionUuid: Optional specific version of the chart to run
- limit: Optional row limit to override the chart's default limit

Important:
- Use findCharts tool first to search for charts by name/description if you don't have the UUID
- This tool requires enableDataAccess to be enabled to see the actual data
- Results are returned as CSV format for analysis
`;

export const toolRunSavedChartQueryArgsSchema = createToolSchema({
    type: AiResultType.RUN_SAVED_CHART_QUERY,
    description: TOOL_RUN_SAVED_CHART_QUERY_DESCRIPTION,
})
    .extend({
        chartUuid: z
            .string()
            .uuid()
            .describe(
                'The UUID of the saved chart to execute. Use findCharts tool to discover chart UUIDs.',
            ),
        limit: z
            .number()
            .positive()
            .nullable()
            .describe(
                'Optional: maximum number of rows to return. Overrides the chart default limit if provided.',
            ),
    })
    .build();

export type ToolRunSavedChartQueryArgs = z.infer<
    typeof toolRunSavedChartQueryArgsSchema
>;

export const toolRunSavedChartQueryArgsSchemaTransformed =
    toolRunSavedChartQueryArgsSchema;

export type ToolRunSavedChartQueryArgsTransformed = ToolRunSavedChartQueryArgs;

export const toolRunSavedChartQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunSavedChartQueryOutput = z.infer<
    typeof toolRunSavedChartQueryOutputSchema
>;
