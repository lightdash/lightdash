import { z } from 'zod';

export const TOOL_CREATE_CONTENT_DESCRIPTION =
    'Create a new dashboard or chart, consult the skills for the required fields. Returns the created content with the final persisted slug.';

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

export const toolCreateContentArgsSchema = z.object({
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
});

export type ToolCreateContentArgs = z.infer<typeof toolCreateContentArgsSchema>;

const toolCreateContentMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    z.object({
        status: z.literal('success'),
        slug: z.string(),
        name: z.string(),
        uuid: z.string(),
        href: z.string(),
    }),
]);

export const toolCreateContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolCreateContentMetadataSchema,
});

export type ToolCreateContentOutput = z.infer<
    typeof toolCreateContentOutputSchema
>;
