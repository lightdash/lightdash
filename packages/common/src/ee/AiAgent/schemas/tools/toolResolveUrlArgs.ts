import { z } from 'zod';
import { type ToolDescriptionContext } from '../defineTool';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolNameFor } from './discoveryToolNames';

export const TOOL_RESOLVE_URL_DESCRIPTION = ({
    runtime,
    toolName,
}: ToolDescriptionContext): string => {
    const readContent = toolNameFor('readContent', runtime);
    return `Tool: ${toolName}

Expand a share link, a URL whose path is "/share/<id>" (e.g. "<host>/share/aBcD1234..."), into the full URL it redirects to. Share links are opaque, so this is the only way to see what they point at; read the identifiers (project uuid, chart or dashboard uuid, explore name) from the expanded URL, then fetch the content with other tools such as ${readContent}.

Every other URL, such as "/projects/<uuid>/saved/<uuid>" or "/projects/<uuid>/dashboards/<uuid>", already contains its identifiers: read them from the path and go straight to the appropriate tool. URLs from another instance cannot be resolved.`;
};

export const toolResolveUrlArgsSchema = createToolSchema()
    .extend({
        url: z
            .string()
            .min(1)
            .describe('The Lightdash URL to resolve, exactly as provided.'),
    })
    .build();

export const toolResolveUrlStructuredContentSchema = z.discriminatedUnion(
    'isShareLink',
    [
        z.object({
            isShareLink: z.literal(true),
            resolvedUrl: z
                .string()
                .describe(
                    'The full Lightdash URL the share link expands to; read the identifiers (project uuid, chart or dashboard uuid, explore name) from its path.',
                ),
        }),
        z.object({
            url: z.string().describe('The URL that was resolved, as provided.'),
            isShareLink: z
                .literal(false)
                .describe(
                    'The URL is not a share link: its identifiers can be read directly from its path.',
                ),
        }),
    ],
);

export const toolResolveUrlOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolResolveUrlStructuredContentSchema,
});

export type ToolResolveUrlArgs = z.infer<typeof toolResolveUrlArgsSchema>;
export type ToolResolveUrlStructuredContent = z.infer<
    typeof toolResolveUrlStructuredContentSchema
>;
export type ToolResolveUrlOutput = z.infer<typeof toolResolveUrlOutputSchema>;
