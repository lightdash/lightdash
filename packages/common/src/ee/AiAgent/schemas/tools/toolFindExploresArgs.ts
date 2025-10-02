import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_FIND_EXPLORES_DESCRIPTION = `Tool: findExplores

Purpose:
Lists available Explores along with their field labels, joined tables, hints for you (Ai Hints) and descriptions.

Usage Tips:
- Use this to understand the structure of an Explore before calling findFields.
- Only a subset of fields is returned
- Results are paginated — use the next page token to retrieve additional pages.
- It's advised to look for tables first and then use the exploreName parameter to narrow results to a specific Explore.
- When using the exploreName parameter, all fields and full description are returned for that explore.
`;

export const toolFindExploresArgsSchema = createToolSchema(
    'find_explores',
    TOOL_FIND_EXPLORES_DESCRIPTION,
)
    .extend({
        exploreName: z
            .string()
            .nullable()
            .describe(
                'Name of the table to focus on. If omitted, all tables are returned. For a single table, all dimensions, metrics, and full descriptions are loaded',
            ),
    })
    .withPagination()
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
