import { generateUuidsTool } from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

export const getGenerateUuids = () =>
    tool({
        ...generateUuidsTool.for('agent'),
        execute: async ({ count }) => {
            try {
                return {
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
                    result: toolErrorHandler(error, 'Error generating UUIDs.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
