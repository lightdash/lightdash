import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import {
    createToolSchema,
    toolPaginationOutputSchema,
} from '../toolSchemaBuilder';

export const TOOL_LIST_CONTENT_DESCRIPTION = `Tool: "listContent"
Purpose:
Lists accessible Lightdash content in a project as a browsable hierarchy.

Usage tips:
- By default, lists root-level spaces.
- Pass a spaceSlug to list direct children and content inside that space.
- Use page for pagination. Page starts at 1.
- Results include names, slugs, content types, and space content counts.`;

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

export const toolListContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const mcpListContentStructuredOutputSchema = z.object({
    spaceSlug: z.string().nullable(),
    items: z.array(
        z.union([
            z.object({
                contentType: z.enum(['chart', 'dashboard', 'data_app']),
                name: z.string(),
                slug: z.string(),
            }),
            z.object({
                contentType: z.literal('space'),
                name: z.string(),
                slug: z.string(),
                chartCount: z.number(),
                dashboardCount: z.number(),
                childSpaceCount: z.number(),
                appCount: z.number(),
                directAccess: z.boolean(),
            }),
        ]),
    ),
    pagination: toolPaginationOutputSchema.optional(),
});

export type ToolListContentArgs = z.infer<typeof toolListContentArgsSchema>;
export type ToolListContentOutput = z.infer<typeof toolListContentOutputSchema>;
