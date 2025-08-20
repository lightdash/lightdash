import { z } from 'zod';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
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
        vizConfig: verticalBarMetricVizConfigSchema,
        filters: filtersSchema
            .optional()
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
    })
    .build();

export type ToolVerticalBarArgs = z.infer<typeof toolVerticalBarArgsSchema>;

export const toolVerticalBarArgsSchemaTransformed =
    toolVerticalBarArgsSchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolVerticalBarArgsTransformed = z.infer<
    typeof toolVerticalBarArgsSchemaTransformed
>;
