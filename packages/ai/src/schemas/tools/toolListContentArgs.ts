import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

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

export type ToolListContentArgs = z.infer<typeof toolListContentArgsSchema>;
export type ToolListContentOutput = z.infer<typeof toolListContentOutputSchema>;
