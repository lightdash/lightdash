import { z } from 'zod';
import {
    LegacyFollowUpTools,
    legacyFollowUpToolsTransform,
} from '../../followUpTools';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { timeSeriesMetricVizConfigSchema } from '../visualizations/timeSeriesViz';

export const TOOL_TIME_SERIES_VIZ_DESCRIPTION = `Use this tool to generate a Time Series Chart.`;

export const toolTimeSeriesArgsSchema = createToolSchema({
    description: TOOL_TIME_SERIES_VIZ_DESCRIPTION,
})
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        vizConfig: timeSeriesMetricVizConfigSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
        followUpTools: z
            .array(
                z.union([
                    z.literal(AiResultType.TABLE_RESULT),
                    z.literal(AiResultType.VERTICAL_BAR_RESULT),
                ]),
            )
            .describe(
                `The actions the User can ask for after the AI has generated the chart`,
            ),
    })
    .build();

export type ToolTimeSeriesArgs = z.infer<typeof toolTimeSeriesArgsSchema>;

export const toolTimeSeriesArgsSchemaTransformed = toolTimeSeriesArgsSchema
    .extend({
        // backwards compatibility for old viz configs
        vizConfig: timeSeriesMetricVizConfigSchema.extend({
            xAxisLabel: z.string().default(''),
            yAxisLabel: z.string().default(''),
        }),
        // backwards compatibility for old viz configs without customMetrics
        customMetrics: customMetricsSchema.default(null),
        tableCalculations: tableCalcsSchema.default(null),
        followUpTools: z.array(
            z.union([
                z.literal(AiResultType.TABLE_RESULT),
                z.literal(AiResultType.VERTICAL_BAR_RESULT),
                z.literal(LegacyFollowUpTools.GENERATE_TABLE),
                z.literal(LegacyFollowUpTools.GENERATE_BAR_VIZ),
            ]),
        ),
        filters: filtersSchemaTransformed,
    })
    .transform((data) => ({
        ...data,
        followUpTools: legacyFollowUpToolsTransform(data.followUpTools),
    }));

export type ToolTimeSeriesArgsTransformed = z.infer<
    typeof toolTimeSeriesArgsSchemaTransformed
>;

export const toolTimeSeriesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolTimeSeriesOutput = z.infer<typeof toolTimeSeriesOutputSchema>;
