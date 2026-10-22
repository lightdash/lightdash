import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_READ_PINNED_THREAD_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: ${toolName}

Read the transcript of a previous conversation attached to this thread as context, to understand what the user was trying to achieve there before answering.

Use it when a message in this thread lists a Conversation as attached context and you need its content, or when you are asked to verify or follow up on something from that conversation. Only attached conversations are readable. A transcript does not change between calls, so reuse one you have already read instead of reading it again.

The attached conversation may predate recent project changes: verify its claims (available fields, metrics, query results) against the current project before relying on them.
`;

export const toolReadPinnedThreadArgsSchema = createToolSchema()
    .extend({
        threadUuid: z
            .string()
            .uuid()
            .describe(
                'Uuid of the attached conversation, from the context note in this thread.',
            ),
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
