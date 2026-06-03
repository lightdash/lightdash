import { editContentToolDefinition } from '@lightdash/ai';
import { tool } from 'ai';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editContent: EditContentFn;
};

const toolDefinition = editContentToolDefinition.for('agent');

export const getEditContent = ({ editContent }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({ slug, type, patch }) => {
            try {
                const result = await editContent({ slug, type, patch });

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
                        `Error editing ${type} "${slug}". Patch was not applied.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
