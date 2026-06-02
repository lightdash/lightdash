import {
    generateHashesToolDefinition,
    hashStringToBase36,
} from '@lightdash/common';
import { tool } from 'ai';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolDefinition = generateHashesToolDefinition.for('agent');

export const getGenerateHashes = () =>
    tool({
        ...toolDefinition,
        execute: async ({ inputs }) => {
            try {
                return {
                    result: JSON.stringify({
                        hashes: inputs.map(hashStringToBase36),
                    }),
                    metadata: {
                        status: 'success' as const,
                    },
                };
            } catch (error) {
                return {
                    result: toolErrorHandler(error, 'Error generating hashes.'),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
