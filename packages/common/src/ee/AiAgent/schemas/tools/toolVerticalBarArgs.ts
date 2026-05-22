import { z } from 'zod';
import {
    LegacyFollowUpTools,
    legacyFollowUpToolsTransform,
} from '../../followUpTools';
import { AiResultType } from '../../types';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
} from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { verticalBarMetricVizConfigSchema } from '../visualizations/verticalBarViz';
import {
    defineTool,
    type ToolInput,
    type ToolOutput,
    type ToolParsedInput,
} from './toolDefinition';

export const TOOL_VERTICAL_BAR_VIZ_DESCRIPTION = `Use this tool to generate a Bar Chart Visualization.`;

const toolVerticalBarArgsSchema = createToolSchema({
    description: TOOL_VERTICAL_BAR_VIZ_DESCRIPTION,
})
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        vizConfig: verticalBarMetricVizConfigSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
        followUpTools: z
            .array(
                z.union([
                    z.literal(AiResultType.TABLE_RESULT),
                    z.literal(AiResultType.TIME_SERIES_RESULT),
                ]),
            )
            .describe(
                `The actions the User can ask for after the AI has generated the chart`,
            ),
    })
    .build();

export const toolVerticalBarArgsSchemaTransformed = toolVerticalBarArgsSchema
    .extend({
        // backwards compatibility for old viz configs without customMetrics
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        followUpTools: z.array(
            z.union([
                z.literal(AiResultType.TABLE_RESULT),
                z.literal(AiResultType.TIME_SERIES_RESULT),
                z.literal(LegacyFollowUpTools.GENERATE_TABLE),
                z.literal(LegacyFollowUpTools.GENERATE_TIME_SERIES_VIZ),
            ]),
        ),
        filters: filtersSchemaTransformed,
    })
    .transform((data) => ({
        ...data,
        customMetrics: customMetricsSchemaTransformed.parse(data.customMetrics),
        followUpTools: legacyFollowUpToolsTransform(data.followUpTools),
    }));

const toolVerticalBarOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const generateBarVizConfigTool = defineTool({
    canonicalName: 'generateBarVizConfig',
    title: 'Generate Bar Visualization Config',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolVerticalBarArgsSchema,
    },
    outputSchema: toolVerticalBarOutputSchema,
    parseInput: {
        agent: (raw) => toolVerticalBarArgsSchemaTransformed.parse(raw),
    },
});

export type ToolVerticalBarArgs = ToolInput<
    typeof generateBarVizConfigTool,
    'agent'
>;
export type ToolVerticalBarArgsTransformed = ToolParsedInput<
    typeof generateBarVizConfigTool,
    'agent'
>;
export type ToolVerticalBarOutput = ToolOutput<typeof generateBarVizConfigTool>;
