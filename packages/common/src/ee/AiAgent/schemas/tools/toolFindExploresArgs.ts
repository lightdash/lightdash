import { z } from 'zod';

export const toolFindExploresArgsSchema = z.object({
    type: z.literal('find_explores'),
    exploreName: z
        .string()
        .nullable()
        .describe(
            'Name of the table to focus on. If omitted, all tables are returned. For a single table, all dimensions, metrics, and full descriptions are loaded',
        ),
    page: z
        .number()
        .positive()
        .nullable()
        .describe('Use this to paginate through the results.'),
});

export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;

export const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchema;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
