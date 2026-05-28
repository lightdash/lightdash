import { generateUuidsToolDefinition } from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = generateUuidsToolDefinition.for('agent');

export const getGenerateUuids = () =>
    tool({
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
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
