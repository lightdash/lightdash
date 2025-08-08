import { z } from 'zod';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { tableVizConfigSchema } from '../visualizations';

export const TOOL_TABLE_VIZ_DESCRIPTION = `Use this tool to query data to display in a table or summarized if limit is set to 1.`;

export const toolTableVizArgsSchema = createToolSchema(
    AiResultType.TABLE_RESULT,
    TOOL_TABLE_VIZ_DESCRIPTION,
)
    .extend({
        ...visualizationMetadataSchema.shape,
        vizConfig: tableVizConfigSchema,
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
                'The actions the User can ask for after the AI has generated the table.',
            ),
    })
    .build();

export type ToolTableVizArgs = z.infer<typeof toolTableVizArgsSchema>;

export const toolTableVizArgsSchemaTransformed =
    toolTableVizArgsSchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolTableVizArgsTransformed = z.infer<
    typeof toolTableVizArgsSchemaTransformed
>;
