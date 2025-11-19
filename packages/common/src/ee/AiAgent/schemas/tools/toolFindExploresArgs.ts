import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_EXPLORES_DESCRIPTION = `Tool: findExplores

Purpose:
Returns an explore with all its fields, joined tables, AI hints and descriptions. When multiple explores match your search, also returns alternative explores and top 50 matching fields across ALL explores.

Parameters:
- exploreName: Name of the explore to retrieve
- searchQuery: Full user query for finding relevant explores

Output:
- Selected explore with all fields and metadata
- Alternative explores (if multiple matches) with searchRank scores
- Top matching fields with their explore names and searchRank scores
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

export const toolFindExploresArgsSchemaV3 = createToolSchema({
    type: 'find_explores',
    description: TOOL_FIND_EXPLORES_DESCRIPTION,
    version: 3,
})
    .extend({
        // TODO: check if we need to add exploreName back in for backward compatibility
        searchQuery: z
            .string()
            .describe(
                'The full user query or search terms to help find the most relevant explore. Use the complete user request for better search results.',
            ),
    })
    .build();

export const toolFindExploresArgsSchema = z.discriminatedUnion('type', [
    toolFindExploresArgsSchemaV1,
    toolFindExploresArgsSchemaV2,
    toolFindExploresArgsSchemaV3,
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
export type ToolFindExploresArgsV3 = z.infer<
    typeof toolFindExploresArgsSchemaV3
>;
export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
export type ToolFindExploresOutput = z.infer<
    typeof toolFindExploresOutputSchema
>;
