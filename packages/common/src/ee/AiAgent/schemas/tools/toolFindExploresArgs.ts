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

export const toolFindExploresArgsSchemaV1 = createToolSchema({
    type: 'find_explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
})
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe('Name of the explore that you have access to'),
    })
    .withPagination()
    .build();

export const toolFindExploresArgsSchemaV2 = createToolSchema({
    type: 'find_explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
    version: 2,
})
    .extend({
        exploreName: z
            .string()
            .describe('Name of the explore that you have access to'),
    })
    .build();

export const toolFindExploresArgsSchema = z.discriminatedUnion('type', [
    toolFindExploresArgsSchemaV1,
    toolFindExploresArgsSchemaV2,
]);

export const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchema;

export const toolFindExploresOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolFindExploresArgsV1 = z.infer<
    typeof toolFindExploresArgsSchemaV1
>;
export type ToolFindExploresArgsV2 = z.infer<
    typeof toolFindExploresArgsSchemaV2
>;
export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
export type ToolFindExploresOutput = z.infer<
    typeof toolFindExploresOutputSchema
>;
