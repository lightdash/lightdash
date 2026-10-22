import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const THEME_MATCH_GUIDANCE =
    'match the request to one theme by name or description and pass its slug as themeSlug. When none matches, ask the user which theme they mean.';

export const TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = `List the organization's data app themes. Call it when the user names a theme, brand or look ("the dark theme", "our brand") and the attached context lists no theme; ${THEME_MATCH_GUIDANCE}`;

export const MCP_TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = `Tool: list_data_app_themes

Purpose:
List the organization's themes: bundles of styling a data app or custom chart type can be built with.

Important:
- Call it when the user names a theme, brand or look; ${THEME_MATCH_GUIDANCE}
`;

export const toolListDataAppThemesArgsSchema = createToolSchema().build();

export const mcpListDataAppThemesStructuredOutputSchema = z.object({
    themes: z
        .array(
            z.object({
                slug: z.string().describe('Pass as themeSlug to a build tool.'),
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

const dataAppThemeSchema = z.object({
    slug: z
        .string()
        .describe(
            'Pass as themeSlug to generateDataApp or iterateDataApp to apply this theme.',
        ),
    name: z.string(),
    isDefault: z
        .boolean()
        .describe(
            'Whether this is the organization default theme, applied when no themeSlug is given.',
        ),
    description: z.string().nullable(),
});

export const toolListDataAppThemesStructuredContentSchema = z.object({
    count: z
        .number()
        .int()
        .describe('Number of themes; 0 means the organization has no themes.'),
    themes: z.array(dataAppThemeSchema),
});

export const toolListDataAppThemesOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolListDataAppThemesStructuredContentSchema,
});

export type ToolListDataAppThemesArgs = z.infer<
    typeof toolListDataAppThemesArgsSchema
>;

export type ToolListDataAppThemesStructuredContent = z.infer<
    typeof toolListDataAppThemesStructuredContentSchema
>;

export type ToolListDataAppThemesOutput = z.infer<
    typeof toolListDataAppThemesOutputSchema
>;
