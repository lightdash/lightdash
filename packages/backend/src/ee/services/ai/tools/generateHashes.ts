import {
    generateHashesToolDefinition,
    hashStringToBase36,
} from '@lightdash/common';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = generateHashesToolDefinition.for('ai-sdk');

export const getGenerateHashes = () =>
    toolDefinition.build({
        execute: async ({ inputs }) => {
            try {
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: JSON.stringify({
                        hashes: inputs.map(hashStringToBase36),
                    }),
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(error, 'Error generating hashes.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
    });
