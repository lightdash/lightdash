import { assertUnreachable } from '@lightdash/common';
import type { ProviderMetadata } from 'ai';
import { z } from 'zod';
import type { AiAgentToolCallProviderMetadata } from '../../../database/entities/aiAgentToolCallProviderMetadata';

const googleToolCallProviderMetadataSchema = z.object({
    google: z.object({
        signature: z.string().min(1),
    }),
});

export const extractToolCallProviderMetadata = (
    providerMetadata: ProviderMetadata | undefined,
): AiAgentToolCallProviderMetadata | null => {
    const parsed =
        googleToolCallProviderMetadataSchema.safeParse(providerMetadata);
    if (!parsed.success) {
        return null;
    }

    return {
        provider: 'google',
        signature: parsed.data.google.signature,
    };
};

export const toToolCallProviderOptions = (
    metadata: AiAgentToolCallProviderMetadata | null,
): ProviderMetadata | undefined => {
    if (metadata === null) {
        return undefined;
    }

    const { provider } = metadata;
    switch (provider) {
        case 'google':
            return {
                google: {
                    signature: metadata.signature,
                },
            };
        default:
            return assertUnreachable(
                provider,
                'Unknown AI agent tool-call provider metadata',
            );
    }
};
