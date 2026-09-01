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
        .preprocess(
            (value) => (value === null ? undefined : value),
            z.boolean().optional(),
        )
        .describe(
            'If true sorts nulls first, if false sorts nulls last, otherwise sorts by warehouse default',
        ),
});

export type ToolSortField = z.infer<typeof sortFieldSchema>;

export default sortFieldSchema;
