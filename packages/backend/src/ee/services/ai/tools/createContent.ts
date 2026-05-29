import { createContentToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    createContent: CreateContentFn;
};

const toolDefinition = createContentToolDefinition.for('agent');

export const getCreateContent = ({ createContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ type, content }) => {
            try {
                const result = await createContent({
                    type,
                    content,
                });

                return {
                    result: JSON.stringify(result.content, null, 2),
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(
                        error,
                        `Error creating ${type} "${content.slug}". Content was not created.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
