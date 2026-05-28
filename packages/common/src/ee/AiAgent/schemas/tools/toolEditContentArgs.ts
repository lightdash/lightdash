import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_EDIT_CONTENT_DESCRIPTION =
    'Edit a dashboard or chart by applying a patch to its JSON, then validate before persisting.';

export const toolEditContentArgsSchema = z.object({
    slug: z.string().min(1).describe('Slug of the dashboard or chart to edit.'),
    type: z
        .enum(['dashboard', 'chart'])
        .describe('Type of Lightdash content to edit.'),
    patch: z
        .unknown()
        .describe(
            'RFC6902 Patch to apply to the current dashboard or chart JSON.',
        ),
});

export const toolEditContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolEditContentArgs = z.infer<typeof toolEditContentArgsSchema>;
export type ToolEditContentOutput = z.infer<typeof toolEditContentOutputSchema>;
