import { z } from 'zod';

export const aiAgentToolCallProviderMetadataSchema = z.discriminatedUnion(
    'provider',
    [
        z.object({
            provider: z.literal('google'),
            signature: z.string().min(1),
        }),
    ],
);

export type AiAgentToolCallProviderMetadata = z.infer<
    typeof aiAgentToolCallProviderMetadataSchema
>;

export const parseStoredAiAgentToolCallProviderMetadata = (
    value: unknown,
): AiAgentToolCallProviderMetadata | null => {
    const parsed = aiAgentToolCallProviderMetadataSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};
