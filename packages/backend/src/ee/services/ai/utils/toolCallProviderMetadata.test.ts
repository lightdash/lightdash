import {
    extractToolCallProviderMetadata,
    toToolCallProviderOptions,
} from './toolCallProviderMetadata';

describe('tool-call provider metadata', () => {
    it('extracts only a non-empty Google signature', () => {
        expect(
            extractToolCallProviderMetadata({
                google: {
                    signature: 'google-signature',
                    interactionId: 'not-persisted',
                },
                openai: { itemId: 'not-persisted' },
            }),
        ).toEqual({
            provider: 'google',
            signature: 'google-signature',
        });
    });

    it('drops missing, unknown, and empty metadata', () => {
        expect(extractToolCallProviderMetadata(undefined)).toBeNull();
        expect(
            extractToolCallProviderMetadata({ openai: { itemId: 'id' } }),
        ).toBeNull();
        expect(
            extractToolCallProviderMetadata({ google: { signature: '' } }),
        ).toBeNull();
    });

    it('converts stored Google metadata into replay provider options', () => {
        expect(
            toToolCallProviderOptions({
                provider: 'google',
                signature: 'google-signature',
            }),
        ).toEqual({ google: { signature: 'google-signature' } });
        expect(toToolCallProviderOptions(null)).toBeUndefined();
    });
});
