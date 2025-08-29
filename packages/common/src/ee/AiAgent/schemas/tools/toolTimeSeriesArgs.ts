import { z } from 'zod';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { timeSeriesMetricVizConfigSchema } from '../visualizations/timeSeriesViz';

export const TOOL_TIME_SERIES_VIZ_DESCRIPTION = `Use this tool to generate a Time Series Chart.`;

export const toolTimeSeriesArgsSchema = createToolSchema(
    AiResultType.TIME_SERIES_RESULT,
    TOOL_TIME_SERIES_VIZ_DESCRIPTION,
)
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: customMetricsSchema,
        vizConfig: timeSeriesMetricVizConfigSchema,
        filters: filtersSchema
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore.',
            ),
        followUpTools: z
            .array(
                z.union([
                    z.literal(FollowUpTools.GENERATE_BAR_VIZ),
                    z.literal(FollowUpTools.GENERATE_TIME_SERIES_VIZ),
                ]),
            )
            .describe(
                `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_TIME_SERIES_VIZ} in this list.`,
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
    })
    .transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolTimeSeriesArgsTransformed = z.infer<
    typeof toolTimeSeriesArgsSchemaTransformed
>;
