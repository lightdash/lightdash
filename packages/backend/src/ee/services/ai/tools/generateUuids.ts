import { generateUuidsToolDefinition } from '@lightdash/common';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = generateUuidsToolDefinition.for('ai-sdk');

export const getGenerateUuids = () =>
    toolDefinition.build({
        execute: async ({ count }) => {
            try {
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: JSON.stringify({
                        uuids: Array.from({ length: count }, () =>
                            crypto.randomUUID(),
                        ),
                    }),
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(error, 'Error generating UUIDs.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });
