import { z } from 'zod';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
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
            .enum(['table', 'bar', 'line'])
            .describe('The default visualization type to render'),

        // Series creation control
        pivot: z
            .boolean()
            .nullable()
            .describe(
                'Controls how multiple dimensions are rendered in charts. Set to true to create one series per value in dimensions[1] (e.g., "show revenue by month, split by region"). Set to false or omit for simple grouping. Only applies when you have 2+ dimensions.',
            ),

        // Bar chart specific
        xAxisType: z
            .enum(['category', 'time'])
            .nullable()
            .describe(
                'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp.',
            ),
        stackBars: z
            .boolean()
            .nullable()
            .describe(
                'If using pivot then this will stack the bars on top of each other instead of side by side.',
            ),

        // Line chart specific
        lineType: z
            .enum(['line', 'area'])
            .nullable()
            .describe(
                'default line. The type of line to display. If area then the area under the line will be filled in.',
            ),

        // Common display properties
        xAxisLabel: z
            .string()
            .nullable()
            .describe('A helpful label to explain the x-axis'),
        yAxisLabel: z
            .string()
            .nullable()
            .describe('A helpful label to explain the y-axis'),
    })
    .nullable();

export const TOOL_RUN_QUERY_DESCRIPTION = `Tool: runQuery

Purpose:
Execute a metric query and create a chart artifact. The results can be viewed as a table, bar chart, or line chart.

Usage Tips:
- Specify exploreName, dimensions (for grouping/x-axis), and metrics (for y-axis values)
- dimensions[0] is the primary grouping (x-axis for charts)
- dimensions[1+] create additional grouping levels
- At least one metric is required for bar and line charts
- Set chartConfig.pivot to true to create one series per value in dimensions[1] (only when 2+ dimensions)
- Set defaultVizType to 'bar' for categorical comparisons, 'line' for time series, or 'table' for raw data
- For bar charts: use xAxisType 'category' for strings or 'time' for dates/timestamps
- For line charts: use lineType 'area' to fill the area under the line
- stackBars (for pivoted bar charts) stacks bars instead of placing them side by side
- Users can switch between visualization types in the UI after creation
- xAxisLabel and yAxisLabel provide helpful context for chart axes
`;

export const toolRunQueryArgsSchema = createToolSchema(
    AiResultType.QUERY_RESULT,
    TOOL_RUN_QUERY_DESCRIPTION,
)
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchema,
        chartConfig: chartConfigSchema,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        filters: filtersSchema.nullable(),
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
