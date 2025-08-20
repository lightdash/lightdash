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
            'If true sorts nulls first, if false sorts nulls last, if null then sorts by warehouse default',
        )
        .optional(),
});

export default sortFieldSchema;
