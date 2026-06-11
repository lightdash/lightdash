import { readPinnedThreadToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { ReadPinnedThreadFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { xmlBuilder } from '../xmlBuilder';

type Dependencies = {
    readPinnedThread: ReadPinnedThreadFn;
};

const toolDefinition = readPinnedThreadToolDefinition.for('agent');

const MAX_MESSAGE_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 40_000;

export const getReadPinnedThread = ({ readPinnedThread }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ threadUuid }) => {
            try {
                const messages = await readPinnedThread({ threadUuid });

                let budget = MAX_TRANSCRIPT_CHARS;
                const bounded = messages.map((message) => {
                    const truncated = message.message.slice(
                        0,
                        Math.max(0, Math.min(MAX_MESSAGE_CHARS, budget)),
                    );
                    budget -= truncated.length;
                    return { ...message, message: truncated };
                });

                return {
                    result: (
                        <conversation threadUuid={threadUuid}>
                            {bounded.map((message, index) => (
                                <message
                                    role={message.role}
                                    index={index}
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
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(
                        e,
                        'Error reading pinned conversation.',
                    ),
                    metadata: { status: 'error' },
                };
            }
        },
    });
