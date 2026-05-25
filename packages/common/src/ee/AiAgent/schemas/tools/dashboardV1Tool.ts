import { z } from 'zod';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { defineTool, type ToolDefinition } from '../defineTool';
import { filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import {
    tableVizConfigSchema,
    verticalBarMetricVizConfigSchema,
} from '../visualizations';
import { timeSeriesMetricVizConfigSchema } from '../visualizations/timeSeriesViz';

// Base visualization schema that all visualizations must have
const baseVisualizationSchema = z.object({
    ...visualizationMetadataSchema.shape,
    customMetrics: customMetricsSchema,
    tableCalculations: tableCalcsSchema,
    filters: filtersSchemaV2
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
        ),
});

const dashboardTableVisualizationSchema = baseVisualizationSchema.extend({
    type: z.literal(AiResultType.TABLE_RESULT),
    vizConfig: tableVizConfigSchema,
});

const dashboardTimeSeriesVisualizationSchema = baseVisualizationSchema.extend({
    type: z.literal(AiResultType.TIME_SERIES_RESULT),
    vizConfig: timeSeriesMetricVizConfigSchema,
});

const dashboardBarVisualizationSchema = baseVisualizationSchema.extend({
    type: z.literal(AiResultType.VERTICAL_BAR_RESULT),
    vizConfig: verticalBarMetricVizConfigSchema,
});

const dashboardVisualizationSchema = z
    .union([
        dashboardTableVisualizationSchema,
        dashboardTimeSeriesVisualizationSchema,
        dashboardBarVisualizationSchema,
    ])
    // we don't need followUpTools for dashboard charts but for schema compat reasons we add it here
    .transform((viz) => ({ ...viz, followUpTools: [] }));

export type DashboardVisualization = z.infer<
    typeof dashboardVisualizationSchema
>;

const toolDashboardArgsSchema = createToolSchema()
    .extend({
        title: z.string().describe('A descriptive title for the dashboard'),
        description: z
            .string()
            .describe(
                'A descriptive summary or explanation for the dashboard.',
            ),
        visualizations: z
            .array(dashboardVisualizationSchema)
            .min(2)
            .max(15)
            .describe(
                'Array of visualization configurations to generate for this dashboard. Each should contribute to the overall theme.',
            ),
    })
    .build();

const toolDashboardOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

/**
 * @deprecated v1 dashboard tool, superseded by `generateDashboard` (the
 * runQuery-based schema). Kept to type and parse historical tool calls.
 */
// Explicit annotation: the v1 input schema is an inline union+transform over
// three full viz configs, large enough that inferring the ToolDefinition
// return type overflows the TS declaration serializer (TS7056). Naming the
// type lets TS emit a reference instead of re-serializing the inferred type.
export const dashboardV1Tool: ToolDefinition<
    'generateDashboard',
    typeof toolDashboardArgsSchema,
    'agent',
    typeof toolDashboardOutputSchema,
    typeof toolDashboardArgsSchema
> = defineTool({
    name: 'generateDashboard',
    title: 'Generate Dashboard',
    description: `Use this tool to generate multiple visualizations for a dashboard based on a specific theme. Instead of making multiple parallel tool calls for individual visualizations, this tool takes an array of visualization configurations and generates them all at once, ensuring thematic consistency and better performance.

Dashboard Design Philosophy:
Create "summary" or "executive" level dashboards that provide high-level overviews of specific topics (e.g., Support Dashboard, Revenue Performance, Sales Operations). These dashboards should be designed to monitor trends and key metric performance at a glance.

Recommended Dashboard Structure:
1. **Summary Metrics at the Top**: Start with key performance indicators (KPIs) as tables showing overall summary metrics
2. **Time-Series Analysis**: Include time-series charts with appropriate granularities to show how metrics trend over time:
   - Use line charts for smaller granularities (daily, weekly)
   - Use bar charts for more grouped data (monthly, quarterly)
3. **Detailed Breakdowns**: Add tables with more detail and specific line items that have the biggest impact on metrics
   - Show problematic areas that need attention (e.g., longest response times, highest churn segments)
   - Highlight actionable insights and outliers

Usage tips:
- Use this when you need to create 2 or more related visualizations for a dashboard
- Ensure all visualizations follow the same theme and tell a cohesive story
- Each visualization in the array should have a clear title and description
- Mix different visualization types strategically: tables for KPIs → time-series for trends → tables for detailed breakdowns
- Make use of the breakdownByDimension to show more dense visualizations instead of having multiple different charts for the same metric:
    - "metric A over time, broken down by dimension B"
    - "dimension A broken down by dimension B, with Y axis of important metric"
- If some of the visualizations fail to generate, you can still generate the dashboard with the successful visualizations and return a message about the failed visualizations.
`,
    availability: 'agent',
    inputSchema: toolDashboardArgsSchema,
    agent: { outputSchema: toolDashboardOutputSchema },
});
