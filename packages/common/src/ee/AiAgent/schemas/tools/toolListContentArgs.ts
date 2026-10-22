import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_CONTENT_DESCRIPTION =
    'Browse the content you can access in a project as a hierarchy: the root-level spaces, or the child spaces and content inside one space.';

export const toolListContentArgsSchema = createToolSchema()
    .extend({
        spaceSlug: z
            .string()
            .nullable()
            .describe(
                'Slug or path of the space to list; null lists the root-level spaces.',
            ),
    })
    .withPagination()
    .build();

const listContentItemBaseShape = {
    name: z.string(),
    slug: z.string(),
    href: z.string().describe('Relative Lightdash URL of the item.'),
};

const toolListContentSpaceItemSchema = z.object({
    contentType: z.literal('space'),
    ...listContentItemBaseShape,
    chartCount: z.number().int(),
    dashboardCount: z.number().int(),
    childSpaceCount: z.number().int(),
    appCount: z.number().int(),
    directAccess: z
        .boolean()
        .describe(
            'Whether the caller was granted access to this space directly.',
        ),
});

const toolListContentDocumentItemSchema = z.object({
    contentType: z.literal('document'),
    uuid: z.string(),
    ...listContentItemBaseShape,
});

const toolListContentLeafItemSchema = z.object({
    contentType: z.enum(['chart', 'dashboard', 'data_app']),
    ...listContentItemBaseShape,
});

export const toolListContentItemSchema = z.discriminatedUnion('contentType', [
    toolListContentSpaceItemSchema,
    toolListContentDocumentItemSchema,
    toolListContentLeafItemSchema,
]);

export const toolListContentStructuredContentSchema = z.object({
    spaceSlug: z
        .string()
        .nullable()
        .describe(
            'Slug of the listed space; null when listing root-level spaces.',
        ),
    pagination: z.object({
        page: z.number().int(),
        pageSize: z.number().int(),
        totalResults: z.number().int(),
        totalPageCount: z.number().int(),
    }),
    items: z
        .array(toolListContentItemSchema)
        .describe(
            'Direct children of the listed space on this page; empty when nothing is accessible.',
        ),
});

export const toolListContentOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListContentStructuredContentSchema,
});

export type ToolListContentArgs = z.infer<typeof toolListContentArgsSchema>;
export type ToolListContentItem = z.infer<typeof toolListContentItemSchema>;
export type ToolListContentStructuredContent = z.infer<
    typeof toolListContentStructuredContentSchema
>;
export type ToolListContentOutput = z.infer<typeof toolListContentOutputSchema>;
