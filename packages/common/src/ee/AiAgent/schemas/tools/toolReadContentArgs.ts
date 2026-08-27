import { z } from 'zod';

export const TOOL_READ_CONTENT_DESCRIPTION =
    'Read a dashboard or chart as JSON using its slug, or a data app as a structured summary (identity, status, generation inputs, data references, usage — never source code). Call this before editing a dashboard or chart.';

export const READ_CONTENT_TYPES = ['dashboard', 'chart', 'data_app'] as const;

export type ReadContentType = (typeof READ_CONTENT_TYPES)[number];

export const READ_CONTENT_TYPE_LABELS: Record<ReadContentType, string> = {
    dashboard: 'dashboard',
    chart: 'chart',
    data_app: 'data app',
};

export const toolReadContentArgsSchema = z.object({
    slug: z
        .string()
        .min(1)
        .describe('Slug of the dashboard, chart or data app to read.'),
    type: z
        .enum(READ_CONTENT_TYPES)
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
