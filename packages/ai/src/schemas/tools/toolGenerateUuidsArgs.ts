import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_GENERATE_UUIDS_DESCRIPTION =
    'Generate one or more UUIDs to use as stable identifiers when creating new objects.';

export const toolGenerateUuidsArgsSchema = z.object({
    count: z.number().min(1).max(20).describe('Number of UUIDs to generate.'),
});

export const toolGenerateUuidsOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolGenerateUuidsArgs = z.infer<typeof toolGenerateUuidsArgsSchema>;

export type ToolGenerateUuidsOutput = z.infer<
    typeof toolGenerateUuidsOutputSchema
>;
