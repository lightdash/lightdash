import { tool } from 'ai';
import { z } from 'zod';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const toolEditContentArgsSchema = z
    .object({
        slug: z
            .string()
            .min(1)
            .describe('Slug of the dashboard or chart to edit.'),
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to edit.'),
        patch: z
            .unknown()
            .describe(
                'RFC6902 Patch to apply to the current dashboard or chart JSON.',
            ),
    })
    .describe(
        'Edit a dashboard or chart by applying a patch to its JSON, then validate before persisting.',
    );

const toolEditContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

type Dependencies = {
    editContent: EditContentFn;
};

export const getEditContent = ({ editContent }: Dependencies) =>
    tool({
        description: toolEditContentArgsSchema.description,
        inputSchema: toolEditContentArgsSchema,
        outputSchema: toolEditContentOutputSchema,
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
