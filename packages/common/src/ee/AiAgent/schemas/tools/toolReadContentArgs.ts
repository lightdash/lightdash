import { z } from 'zod';

export const TOOL_READ_CONTENT_DESCRIPTION =
    'Read a dashboard, chart, or data app as JSON using its slug. Call this before editing a dashboard or chart. Data apps are read-only and returned without code.';

export const toolReadContentArgsSchema = z.object({
    slug: z
        .string()
        .min(1)
        .describe('Slug of the dashboard, chart, or data app to read.'),
    type: z
        .enum(['dashboard', 'chart', 'data_app'])
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
export type ReadContentType = ToolReadContentArgs['type'];

/** Human labels for tool-call UI copy. */
export const READ_CONTENT_TYPE_LABELS: Record<ReadContentType, string> = {
    dashboard: 'dashboard',
    chart: 'chart',
    data_app: 'data app',
};
export type ToolReadContentOutput = z.infer<typeof toolReadContentOutputSchema>;
