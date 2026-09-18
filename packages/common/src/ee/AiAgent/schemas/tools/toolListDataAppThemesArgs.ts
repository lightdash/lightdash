import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = [
    "List the organization's data app themes: slug, name, whether it is the organization default, and its description.",
    'Call it when the user names a theme, brand, or look for a data app and no theme slug is in the attached context; match the request to a theme and pass its slug as themeSlug to generateDataApp or iterateDataApp.',
    'Skip it when the context already carries a theme slug, or when the user says nothing about the look — the organization default applies.',
].join(' ');

export const MCP_TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = `Tool: list_data_app_themes

Purpose:
List the organization's data app themes. A theme is a bundle of styling a data app can be built with; each has a slug you pass as themeSlug to generate_data_app.

Important:
- Call it when the user names a theme, brand, or look for a data app, then match the request to a theme and pass its slug.
- Skip it when the user says nothing about the look: the organization default theme applies.
- An organization may have no themes at all, in which case omit themeSlug.

Parameters: none.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<the themes, one per line>" }]
- structuredContent: {
    themes: [{
      slug:        string,        // pass as themeSlug to generate_data_app
      name:        string,
      isDefault:   boolean,       // applied when themeSlug is omitted
      description: string | null
    }]
  }
`;

export const toolListDataAppThemesArgsSchema = createToolSchema().build();

export const mcpListDataAppThemesStructuredOutputSchema = z.object({
    themes: z
        .array(
            z.object({
                slug: z
                    .string()
                    .describe('Pass as themeSlug to generate_data_app.'),
                name: z.string().describe("The theme's display name."),
                isDefault: z
                    .boolean()
                    .describe(
                        'Whether this theme applies when themeSlug is omitted.',
                    ),
                description: z
                    .string()
                    .nullable()
                    .describe('What it looks like.'),
            }),
        )
        .describe("The organization's themes; empty when it has none."),
});

export type McpListDataAppThemesOutput = z.infer<
    typeof mcpListDataAppThemesStructuredOutputSchema
>;

export const toolListDataAppThemesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolListDataAppThemesArgs = z.infer<
    typeof toolListDataAppThemesArgsSchema
>;

export type ToolListDataAppThemesOutput = z.infer<
    typeof toolListDataAppThemesOutputSchema
>;
