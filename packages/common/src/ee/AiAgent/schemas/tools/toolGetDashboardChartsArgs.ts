import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const getToolGetDashboardChartsDescription = ({
    name,
    findContentName,
}: {
    name: string;
    findContentName: string;
}) => `Tool: ${name}

Purpose:
Retrieves the list of charts within a specific dashboard, with pagination support.

Usage tips:
- Use this tool after "${findContentName}" to drill into a specific dashboard's charts.
- Requires a dashboardUuid, which you can get from "${findContentName}" results. Also pass the dashboardName for display purposes.
- Results are paginated — use the page parameter to get more results if needed.
- Each chart includes its name, description, type, and view count.`;

const toolGetDashboardChartsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const getDashboardChartsTool = defineTool({
    canonicalName: 'getDashboardCharts',
    title: 'Get Dashboard Charts',
    contexts: ['agent'] as const,
    description: {
        agent: ({ name }) =>
            getToolGetDashboardChartsDescription({
                findContentName: 'findContent',
                name,
            }),
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
                .extend({
                    dashboardUuid: z
                        .string()
                        .describe(
                            'The UUID of the dashboard to get charts for. Obtained from findContent results.',
                        ),
                    dashboardName: z
                        .string()
                        .optional()
                        .describe(
                            'The name of the dashboard (for display purposes). Obtained from findContent results.',
                        ),
                })
                .withPagination()
                .build(),
    },
    outputSchema: toolGetDashboardChartsOutputSchema,
});

export type ToolGetDashboardChartsArgs = ToolInput<
    typeof getDashboardChartsTool,
    'agent'
>;
export type ToolGetDashboardChartsArgsTransformed = ToolGetDashboardChartsArgs;
export type ToolGetDashboardChartsOutput = ToolOutput<
    typeof getDashboardChartsTool
>;
