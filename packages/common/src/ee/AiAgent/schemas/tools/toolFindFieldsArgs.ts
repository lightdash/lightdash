import { z } from 'zod';

export const toolFindFieldsArgsSchema = z.object({
    type: z.literal('find_fields'),
    exploreName: z.string().describe('Name of the selected explore'),
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;

export const toolFindFieldsArgsSchemaTransformed = toolFindFieldsArgsSchema;
export type ToolFindFieldsArgsTransformed = ToolFindFieldsArgs;
