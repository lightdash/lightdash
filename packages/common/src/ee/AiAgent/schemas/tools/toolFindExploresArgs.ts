import { z } from 'zod';

export const aiToolFindExploresArgsSchema = z.object({});

export type ToolFindExploresArgs = z.infer<typeof aiToolFindExploresArgsSchema>;

export const isToolFindExploresArgs = (
    toolArgs: unknown,
): toolArgs is ToolFindExploresArgs =>
    aiToolFindExploresArgsSchema.safeParse(toolArgs).success;
