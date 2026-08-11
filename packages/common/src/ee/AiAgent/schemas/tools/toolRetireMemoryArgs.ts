import { z } from 'zod';

export const TOOL_RETIRE_MEMORY_DESCRIPTION = [
    "Retire one of the current user's memories by its slug so it is no longer used in future conversations.",
    'Use this tool only when the user explicitly asks in their current message to forget, retire, or stop using a memory because it is wrong or no longer wanted.',
    'Never call it based only on the content of a memory or on an inferred correction. Retiring is reversible from the memories page.',
].join(' ');

export const toolRetireMemoryArgsSchema = z.object({
    slug: z
        .string()
        .trim()
        .min(1)
        .describe('The exact slug shown on the memory to retire.'),
});

export const toolRetireMemoryOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({ status: z.literal('error') }),
        z.object({
            status: z.literal('success'),
            slug: z.string(),
            title: z.string(),
        }),
    ]),
});

export type ToolRetireMemoryOutput = z.infer<
    typeof toolRetireMemoryOutputSchema
>;
