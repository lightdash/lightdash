import { z } from 'zod';

export const toolFindFieldsArgsSchema = z.object({
    type: z.literal('find_fields'),
    fieldSearchQueries: z.array(
        z.object({
            label: z.string().describe('Full field label'),
        }),
    ),
    page: z
        .number()
        .nullable()
        .describe(
            'Use this to paginate through the results. Starts at 1 and increments by 1.',
        ),
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;

export const toolFindFieldsArgsSchemaTransformed = toolFindFieldsArgsSchema;

export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
