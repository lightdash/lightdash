import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_RESOLVE_URL_DESCRIPTION = `Tool: resolveUrl

Purpose:
Expands a Lightdash share short-link into the full URL it redirects to. Share links are opaque — this tool is the only way to see what they point at.

When to use:
- ONLY for URLs whose path is "/share/<id>" (e.g. "<host>/share/aBcD1234..."). Nothing else is a share link.
- NEVER call this for any other URL. A URL like "/projects/<uuid>/saved/<uuid>" or "/projects/<uuid>/dashboards/<uuid>" already contains its identifiers — read them directly from the path and go straight to the appropriate tool.

Usage tips:
- Read the identifiers (project uuid, chart or dashboard uuid, explore name) from the expanded URL, then use other tools (e.g. readContent) to fetch the content.
- URLs that don't belong to this Lightdash instance cannot be resolved.`;

export const toolResolveUrlArgsSchema = createToolSchema()
    .extend({
        url: z
            .string()
            .min(1)
            .describe('The Lightdash URL to resolve, exactly as provided.'),
    })
    .build();

export const toolResolveUrlOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolResolveUrlArgs = z.infer<typeof toolResolveUrlArgsSchema>;
export type ToolResolveUrlOutput = z.infer<typeof toolResolveUrlOutputSchema>;
