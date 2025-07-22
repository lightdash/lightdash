import { z } from 'zod';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import visualizationMetadataSchema from '../visualizationMetadata';
import { verticalBarMetricVizConfigSchema } from '../visualizations';

export const toolVerticalBarArgsSchema = visualizationMetadataSchema.extend({
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

export const toolVerticalBarArgsSchemaTransformed =
    toolVerticalBarArgsSchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolVerticalBarArgsTransformed = z.infer<
    typeof toolVerticalBarArgsSchemaTransformed
>;
