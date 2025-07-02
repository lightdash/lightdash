import { z } from 'zod';
import fieldIdSchema from './fieldId';

const sortFieldSchema = z.object({
    fieldId: fieldIdSchema.describe(
        '"fieldId" must come from the selected Metrics or Dimensions; otherwise, it will throw an error.',
    ),
    descending: z
        .boolean()
        .describe(
            'If true sorts in descending order, if false sorts in ascending order',
        ),
});

export default sortFieldSchema;
