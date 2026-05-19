import { tool } from 'ai';
import { z } from 'zod';
import type { ReadContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolReadContentArgsSchema = z
    .object({
        slug: z
            .string()
            .min(1)
            .describe('Slug of the dashboard or chart to read.'),
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to read.'),
    })
    .describe(
        'Read a dashboard or chart as JSON using its slug. Call this before editing.',
    );

const toolReadContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

type Dependencies = {
    readContent: ReadContentFn;
};

export const getReadContent = ({ readContent }: Dependencies) =>
    tool({
        description: toolReadContentArgsSchema.description,
        inputSchema: toolReadContentArgsSchema,
        outputSchema: toolReadContentOutputSchema,
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
