import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = [
    "List the organization's data app themes: slug, name, whether it is the organization default, and its description.",
    'Call it when the user names a theme, brand, or look for a data app and no theme slug is in the attached context; match the request to a theme and pass its slug as themeSlug to generateDataApp or iterateDataApp.',
    'Skip it when the context already carries a theme slug, or when the user says nothing about the look — the organization default applies.',
].join(' ');

export const toolListDataAppThemesArgsSchema = createToolSchema().build();

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
