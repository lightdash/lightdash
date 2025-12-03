import { z } from 'zod';
import { customMetricsSchema } from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import sortFieldSchema from '../sortField';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';

// Query configuration schema - what data to fetch
const queryConfigSchema = z.object({
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for the chart.',
        ),
    dimensions: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'The field ids for the dimensions to group the metrics by. dimensions[0] is the primary grouping (x-axis for charts). dimensions[1+] create additional grouping levels.',
        ),
    metrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .describe(
            'The field ids of the metrics to be calculated. They will be grouped by the dimensions.',
        ),
    sorts: z
        .array(sortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
    limit: z
        .number()
        .nullable()
        .describe(
            'The total number of data points / rows allowed on the chart.',
        ),
});

// Chart-specific configuration for rendering hints
const chartConfigSchema = z
    .object({
        defaultVizType: z
            .enum([
                'table',
                'bar',
                'horizontal',
                'line',
                'scatter',
                'pie',
                'funnel',
            ])
            .describe('The default visualization type to render'),

        // Axis field selection
        xAxisDimension: z
            .string()
            .nullable()
            .describe(
                'The dimension field ID to use for the x-axis. Must be included in queryConfig.dimensions',
            ),
        yAxisMetrics: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .nullable()
            .describe(
                'The metric field IDs to display on the y-axis. Must be included in queryConfig.metrics or come from tableCalculations',
            ),

        // Series creation control
        groupBy: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .nullable()
            .describe(
                'Dimensions to split metrics into separate series (e.g., one line per region, one bar per status). IMPORTANT: Do NOT include the x-axis dimension in groupBy - only include dimensions you want to use for breaking down the data into multiple series. Example: dimensions=["order_date", "status"], groupBy=["status"] creates separate series for each status value. Leave null for simple single-series charts.',
            ),

        // Bar and horizontal bar chart specific
        xAxisType: z
            .enum(['category', 'time'])
            .nullable()
            .describe(
                'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp. Applies to bar, horizontal, and scatter charts.',
            ),
        stackBars: z
            .boolean()
            .nullable()
            .describe(
                'If groupBy is provided then this will stack the bars on top of each other instead of side by side. Applies to bar and horizontal charts.',
            ),

        // Line chart specific
        lineType: z
            .enum(['line', 'area'])
            .nullable()
            .describe(
                'default line. The type of line to display. If area then the area under the line will be filled in.',
            ),

        // Funnel chart specific
        funnelDataInput: z
            .enum(['row', 'column'])
            .nullable()
            .describe(
                'How to interpret funnel data. Use "row" when each row represents a funnel stage (most common). Use "column" when comparing multiple funnels side-by-side.',
            ),

        // Common display properties
        xAxisLabel: z
            .string()
            .describe('A helpful label to explain the x-axis'),
        yAxisLabel: z
            .string()
            .describe('A helpful label to explain the y-axis'),
        secondaryYAxisMetric: z
            .string()
            .nullable()
            .describe(
                '(Optional) A single metric field ID to display on a secondary (right) y-axis. Must NOT be included in yAxisMetrics. Use when one metric has a very different scale than others (e.g., percentage vs count).',
            ),
        secondaryYAxisLabel: z
            .string()
            .nullable()
            .describe('A helpful label for the secondary y-axis'),
    })
    .nullable();

export const TOOL_RUN_QUERY_DESCRIPTION = `Tool: runQuery

Purpose:
Execute a metric query and create a chart artifact. The results can be viewed as a table, bar, horizontal bar, line, scatter, pie, or funnel chart.
You define the default visualization type to render but users can switch between visualization types after creation.

Chart Type Selection Guide:
- 'bar': Vertical bars for categorical comparisons (e.g., sales by product)
- 'horizontal': Horizontal bars for long category names or ranking (e.g., top 10 customers)
- 'line': Time series trends (e.g., revenue over months)
- 'scatter': Correlation between two metrics (e.g., ad spend vs revenue)
- 'pie': Part-to-whole proportions (e.g., market share by segment)
- 'funnel': Sequential conversion flows (e.g., sales funnel stages)
- 'table': Raw data display with all fields

Configuration Tips:
- Specify exploreName, dimensions (for grouping/x-axis), and metrics (for y-axis values)
- First dimension is the x-axis; additional dimensions can be used for series breakdown via groupBy
- At least one metric is required for all chart types except table
- chartConfig.xAxisDimension: Select the primary dimension from queryConfig.dimensions (typically dimensions[0])
- chartConfig.yAxisMetrics: Select the metrics to display from queryConfig.metrics or tableCalculations
- chartConfig.groupBy: Use to split data into multiple series (e.g., one line per region). Do NOT include the x-axis dimension. Only include dimensions for series breakdown. Leave null for simple single-series charts.
- For bar/horizontal charts: use xAxisType 'category' for strings or 'time' for dates/timestamps
- For bar/horizontal charts: stackBars (when groupBy is provided) stacks bars instead of placing them side by side
- For line charts: use lineType 'area' to fill the area under the line
- For scatter charts: each point represents one row of data
- For funnel charts: set funnelDataInput to 'row' (each row = stage) or 'column' (multiple funnels)
- Users can switch between visualization types in the UI after creation
- xAxisLabel and yAxisLabel provide helpful context for chart axes
- filters can contain filters on fields from joined tables as well as the base table
`;

export const toolRunQueryArgsSchema = createToolSchema({
    description: TOOL_RUN_QUERY_DESCRIPTION,
})
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        queryConfig: queryConfigSchema,
        chartConfig: chartConfigSchema,
        filters: filtersSchemaV2.nullable(),
    })
    .build();

export type ToolRunQueryArgs = z.infer<typeof toolRunQueryArgsSchema>;

export const toolRunQueryArgsSchemaTransformed = toolRunQueryArgsSchema
    .extend({
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        chartConfig: chartConfigSchema.default(null),
    })
    .transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolRunQueryArgsTransformed = z.infer<
    typeof toolRunQueryArgsSchemaTransformed
>;

export const toolRunQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunQueryOutput = z.infer<typeof toolRunQueryOutputSchema>;
