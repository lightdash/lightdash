import { z } from 'zod';
import assertUnreachable from '../../../../utils/assertUnreachable';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchema } from '../filters';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import {
    tableVizConfigSchema,
    verticalBarMetricVizConfigSchema,
} from '../visualizations';
import { timeSeriesMetricVizConfigSchema } from '../visualizations/timeSeriesViz';
import { toolTableVizArgsSchemaTransformed } from './toolTableVizArgs';
import { toolTimeSeriesArgsSchemaTransformed } from './toolTimeSeriesArgs';
import { toolVerticalBarArgsSchemaTransformed } from './toolVerticalBarArgs';

export const TOOL_DASHBOARD_DESCRIPTION = `Use this tool to generate multiple visualizations for a dashboard based on a specific theme. Instead of making multiple parallel tool calls for individual visualizations, this tool takes an array of visualization configurations and generates them all at once, ensuring thematic consistency and better performance.

Usage tips:
- Use this when you need to create 2 or more related visualizations for a dashboard
- Ensure all visualizations follow the same theme (e.g., "Revenue KPI", "Sales Performance")
- Each visualization in the array should have a clear title and description
- Mix different visualization types (bar charts, time series, tables – in the order of preference) for comprehensive insights
- Make use of the breakdownByDimension to show more dense visualizations instead of having multiple different charts for the same metric:
    - "metric A over time, broken down by dimension B"
    - "dimension A broken down by dimension B, with Y axis of important metric"
- If some of the visualizations fail to generate, you can still generate the dashboard with the successful visualizations and return a message about the failed visualizations.
`;

// Base visualization schema that all visualizations must have
const baseVisualizationSchema = z.object({
    ...visualizationMetadataSchema.shape,
    customMetrics: customMetricsSchema,
    filters: filtersSchema
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

export const toolDashboardArgsSchema = createToolSchema(
    AiResultType.DASHBOARD_RESULT,
    TOOL_DASHBOARD_DESCRIPTION,
)
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

export type ToolDashboardArgs = z.infer<typeof toolDashboardArgsSchema>;

export const toolDashboardArgsSchemaTransformed =
    toolDashboardArgsSchema.transform((data) => ({
        ...data,
        visualizations: data.visualizations.map((vis) => {
            switch (vis.type) {
                case AiResultType.TABLE_RESULT:
                    return toolTableVizArgsSchemaTransformed.parse(vis);
                case AiResultType.TIME_SERIES_RESULT:
                    return toolTimeSeriesArgsSchemaTransformed.parse(vis);
                case AiResultType.VERTICAL_BAR_RESULT:
                    return toolVerticalBarArgsSchemaTransformed.parse(vis);
                default:
                    return assertUnreachable(vis, 'Invalid visualization type');
            }
        }),
    }));

export type ToolDashboardArgsTransformed = z.infer<
    typeof toolDashboardArgsSchemaTransformed
>;
