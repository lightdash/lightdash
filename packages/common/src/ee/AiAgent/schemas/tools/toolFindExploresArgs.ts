import { z } from 'zod';

export const toolFindExploresArgsSchema = z.object({
    type: z.literal('find_explores'),
    page: z
        .number()
        .nullable()
        .describe(
            'Use this to paginate through the results. Starts at 1 and increments by 1.',
        ),
});

export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;

export const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchema;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
