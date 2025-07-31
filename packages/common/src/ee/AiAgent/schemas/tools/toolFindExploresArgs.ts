import { z } from 'zod';

export const toolFindExploresArgsSchema = z.object({
    type: z.literal('find_explores'),
});

export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;

export const toolFindExploresArgsSchemaTransformed = toolFindExploresArgsSchema;
export type ToolFindExploresArgsTransformed = ToolFindExploresArgs;
