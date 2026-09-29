import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_READ_PINNED_THREAD_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

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

export const toolReadPinnedThreadStructuredContentSchema = z.object({
    threadUuid: z
        .string()
        .describe('Uuid of the pinned conversation that was read.'),
    messages: z
        .array(
            z.object({
                index: z
                    .number()
                    .describe('Zero-based position in the transcript.'),
                role: z.enum(['user', 'assistant']),
                createdAt: z
                    .string()
                    .describe('ISO timestamp of when the message was sent.'),
                message: z
                    .string()
                    .describe(
                        'Message text, cut to the same per-message and transcript budget as `result`.',
                    ),
            }),
        )
        .describe('The transcript in chronological order.'),
});

// Composed by hand: `structuredToolOutputSchema` only accepts object metadata,
// and this tool's metadata is a discriminated union that must stay unchanged.
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
    structuredContent: z.union([
        toolReadPinnedThreadStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolReadPinnedThreadArgs = z.infer<
    typeof toolReadPinnedThreadArgsSchema
>;

export type ToolReadPinnedThreadStructuredContent = z.infer<
    typeof toolReadPinnedThreadStructuredContentSchema
>;

export type ToolReadPinnedThreadOutput = z.infer<
    typeof toolReadPinnedThreadOutputSchema
>;
