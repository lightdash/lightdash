import { z } from 'zod';
import {
    LegacyFollowUpTools,
    legacyFollowUpToolsTransform,
} from '../../followUpTools';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { verticalBarMetricVizConfigSchema } from '../visualizations';

export const TOOL_VERTICAL_BAR_VIZ_DESCRIPTION = `Use this tool to generate a Bar Chart Visualization.`;

export const toolVerticalBarArgsSchema = createToolSchema(
    AiResultType.VERTICAL_BAR_RESULT,
    TOOL_VERTICAL_BAR_VIZ_DESCRIPTION,
)
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        vizConfig: verticalBarMetricVizConfigSchema,
        filters: filtersSchema
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
                `The actions the User can ask for after the AI has generated the chart.`,
            ),
    })
    .build();

export type ToolVerticalBarArgs = z.infer<typeof toolVerticalBarArgsSchema>;

export const toolVerticalBarArgsSchemaTransformed = toolVerticalBarArgsSchema
    .extend({
        // backwards compatibility for old viz configs without customMetrics
        customMetrics: customMetricsSchema.default(null),
        followUpTools: z.array(
            z.union([
                z.literal(AiResultType.TABLE_RESULT),
                z.literal(AiResultType.TIME_SERIES_RESULT),
                z.literal(LegacyFollowUpTools.GENERATE_TABLE),
                z.literal(LegacyFollowUpTools.GENERATE_TIME_SERIES_VIZ),
            ]),
        ),
    })
    .transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
        followUpTools: legacyFollowUpToolsTransform(data.followUpTools),
    }));

export type ToolVerticalBarArgsTransformed = z.infer<
    typeof toolVerticalBarArgsSchemaTransformed
>;
