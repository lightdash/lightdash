import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_GENERATE_HASHES_DESCRIPTION =
    'Generate deterministic base-36 hashes for input strings.';

export const toolGenerateHashesArgsSchema = z.object({
    inputs: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe('Input strings to hash.'),
});

export const toolGenerateHashesOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolGenerateHashesArgs = z.infer<
    typeof toolGenerateHashesArgsSchema
>;

export type ToolGenerateHashesOutput = z.infer<
    typeof toolGenerateHashesOutputSchema
>;
