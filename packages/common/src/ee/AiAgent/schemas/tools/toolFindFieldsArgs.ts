import { z } from 'zod';

export const toolFindFieldsArgsSchema = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    embeddingSearchQueries: z
        .array(
            z.object({
                name: z.string().describe('field_id of the field.'),
                description: z.string(),
            }),
        )
        .describe(
            `Break down user input sentence into field names and descriptions to find the most relevant fields in the explore.`,
        ),
});

export type ToolFindFieldsArgs = z.infer<typeof toolFindFieldsArgsSchema>;

export const isToolFindFieldsArgs = (
    toolArgs: unknown,
): toolArgs is ToolFindFieldsArgs =>
    toolFindFieldsArgsSchema.safeParse(toolArgs).success;
