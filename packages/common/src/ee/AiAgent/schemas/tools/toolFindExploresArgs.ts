import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_EXPLORES_DESCRIPTION = `Tool: findExplores

Purpose:
Lists Explore along with their joined tables, all fields, hints for you (Ai Hints) and descriptions.

Usage Tips:
- Use this to understand the structure of an Explore before calling findFields.
- All fields are returned as well as their field ids, descriptions labels and ai hints.
`;

export const toolFindExploresArgsSchema = createToolSchema(
    'find_explores',
    TOOL_FIND_EXPLORES_DESCRIPTION,
)
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;

export const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchema;

export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;

export const toolFindExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindExploresOutput = z.infer<
    typeof toolFindExploresOutputSchema
>;
