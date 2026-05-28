import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_READ_CONTENT_DESCRIPTION =
    'Read a dashboard or chart as JSON using its slug. Call this before editing.';

export const toolReadContentArgsSchema = z.object({
    slug: z.string().min(1).describe('Slug of the dashboard or chart to read.'),
    type: z
        .enum(['dashboard', 'chart'])
        .describe('Type of Lightdash content to read.'),
});

export const toolReadContentOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolReadContentArgs = z.infer<typeof toolReadContentArgsSchema>;
export type ToolReadContentOutput = z.infer<typeof toolReadContentOutputSchema>;
