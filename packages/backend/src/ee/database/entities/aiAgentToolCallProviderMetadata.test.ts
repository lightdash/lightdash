import { parseStoredAiAgentToolCallProviderMetadata } from './aiAgentToolCallProviderMetadata';

describe('stored AI agent tool-call provider metadata', () => {
    it('parses a Google signature and strips unknown fields', () => {
        expect(
            parseStoredAiAgentToolCallProviderMetadata({
                provider: 'google',
                signature: 'google-signature',
                interactionId: 'not-loaded',
            }),
        ).toEqual({
            provider: 'google',
            signature: 'google-signature',
        });
    });

    it.each([
        null,
        { provider: 'future', signature: 'signature' },
        { provider: 'google', signature: '' },
        { provider: 'google' },
    ])('treats invalid or legacy value %j as absent', (value) => {
        expect(parseStoredAiAgentToolCallProviderMetadata(value)).toBeNull();
    });
});
