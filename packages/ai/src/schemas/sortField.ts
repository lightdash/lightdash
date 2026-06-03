import { z } from 'zod';
import { getFieldIdSchema } from './fieldId';

const sortFieldSchema = z.object({
    fieldId: getFieldIdSchema({ additionalDescription: null }),
    descending: z
        .boolean()
        .describe(
            'If true sorts in descending order, if false sorts in ascending order',
        ),
    nullsFirst: z
        .boolean()
        .describe(
            'If true sorts nulls first, if false sorts nulls last, otherwise sorts by warehouse default',
        )
        .nullable(),
});

export type ToolSortField = z.infer<typeof sortFieldSchema>;

export default sortFieldSchema;
