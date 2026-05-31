import { z } from 'zod';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import sortFieldSchema from '../sortField';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import {
    buildMcpQueryRunResponseDescription,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';

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
    // External LLMs frequently nest filters inside queryConfig instead of at
    // the top level. Accepting them here prevents Zod from silently stripping
    // the key. The transform in `toolRunQueryArgsSchemaTransformed` lifts
    // nested filters to the top level.
    filters: filtersSchemaV2.optional(),
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

export const TOOL_RUN_QUERY_DESCRIPTION = `Execute a metric query and create a chart artifact. Results can be viewed as table, bar, horizontal bar, line, scatter, pie, or funnel.

Configuration tips:
- Specify exploreName, dimensions, metrics, and sorts.
- dimensions[0] is the primary grouping/x-axis; extra dimensions add grouping levels.
- chartConfig selects the default visualization plus x/y fields, labels, series split, stacking, line type, and funnel input mode.
- Use groupBy only for categorical series splits. Do not group by a time dimension to simulate period comparisons.
- For year-over-year, month-over-month, previous period, or N-period comparisons, use a kind: "periodComparison" customMetric with the time dimension and base metric.
- filters can reference fields from joined tables as well as the base table.

${buildMcpQueryRunResponseDescription({
    contentDescription:
        'bare CSV text for human/LLM display and as a fallback. CSV headers are display labels, not stable field IDs.',
    completedResultShape: `    result: {
      status: "done",
      rows: Array<Record<string, unknown>>,
      fields: Record<string, unknown>,
      echartsOption: Record<string, unknown>,
      exploreUrl: string | null
    }`,
})}

Notes:
${MCP_QUERY_COMMON_NOTES}
`;

export const toolRunQueryArgsSchema = createToolSchema()
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
        customMetrics: customMetricsSchema
            .default(null)
            .pipe(customMetricsSchemaTransformed),
        tableCalculations: tableCalcsSchema.default(null),
        chartConfig: chartConfigSchema.default(null),
    })
    .transform((data) => {
        // LLMs often nest filters inside queryConfig instead of at the top
        // level. Prefer top-level filters, fall back to queryConfig.filters.
        const resolvedFilters =
            data.filters ?? data.queryConfig.filters ?? null;
        return {
            ...data,
            filters: filtersSchemaTransformed.parse(resolvedFilters),
        };
    });

export type ToolRunQueryArgsTransformed = z.infer<
    typeof toolRunQueryArgsSchemaTransformed
>;

export const toolRunQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunQueryOutput = z.infer<typeof toolRunQueryOutputSchema>;
