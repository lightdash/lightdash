import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';

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

const readContentBaseSchema = z.object({
    slug: z.string().describe('Slug of the content that was read.'),
    name: z.string().describe('Display name of the content.'),
    href: z.string().describe('Canonical Lightdash URL of the content.'),
});

const contentJsonSchema = z.record(z.string(), z.unknown());

export const toolReadContentStructuredContentSchema = z.discriminatedUnion(
    'type',
    [
        readContentBaseSchema.extend({
            type: z.literal('dashboard'),
            content: contentJsonSchema.describe(
                'Dashboard as code JSON, exactly as shown in `result`.',
            ),
        }),
        readContentBaseSchema.extend({
            type: z.literal('chart'),
            content: contentJsonSchema.describe(
                'Chart as code JSON, exactly as shown in `result`.',
            ),
        }),
        readContentBaseSchema.extend({
            type: z.literal('data_app'),
            content: contentJsonSchema.describe(
                'Read-only data app JSON (no code), exactly as shown in `result`.',
            ),
        }),
        readContentBaseSchema.extend({
            type: z.literal('document'),
            uuid: z.string().describe('UUID of the Document.'),
            versionUuid: z
                .string()
                .describe(
                    'Latest version UUID of the Document; use it as baseVersionUuid for cell edits.',
                ),
            content: contentJsonSchema.describe(
                'Document as code JSON (schema version 1), exactly as shown in `result`.',
            ),
        }),
    ],
);

// Same envelope as structuredToolOutputSchema, which only accepts object metadata.
export const toolReadContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolReadContentMetadataSchema,
    structuredContent: z.union([
        toolReadContentStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolReadContentArgs = z.infer<typeof toolReadContentArgsSchema>;
export type ReadContentType = ToolReadContentArgs['type'];

/** Human labels for tool-call UI copy. */
export const READ_CONTENT_TYPE_LABELS: Record<ReadContentType, string> = {
    dashboard: 'dashboard',
    chart: 'chart',
    data_app: 'data app',
};
export type ToolReadContentStructuredContent = z.infer<
    typeof toolReadContentStructuredContentSchema
>;
export type ToolReadContentOutput = z.infer<typeof toolReadContentOutputSchema>;
