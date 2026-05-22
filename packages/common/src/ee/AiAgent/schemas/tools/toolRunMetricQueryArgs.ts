import { z } from 'zod';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import { tableVizConfigSchema } from '../visualizations/tableViz';
import {
    defineTool,
    type ToolInput,
    type ToolOutput,
    type ToolParsedInput,
} from './toolDefinition';

const getToolRunMetricQueryDescription = ({
    name,
}: {
    name: string;
}) => `Tool: ${name}

Purpose:
Run a metric query and get the results as CSV data. This is useful for data analysis and export.

Usage Tips:
- Specify the exploreName, dimensions, metrics, and any filters needed for your query
- Results are returned as CSV formatted text
- Use this when you need to analyze data or export query results
- The query respects the same limits and permissions as other visualization tools
`;

const toolRunMetricQueryArgsSchema = createToolSchema({
    description: getToolRunMetricQueryDescription({
        name: 'run_metric_query',
    }),
})
    .extend({
        vizConfig: tableVizConfigSchema,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
    })
    .build();

const toolRunMetricQueryArgsSchemaTransformed =
    toolRunMetricQueryArgsSchema.transform((data) => ({
        ...data,
        customMetrics: customMetricsSchemaTransformed.parse(
            data.customMetrics ?? [],
        ),
        filters: filtersSchemaTransformed.parse(data.filters ?? null),
    }));

const mcpToolRunMetricQueryOutputSchema = z.object({
    rows: z
        .array(z.record(z.unknown()))
        .describe('Result rows keyed by field id.'),
    fields: z
        .record(z.unknown())
        .describe(
            'Field metadata keyed by field id for interpreting the returned rows.',
        ),
    exploreUrl: z
        .string()
        .describe(
            'Shareable Lightdash URL for opening the query results in Explore.',
        ),
});

export const runMetricQueryTool = defineTool({
    canonicalName: 'runMetricQuery',
    title: 'Run Metric Query',
    contexts: ['mcp'] as const,
    buildInputSchemas: {
        mcp: () => toolRunMetricQueryArgsSchema,
    },
    outputSchema: mcpToolRunMetricQueryOutputSchema,
    parseInput: {
        mcp: (raw) => toolRunMetricQueryArgsSchemaTransformed.parse(raw),
    },
});

export type ToolRunMetricQueryArgs = ToolInput<
    typeof runMetricQueryTool,
    'mcp'
>;
export type ToolRunMetricQueryArgsTransformed = ToolParsedInput<
    typeof runMetricQueryTool,
    'mcp'
>;
export type ToolRunMetricQueryOutput = ToolOutput<typeof runMetricQueryTool>;
