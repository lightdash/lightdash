import { z } from 'zod';
import { AiResultType } from '../../types';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
} from './toolRunQueryArgs';

export const TOOL_DASHBOARD_V2_DESCRIPTION = `Use this tool to generate multiple visualizations for a dashboard based on a specific theme. Instead of making multiple parallel tool calls for individual visualizations, this tool takes an array of visualization configurations and generates them all at once, ensuring thematic consistency and better performance.

This is the v2 version that supports richer chart types including pie charts, scatter plots, and funnel visualizations for more diverse data representation.

Dashboard Design Philosophy:
Create "summary" or "executive" level dashboards that provide high-level overviews of specific topics (e.g., Support Dashboard, Revenue Performance, Sales Operations). These dashboards should be designed to monitor trends and key metric performance at a glance.

Recommended Dashboard Structure:
1. **Summary Metrics at the Top**: Start with key performance indicators (KPIs) as tables showing overall summary metrics
2. **Time-Series Analysis**: Include time-series charts (line or area charts) to show how metrics trend over time
3. **Categorical Comparisons**: Use bar or horizontal bar charts to compare metrics across categories
4. **Proportional Analysis**: Use pie charts to show part-to-whole relationships (e.g., market share, revenue by segment)
5. **Correlation Analysis**: Use scatter plots to explore relationships between two metrics
6. **Conversion Flows**: Use funnel charts to visualize sequential conversion processes (e.g., sales funnel, user onboarding)
7. **Detailed Breakdowns**: Add tables with more detail and specific line items that have the biggest impact on metrics

Chart Type Selection Guide:
- 'bar': Vertical bars for categorical comparisons (e.g., sales by product)
- 'horizontal': Horizontal bars for long category names or ranking (e.g., top 10 customers)
- 'line': Time series trends (e.g., revenue over months), supports 'area' fill
- 'scatter': Correlation between two metrics (e.g., ad spend vs revenue)
- 'pie': Part-to-whole proportions (e.g., market share by segment)
- 'funnel': Sequential conversion flows (e.g., sales funnel stages)
- 'table': Raw data display with all fields

Usage tips:
- Use this when you need to create 2 or more related visualizations for a dashboard
- Ensure all visualizations follow the same theme and tell a cohesive story
- Each visualization in the array should have a clear title and description
- Mix different visualization types strategically to provide diverse insights
- Use chartConfig.groupBy to create multi-series charts (e.g., one line per region)
- For bar/horizontal charts: use stackBars to stack bars when groupBy is provided
- For line charts: use lineType 'area' to fill the area under the line
- Make use of breakdown dimensions to show more dense visualizations instead of having multiple different charts for the same metric:
    - "metric A over time, broken down by dimension B" (use groupBy for the breakdown)
    - "dimension A broken down by dimension B, with Y axis of important metric"
- If some of the visualizations fail to generate, you can still generate the dashboard with the successful visualizations and return a mes sage about the failed visualizations.
`;

// Dashboard visualization schema - use runQuery format for each visualization
const dashboardV2VisualizationSchema = toolRunQueryArgsSchema;

export type DashboardV2Visualization = z.infer<
    typeof dashboardV2VisualizationSchema
>;

export const toolDashboardV2ArgsSchema = createToolSchema({
    type: AiResultType.DASHBOARD_V2_RESULT,
    description: TOOL_DASHBOARD_V2_DESCRIPTION,
})
    .extend({
        title: z.string().describe('A descriptive title for the dashboard'),
        description: z
            .string()
            .describe(
                'A descriptive summary or explanation for the dashboard.',
            ),
        visualizations: z
            .array(dashboardV2VisualizationSchema)
            .min(2)
            .max(15)
            .describe(
                'Array of visualization configurations to generate for this dashboard. Each should contribute to the overall theme and leverage the available chart types (table, bar, horizontal, line, scatter, pie, funnel).',
            ),
    })
    .build();

export type ToolDashboardV2Args = z.infer<typeof toolDashboardV2ArgsSchema>;

export const toolDashboardV2ArgsSchemaTransformed =
    toolDashboardV2ArgsSchema.transform((data) => ({
        ...data,
        visualizations: data.visualizations.map((viz) =>
            toolRunQueryArgsSchemaTransformed.parse(viz),
        ),
    }));

export type ToolDashboardV2ArgsTransformed = z.infer<
    typeof toolDashboardV2ArgsSchemaTransformed
>;

export const toolDashboardV2OutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolDashboardV2Output = z.infer<typeof toolDashboardV2OutputSchema>;
