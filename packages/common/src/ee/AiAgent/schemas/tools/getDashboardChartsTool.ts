import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const toolGetDashboardChartsArgsSchema = createToolSchema()
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
    .build();

const toolGetDashboardChartsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const getDashboardChartsTool = defineTool({
    name: 'getDashboardCharts',
    title: 'Get Dashboard Charts',
    description: (name) => `Tool: "${name}"
Purpose:
Retrieves the list of charts within a specific dashboard, with pagination support.

Usage tips:
- Use this tool after "findContent" to drill into a specific dashboard's charts.
- Requires a dashboardUuid, which you can get from "findContent" results. Also pass the dashboardName for display purposes.
- Results are paginated — use the page parameter to get more results if needed.
- Each chart includes its name, description, type, and view count.`,
    availability: 'agent',
    inputSchema: toolGetDashboardChartsArgsSchema,
    agent: { outputSchema: toolGetDashboardChartsOutputSchema },
});
