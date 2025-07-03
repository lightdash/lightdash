import { z } from 'zod';

export const toolFindExploresArgsSchema = z.object({});

export type ToolFindExploresArgs = z.infer<typeof toolFindExploresArgsSchema>;

export const isToolFindExploresArgs = (
    toolArgs: unknown,
): toolArgs is ToolFindExploresArgs =>
    toolFindExploresArgsSchema.safeParse(toolArgs).success;
