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
import { toolChartAsCodeMetricQuerySchema } from './toolCreateContentArgs';
import {
    buildMcpQueryRunResponseDescription,
    buildMcpVisualizationFollowUpInstruction,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

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

export const TOOL_RUN_QUERY_DESCRIPTION = `Execute a metric query.

This tool returns metric query data only. ${buildMcpVisualizationFollowUpInstruction(
    'run_metric_query',
)}

${buildMcpQueryRunResponseDescription({
    contentDescription:
        'bare CSV text. CSV headers are display labels, not stable field IDs',
    completedResultShape: `    result: {
      status: "done",
      queryUuid: string,
      rows: Array<Record<string, unknown>>,
      fields: Record<string, unknown>,
      exploreUrl: string | null
    }`,
})}

Notes:
${MCP_QUERY_COMMON_NOTES}
`;

export const TOOL_GENERATE_VISUALIZATION_DESCRIPTION = `Build and run a chart-as-code visualization.

Use this for ad hoc chart artifacts. Provide a chart-as-code metricQuery plus runtime chartConfig. The server validates the normalized chart JSON against chart-as-code-1.0 and returns repairable validation errors.

For table formatting, use canonical chart-as-code only: chartConfig.config.columns for column display options and chartConfig.config.conditionalFormattings for conditional formatting rules. Do not put columns or conditionalFormattings at chartConfig root. Do not use dataBarColor.

This returns CSV data for the query and creates/updates the chart artifact shown to the user.
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

export const TOOL_RENDER_CHART_DESCRIPTION = `Render a chart for a completed query result in MCP App-capable clients.

Use this after a query tool or get_query_result returns done and the user wants a visual chart. This tool does not start, poll, or rerun the query. If the query is still running, call get_query_result first. Pass the queryUuid and chart configuration; Lightdash loads the completed metric query from query history.

Current support: completed run_metric_query results. SQL Runner/run_sql results are not supported by render_chart. Other query result types are rejected until their chart rendering path is implemented.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: string }] — short render status message.
- structuredContent: {
    result: {
      status: "done",
      queryUuid: string,
      exploreUrl: string | null,
      echartsOption: Record<string, unknown> | null // lightweight placeholder; full chart payload is app metadata
    }
  }`;

export const toolRenderChartArgsSchema = createToolSchema()
    .extend({
        queryUuid: mcpAsyncQueryUuidSchema.describe(
            'Completed query UUID returned by a query tool or get_query_result. Currently, render_chart supports UUIDs from run_metric_query and does not support SQL Runner/run_sql UUIDs.',
        ),
        chartConfig: chartConfigSchema,
        title: z
            .string()
            .optional()
            .describe('Optional chart title used in the rendered chart.'),
        description: z
            .string()
            .optional()
            .describe(
                'Optional chart description used in the saved Explore URL.',
            ),
    })
    .build()
    .describe('Render chart input for a completed query.');

export const toolRenderChartArgsSchemaTransformed = toolRenderChartArgsSchema
    .extend({
        chartConfig: chartConfigSchema.default(null),
    })
    .transform((data) => ({
        ...data,
        title: data.title ?? 'Metric query result',
        description: data.description ?? '',
    }));

export type ToolRenderChartArgs = z.infer<typeof toolRenderChartArgsSchema>;

export type ToolRenderChartArgsTransformed = z.infer<
    typeof toolRenderChartArgsSchemaTransformed
>;

export const toolRunQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunQueryOutput = z.infer<typeof toolRunQueryOutputSchema>;

const generateVisualizationChartConfigSchema = z
    .object({
        type: z
            .string()
            .describe(
                'Runtime chart-as-code chartConfig.type. Must match chart-as-code-1.0.json.',
            ),
    })
    .passthrough()
    .describe(
        'Runtime chart-as-code chartConfig object. Use canonical chart-as-code shape exactly. For tables, put table options under chartConfig.config, e.g. { type: "table", config: { columns: { fieldId: { displayStyle: "bar", color: "#4CAF50" } }, conditionalFormattings: [{ target: { fieldId }, color: "#1B5E20", rules: [{ id, operator, values }], applyTo: "cell" }] } }. Do not put columns or conditionalFormattings at chartConfig root. Do not use dataBarColor.',
    );

const generateVisualizationPivotConfigSchema = z
    .object({
        columns: z.array(z.string()),
    })
    .nullable()
    .describe('Top-level chart-as-code pivotConfig, or null.');

const generateVisualizationTableConfigSchema = z
    .object({
        columnOrder: z.array(z.string()),
    })
    .nullable()
    .describe('Top-level chart-as-code tableConfig, or null.');

export const toolGenerateVisualizationArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        tableName: z
            .string()
            .min(1)
            .describe('Explore/table name this chart queries from.'),
        metricQuery: toolChartAsCodeMetricQuerySchema,
        chartConfig: generateVisualizationChartConfigSchema,
        pivotConfig: generateVisualizationPivotConfigSchema,
        tableConfig: generateVisualizationTableConfigSchema,
    })
    .build();

export const toolGenerateVisualizationArgsSchemaTransformed =
    toolGenerateVisualizationArgsSchema.transform((data) => ({
        ...data,
        pivotConfig: data.pivotConfig ?? undefined,
        tableConfig: data.tableConfig ?? undefined,
    }));

export type ToolGenerateVisualizationArgs = z.infer<
    typeof toolGenerateVisualizationArgsSchema
>;

export type ToolGenerateVisualizationArgsTransformed = z.infer<
    typeof toolGenerateVisualizationArgsSchemaTransformed
>;
