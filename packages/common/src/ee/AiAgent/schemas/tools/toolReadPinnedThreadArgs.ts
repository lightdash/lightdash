import { z } from 'zod';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_READ_PINNED_THREAD_DESCRIPTION = `Tool: read_pinned_thread

Purpose:
Read the transcript of a previous conversation that was attached to this thread as context. Use it to understand what the user was trying to achieve in that conversation before answering.

When to use:
- A message in this thread lists a Conversation as attached context and you need its content.
- You were asked to verify or follow up on something that happened in the attached conversation.

Do NOT use:
- For threads that are not attached as context — only pinned conversations are readable.
- Repeatedly for the same threadUuid in one turn — the transcript does not change between calls.

Important:
The attached conversation may predate recent project changes. Verify any claims it contains (available fields, metrics, query results) against the current project instead of trusting them.

Parameters:
- threadUuid: The uuid of the attached conversation, taken from the context note in this thread.
`;

export const toolReadPinnedThreadArgsSchema = createToolSchema()
    .extend({
        threadUuid: z
            .string()
            .uuid()
            .describe('Uuid of the pinned conversation to read.'),
    })
    .build();

export const toolReadPinnedThreadOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            messageCount: z.number(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export type ToolReadPinnedThreadArgs = z.infer<
    typeof toolReadPinnedThreadArgsSchema
>;

export type ToolReadPinnedThreadOutput = z.infer<
    typeof toolReadPinnedThreadOutputSchema
>;
