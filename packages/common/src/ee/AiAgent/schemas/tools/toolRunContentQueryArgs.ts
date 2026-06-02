import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolChartAsCodeMetricQuerySchema } from './toolCreateContentArgs';

export const TOOL_RUN_CONTENT_QUERY_DESCRIPTION = `Run a chart-as-code metric query or saved chart content and return the rows it produces as CSV.

Use this to verify generated or edited chart content before presenting it as complete.

Input modes:
- metricQuery: run an unsaved chart-as-code metricQuery with a tableName.
- chart: run a saved chart by chartSlug.
- dashboardChart: run a saved chart by chartSlug in a dashboardSlug context, applying dashboard filters.`;

export const toolRunContentQueryArgsSchema = createToolSchema()
    .extend({
        source: z.discriminatedUnion('type', [
            z.object({
                type: z.literal('metricQuery'),
                tableName: z
                    .string()
                    .describe('The chart-as-code tableName/explore name.'),
                metricQuery: toolChartAsCodeMetricQuerySchema,
                parameters: z
                    .unknown()
                    .nullable()
                    .describe('Optional chart parameter values, or null.'),
            }),
            z.object({
                type: z.literal('chart'),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                limit: z
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
            z.object({
                type: z.literal('dashboardChart'),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                dashboardSlug: z
                    .string()
                    .describe('Slug of the dashboard containing the chart.'),
                limit: z
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
        ]),
    })
    .build();

export type ToolRunContentQueryArgs = z.infer<
    typeof toolRunContentQueryArgsSchema
>;

export const toolRunContentQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunContentQueryOutput = z.infer<
    typeof toolRunContentQueryOutputSchema
>;
