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
    buildMcpVisualizationFollowUpInstruction,
    MCP_QUERY_COMMON_NOTES,
} from './toolMcpQueryResultDescription';
import { mcpAsyncQueryUuidSchema } from './toolQueryResultSchemas';

// Query configuration schema - what data to fetch
const queryConfigBaseSchema = z.object({
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

// V1 took filters/customMetrics/tableCalculations at the top level, but LLMs
// kept nesting them (especially filters) inside queryConfig or emitting
// invalid combinations. V2 makes queryConfig the canonical (and only) place.
const queryConfigSchemaV1 = queryConfigBaseSchema.extend({
    filters: filtersSchemaV2.nullable().default(null),
});

const queryConfigSchemaV2 = queryConfigBaseSchema.extend({
    customMetrics: customMetricsSchema,
    tableCalculations: tableCalcsSchema,
    filters: filtersSchemaV2.nullable(),
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

// Kept only for parsing historical persisted tool args.
export const toolRunQueryArgsSchemaV1 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        queryConfig: queryConfigSchemaV1,
        chartConfig: chartConfigSchema.default(null),
        filters: filtersSchemaV2.nullable().default(null),
    })
    .build();

export const toolRunQueryArgsSchemaV2 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigSchemaV2,
        chartConfig: chartConfigSchema,
    })
    .build();

// V2 is the only schema the tools accept; this is the LLM contract and the
// canonical source of truth. V1 (below) is kept solely to parse already
// persisted tool args from old chats.
export const toolRunQueryArgsSchema = toolRunQueryArgsSchemaV2;

export type ToolRunQueryArgsV1 = z.infer<typeof toolRunQueryArgsSchemaV1>;
export type ToolRunQueryArgsV2 = z.infer<typeof toolRunQueryArgsSchemaV2>;
export type ToolRunQueryArgs = ToolRunQueryArgsV2;

// Converts the raw V2 args into the internal domain shape: customMetrics and
// filters become Lightdash domain types. Piped (not transformed inline) so a
// malformed persisted value surfaces as a ZodError instead of a thrown
// exception out of safeParse.
const runQueryInternalSchema = z.object({
    ...visualizationMetadataSchema.shape,
    queryConfig: queryConfigBaseSchema.extend({
        customMetrics: customMetricsSchemaTransformed,
        tableCalculations: tableCalcsSchema,
        filters: filtersSchemaTransformed,
    }),
    chartConfig: chartConfigSchema.default(null),
});

export const toolRunQueryArgsSchemaTransformed = toolRunQueryArgsSchemaV2.pipe(
    runQueryInternalSchema,
);

export type ToolRunQueryArgsTransformed = z.infer<
    typeof toolRunQueryArgsSchemaTransformed
>;

// --- Backward compatibility -------------------------------------------------
// Only for parsing tool args persisted before V2. V1 put filters,
// customMetrics and tableCalculations at the top level; V2 forbids them and
// nests them inside queryConfig.

export const isRunQueryArgsV1 = (
    args: ToolRunQueryArgsV1 | ToolRunQueryArgsV2,
): args is ToolRunQueryArgsV1 =>
    'customMetrics' in args || 'tableCalculations' in args || 'filters' in args;

export const migrateRunQueryArgsV1ToV2 = (
    v1: ToolRunQueryArgsV1,
): ToolRunQueryArgsV2 => ({
    title: v1.title,
    description: v1.description,
    chartConfig: v1.chartConfig,
    queryConfig: {
        exploreName: v1.queryConfig.exploreName,
        dimensions: v1.queryConfig.dimensions,
        metrics: v1.queryConfig.metrics,
        sorts: v1.queryConfig.sorts,
        limit: v1.queryConfig.limit,
        customMetrics: v1.customMetrics,
        tableCalculations: v1.tableCalculations,
        // V1 accepted filters at the top level and (loosely) nested in
        // queryConfig; top level wins, matching the original behavior.
        filters: v1.filters ?? v1.queryConfig.filters ?? null,
    },
});

// Single entry point for re-parsing a persisted artifact of either version.
export const parsePersistedRunQueryArgs = (
    raw: unknown,
): ToolRunQueryArgsTransformed | null => {
    const v2 = toolRunQueryArgsSchemaTransformed.safeParse(raw);
    if (v2.success) return v2.data;

    const v1 = toolRunQueryArgsSchemaV1.safeParse(raw);
    return v1.success
        ? toolRunQueryArgsSchemaTransformed.parse(
              migrateRunQueryArgsV1ToV2(v1.data),
          )
        : null;
};

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
    metadata: baseOutputMetadataSchema.extend({
        chartImageUrl: z.string().nullish(),
    }),
});

export type ToolRunQueryOutput = z.infer<typeof toolRunQueryOutputSchema>;
