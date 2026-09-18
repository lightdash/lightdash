import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_CONTENT_DESCRIPTION = ({
    toolName,
}: ToolDescriptionContext): string => `Tool: "${toolName}"
Purpose:
Lists accessible Lightdash content in a project as a browsable hierarchy.

Usage tips:
- By default, lists root-level spaces.
- Pass a spaceSlug to list direct children and content inside that space.
- Use page for pagination. Page starts at 1.
- Results include names, slugs, content types, URLs, and space content counts.`;

export const toolListContentArgsSchema = createToolSchema()
    .extend({
        spaceSlug: z
            .string()
            .nullable()
            .describe(
                'Optional space slug/path to list. Use null to list root-level content.',
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
