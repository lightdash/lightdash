import { z } from 'zod';
import { type Filters } from '../../../../types/filter';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import {
    tableVizConfigSchema,
    type TableVizConfigSchemaType,
} from '../visualizations';

export const toolTableVizArgsSchema = z.object({
    type: z.literal(AiResultType.TABLE_RESULT),
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
});

export type ToolTableVizArgs = z.infer<typeof toolTableVizArgsSchema>;

export const toolTableVizArgsSchemaTransformed =
    toolTableVizArgsSchema.transform(
        (
            data,
        ): {
            type: AiResultType.TABLE_RESULT;
            vizConfig: TableVizConfigSchemaType;
            filters: Filters;
        } => ({
            ...data,
            filters: filtersSchemaTransformed.parse(data.filters),
        }),
    );

export type ToolTableVizArgsTransformed = z.infer<
    typeof toolTableVizArgsSchemaTransformed
>;
