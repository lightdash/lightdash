import { retireMemoryToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import type { RetireMemoryFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = retireMemoryToolDefinition.for('agent');

export const getRetireMemory = ({
    retireMemory,
}: {
    retireMemory: RetireMemoryFn;
}) =>
    tool({
        ...toolDefinition,
        execute: async ({ slug }) => {
            try {
                const memory = await retireMemory({ slug });
                return {
                    result: `Retired memory "${memory.title}" (${memory.slug}). It will no longer be used in future conversations. The user can reactivate it from the memories page.`,
                    metadata: {
                        status: 'success' as const,
                        slug: memory.slug,
                        title: memory.title,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error retiring memory.'),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
