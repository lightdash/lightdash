import { z } from 'zod';

export const TOOL_READ_CONTENT_DESCRIPTION =
    'Read a dashboard or chart as JSON using its slug. Call this before editing.';

export const toolReadContentArgsSchema = z.object({
    slug: z.string().min(1).describe('Slug of the dashboard or chart to read.'),
    type: z
        .enum(['dashboard', 'chart'])
        .describe('Type of Lightdash content to read.'),
});

const toolReadContentMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    z.object({
        status: z.literal('success'),
        slug: z.string(),
        name: z.string(),
        href: z.string(),
    }),
]);

export const toolReadContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolReadContentMetadataSchema,
});

export type ToolReadContentArgs = z.infer<typeof toolReadContentArgsSchema>;
export type ToolReadContentOutput = z.infer<typeof toolReadContentOutputSchema>;
