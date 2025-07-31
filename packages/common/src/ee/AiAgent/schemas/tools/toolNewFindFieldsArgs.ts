import { z } from 'zod';
import { fieldSearchQuerySchema } from '../fieldSearchQuery';

export const toolNewFindFieldsArgsSchema = z.object({
    type: z.literal('find_fields'),
    fieldSearchQueries: z
        .array(fieldSearchQuerySchema)
        .describe('The Fields (Metrics or Dimensions) to search for.'),
});

export type ToolNewFindFieldsArgs = z.infer<typeof toolNewFindFieldsArgsSchema>;

export const toolNewFindFieldsArgsSchemaTransformed =
    toolNewFindFieldsArgsSchema;

export type ToolNewFindFieldsArgsTransformed = ToolNewFindFieldsArgs;
