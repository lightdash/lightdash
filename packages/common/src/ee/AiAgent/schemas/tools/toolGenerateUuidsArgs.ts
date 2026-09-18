import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

export const TOOL_GENERATE_UUIDS_DESCRIPTION =
    'Generate one or more UUIDs to use as stable identifiers when creating new objects.';

export const toolGenerateUuidsArgsSchema = z.object({
    count: z.coerce
        .number()
        .min(1)
        .max(20)
        .describe('Number of UUIDs to generate.'),
});

export const toolGenerateUuidsStructuredContentSchema = z.object({
    uuids: z
        .array(z.string())
        .describe('The freshly generated UUIDs, one per requested count.'),
});

export const toolGenerateUuidsOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolGenerateUuidsStructuredContentSchema,
});

export type ToolGenerateUuidsArgs = z.infer<typeof toolGenerateUuidsArgsSchema>;

export type ToolGenerateUuidsStructuredContent = z.infer<
    typeof toolGenerateUuidsStructuredContentSchema
>;

export type ToolGenerateUuidsOutput = z.infer<
    typeof toolGenerateUuidsOutputSchema
>;
