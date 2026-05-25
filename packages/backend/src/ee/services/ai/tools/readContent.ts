import { readContentTool } from '@lightdash/common';
import { tool } from 'ai';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    readContent: ReadContentFn;
};

export const getReadContent = ({ readContent }: Dependencies) =>
    tool({
        ...readContentTool.for('agent'),
        execute: async ({ slug, type }) => {
            try {
                const result = await readContent({ slug, type });

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
                        `Error reading ${type} "${slug}"`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
