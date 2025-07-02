import { z } from 'zod';
import { type Filters } from '../../../../types/filter';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import {
    timeSeriesMetricVizConfigSchema,
    type TimeSeriesMetricVizConfigSchemaType,
} from '../visualizations/timeSeriesViz';

export const toolTimeSeriesArgsSchema = z.object({
    type: z.literal(AiResultType.TIME_SERIES_RESULT),
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
});

export type ToolTimeSeriesArgs = z.infer<typeof toolTimeSeriesArgsSchema>;

export const toolTimeSeriesArgsSchemaTransformed =
    toolTimeSeriesArgsSchema.transform(
        (
            data,
        ): {
            type: AiResultType.TIME_SERIES_RESULT;
            vizConfig: TimeSeriesMetricVizConfigSchemaType;
            filters: Filters;
            followUpTools: FollowUpTools[];
        } => ({
            ...data,
            filters: filtersSchemaTransformed.parse(data.filters),
        }),
    );

export type ToolTimeSeriesArgsTransformed = z.infer<
    typeof toolTimeSeriesArgsSchemaTransformed
>;
