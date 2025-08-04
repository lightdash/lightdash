import { z } from 'zod';

export const toolFindFieldsArgsSchema = z.object({
    type: z.literal('find_fields'),
    table: z.string().describe('The table to search in.'),
    fieldSearchQueries: z.array(
        z.object({
            label: z.string().describe('Full field label'),
        }),
    ),
    page: z
        .number()
        .positive()
        .nullable()
        .describe('Use this to paginate through the results'),
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;

export const toolFindFieldsArgsSchemaTransformed = toolFindFieldsArgsSchema;

export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
