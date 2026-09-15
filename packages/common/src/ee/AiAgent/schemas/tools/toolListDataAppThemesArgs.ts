import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_LIST_DATA_APP_THEMES_DESCRIPTION = [
    "List the organization's data app themes: slug, name, whether it is the organization default, and its description.",
    'Call it when the user names a theme, brand, or look for a data app and no theme slug is in the attached context; match the request to a theme and pass its slug as themeSlug to generateDataApp or iterateDataApp.',
    'Skip it when the context already carries a theme slug, or when the user says nothing about the look — the organization default applies.',
].join(' ');

export const toolListDataAppThemesArgsSchema = createToolSchema().build();

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
