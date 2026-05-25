import { tool } from 'ai';
import { z } from 'zod';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

export const toolGenerateUuidsArgsSchema = z
    .object({
        count: z
            .number()
            .min(1)
            .max(20)
            .describe('Number of UUIDs to generate.'),
    })
    .describe(
        'Generate one or more UUIDs to use as stable identifiers when creating new objects.',
    );

const toolGenerateUuidsOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export const getGenerateUuids = () =>
    tool({
        description: toolGenerateUuidsArgsSchema.description,
        inputSchema: toolGenerateUuidsArgsSchema,
        outputSchema: toolGenerateUuidsOutputSchema,
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
