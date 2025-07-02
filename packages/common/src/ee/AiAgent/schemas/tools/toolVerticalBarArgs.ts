import { z } from 'zod';
import { type Filters } from '../../../../types/filter';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import {
    verticalBarMetricVizConfigSchema,
    type VerticalBarMetricVizConfigSchemaType,
} from '../visualizations';

export const toolVerticalBarArgsSchema = z.object({
    type: z.literal(AiResultType.VERTICAL_BAR_RESULT),
    vizConfig: verticalBarMetricVizConfigSchema,
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
            `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_BAR_VIZ} in this list.`,
        ),
});

export type ToolVerticalBarArgs = z.infer<typeof toolVerticalBarArgsSchema>;

export const isToolVerticalBarArgs = (
    config: unknown,
): config is ToolVerticalBarArgs =>
    toolVerticalBarArgsSchema.safeParse(config).success;

export const toolVerticalBarArgsSchemaTransformed =
    toolVerticalBarArgsSchema.transform(
        (
            data,
        ): {
            type: AiResultType.VERTICAL_BAR_RESULT;
            vizConfig: VerticalBarMetricVizConfigSchemaType;
            filters: Filters;
            followUpTools: FollowUpTools[];
        } => ({
            ...data,
            filters: filtersSchemaTransformed.parse(data.filters),
        }),
    );

export type ToolVerticalBarArgsTransformed = z.infer<
    typeof toolVerticalBarArgsSchemaTransformed
>;
