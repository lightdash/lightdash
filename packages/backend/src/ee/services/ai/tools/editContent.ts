import { editContentToolDefinition } from '@lightdash/common';
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
                        slug: result.content.slug,
                        name: result.content.name,
                        uuid: result.uuid,
                        url: result.url,
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
