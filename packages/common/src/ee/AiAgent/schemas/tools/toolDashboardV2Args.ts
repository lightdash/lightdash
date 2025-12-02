import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import {
    toolRunQueryArgsSchema,
    toolRunQueryArgsSchemaTransformed,
} from './toolRunQueryArgs';

export const TOOL_DASHBOARD_V2_DESCRIPTION = `

Use this tool to generate multiple visualizations for a dashboard based on a specific theme.

Instead of making multiple parallel tool calls for individual visualizations, this tool takes an array of visualization configurations and generates them all at once, ensuring thematic consistency and better performance.

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
`;

// Dashboard visualization schema - use runQuery format for each visualization
const dashboardV2VisualizationSchema = toolRunQueryArgsSchema;

export type DashboardV2Visualization = z.infer<
    typeof dashboardV2VisualizationSchema
>;

export const toolDashboardV2ArgsSchema = createToolSchema({
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
