import {
    readPinnedThreadToolDefinition,
    type ToolReadPinnedThreadStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ReadPinnedThreadFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    readPinnedThread: ReadPinnedThreadFn;
};

const toolDefinition = readPinnedThreadToolDefinition.for('agent');

const MAX_MESSAGE_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 40_000;

type ReadPinnedThreadSuccess = ExecuteStructuredToolResult<
    ToolReadPinnedThreadStructuredContent,
    { status: 'success'; messageCount: number }
>;

const boundTranscript = (
    messages: Awaited<ReturnType<ReadPinnedThreadFn>>,
): ToolReadPinnedThreadStructuredContent['messages'] => {
    let budget = MAX_TRANSCRIPT_CHARS;
    return messages.map((message, index) => {
        const truncated = message.message.slice(
            0,
            Math.max(0, Math.min(MAX_MESSAGE_CHARS, budget)),
        );
        budget -= truncated.length;
        return {
            index,
            role: message.role,
            createdAt: message.createdAt,
            message: truncated,
        };
    });
};

export const getReadPinnedThread = ({ readPinnedThread }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            threadUuid,
        }): Promise<ReadPinnedThreadSuccess | ExecuteToolErrorResult> => {
            try {
                const messages = await readPinnedThread({ threadUuid });
                const transcript = {
                    threadUuid,
                    messages: boundTranscript(messages),
                };

                return {
                    result: (
                        <conversation threadUuid={transcript.threadUuid}>
                            {transcript.messages.map((message) => (
                                <message
                                    role={message.role}
                                    index={message.index}
                                    createdAt={message.createdAt}
                                >
                                    {message.message}
                                </message>
                            ))}
                        </conversation>
                    ).toString(),
                    metadata: {
                        status: 'success',
                        messageCount: messages.length,
                    },
                    structuredContent: transcript,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error reading pinned conversation.');
            }
        },
    });
