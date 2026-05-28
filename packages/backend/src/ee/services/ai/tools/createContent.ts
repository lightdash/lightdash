import { tool } from 'ai';
import { z } from 'zod';
import type { CreateContentFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

const baseContentSchema = z.object({
    slug: z
        .string()
        .min(1)
        .describe(
            'Requested slug. Lightdash may append a suffix if this slug already exists.',
        ),
    name: z.string().min(1),
    description: z.string().nullable(),
    spaceSlug: z.string().min(1),
    version: z.number(),
    contentType: z.string(),
    updatedAt: z.unknown(),
    downloadedAt: z.unknown(),
    verified: z.boolean(),
    verification: z.unknown(),
});

const toolCreateContentArgsSchema = z
    .object({
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to create.'),
        content: z.union([
            baseContentSchema
                .extend({
                    tiles: z.array(z.unknown()),
                    tabs: z.array(z.unknown()),
                    config: z.unknown(),
                    filters: z.unknown(),
                    parameters: z.unknown(),
                })
                .passthrough()
                .describe('Full Dashboard JSON to create.'),
            baseContentSchema
                .extend({
                    tableName: z.string().min(1),
                    metricQuery: z.unknown(),
                    chartConfig: z.unknown(),
                    pivotConfig: z.unknown(),
                    tableConfig: z.unknown(),
                    dashboardSlug: z.string(),
                    parameters: z.unknown(),
                })
                .passthrough()
                .describe('Full Chart JSON to create.'),
        ]),
    })
    .describe(
        'Create a new dashboard or chart, consult the skills for the required fields. Returns the created content with the final persisted slug.',
    );

const toolCreateContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

type Dependencies = {
    createContent: CreateContentFn;
};

export const getCreateContent = ({ createContent }: Dependencies) =>
    tool({
        description: toolCreateContentArgsSchema.description,
        inputSchema: toolCreateContentArgsSchema,
        outputSchema: toolCreateContentOutputSchema,
        execute: async ({ type, content }) => {
            try {
                const result = await createContent({
                    type,
                    content,
                } as Parameters<CreateContentFn>[0]);

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
                        `Error creating ${type} "${content.slug}". Content was not created.`,
                    ),
                    metadata: {
                        status: 'error' as const,
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
