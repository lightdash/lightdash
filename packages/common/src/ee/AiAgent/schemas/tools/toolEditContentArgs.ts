import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';

export const TOOL_EDIT_CONTENT_DESCRIPTION =
    'Edit a dashboard or chart by applying a patch to its JSON, then validate before persisting';

export const toolEditContentArgsSchema = z.object({
    slug: z.string().min(1).describe('Slug of the dashboard or chart to edit'),
    type: z
        .enum(['dashboard', 'chart'])
        .describe('Type of Lightdash content to edit'),
    patch: z
        .array(z.unknown())
        .describe(
            'RFC6902 Patch objects array to apply to the current dashboard or chart JSON',
        ),
});

const toolEditContentMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    z.object({
        status: z.literal('success'),
        slug: z.string(),
        name: z.string(),
        uuid: z.string(),
        href: z.string(),
        warnings: z.array(z.string()),
        versionUuids: z.object({
            before: z.string().nullable(),
            after: z.string().nullable(),
        }),
    }),
]);

const editedContentHrefSchema = z
    .string()
    .describe('Canonical Lightdash link to the edited content');
const editedContentWarningsSchema = z
    .array(z.string())
    .describe(
        'Validation warnings about the persisted content; empty when there are none',
    );

export const toolEditContentStructuredContentSchema = z.discriminatedUnion(
    'type',
    [
        z.object({
            type: z.enum(['dashboard', 'chart']),
            href: editedContentHrefSchema,
            content: z
                .record(z.string(), z.unknown())
                .describe('The dashboard or chart as code after the edit'),
            warnings: editedContentWarningsSchema,
        }),
        z.object({
            type: z.literal('document'),
            href: editedContentHrefSchema,
            uuid: z.string().describe('UUID of the edited Document'),
            versionUuid: z
                .string()
                .describe(
                    'Version UUID after the edit; required as baseVersionUuid for the next content edit',
                ),
            content: z
                .record(z.string(), z.unknown())
                .describe('The Document as code after the edit'),
            warnings: editedContentWarningsSchema,
        }),
    ],
);

// Mirrors `structuredToolOutputSchema`, which only accepts a ZodObject metadata
// schema; this tool's metadata is a discriminated union on `status`.
export const toolEditContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolEditContentMetadataSchema,
    structuredContent: z.union([
        toolEditContentStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolEditContentArgs = z.infer<typeof toolEditContentArgsSchema>;
export type ToolEditContentStructuredContent = z.infer<
    typeof toolEditContentStructuredContentSchema
>;
export type ToolEditContentOutput = z.infer<typeof toolEditContentOutputSchema>;
