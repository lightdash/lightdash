import { ParameterError } from '@lightdash/common';
import {
    applyProviderApiKeyUpdates,
    buildProviderApiKeyHint,
    buildProviderApiKeyHints,
    buildProviderApiKeysSet,
    normalizeProviderApiKeyHints,
    parseAiOrgProviderApiKeys,
} from './AiOrganizationSettingsModel';

describe('applyProviderApiKeyUpdates', () => {
    it('sets a new key and trims whitespace', () => {
        expect(
            applyProviderApiKeyUpdates({}, { anthropic: '  sk-ant-123  ' }),
        ).toEqual({ anthropic: 'sk-ant-123' });
    });

    it('leaves absent providers unchanged', () => {
        expect(
            applyProviderApiKeyUpdates(
                { anthropic: 'sk-ant-old', openai: 'sk-old' },
                { openai: 'sk-new' },
            ),
        ).toEqual({ anthropic: 'sk-ant-old', openai: 'sk-new' });
    });

    it('sets and removes a Google key through the shared provider contract', () => {
        const withGoogle = applyProviderApiKeyUpdates(
            { openai: 'sk-old' },
            { google: '  AIza-fake-gemini-key-1234567890  ' },
        );
        expect(withGoogle).toEqual({
            google: 'AIza-fake-gemini-key-1234567890',
            openai: 'sk-old',
        });
        expect(
            applyProviderApiKeyUpdates(withGoogle, { google: null }),
        ).toEqual({ openai: 'sk-old' });
    });

    it('removes a key on null', () => {
        expect(
            applyProviderApiKeyUpdates(
                { anthropic: 'sk-ant-old', openai: 'sk-old' },
                { anthropic: null },
            ),
        ).toEqual({ openai: 'sk-old' });
    });

    it('throws ParameterError on empty key', () => {
        expect(() => applyProviderApiKeyUpdates({}, { openai: '   ' })).toThrow(
            ParameterError,
        );
    });
});

describe('buildProviderApiKeyHint', () => {
    it('formats an anthropic key like the Anthropic console', () => {
        expect(
            buildProviderApiKeyHint(
                'sk-ant-api03-R2DAbcdefghijklmnopqrstuvwxyz0123456789igAA',
            ),
        ).toBe('sk-ant-api03-R2D...igAA');
    });

    it('formats an openai project key with prefix and last four', () => {
        expect(
            buildProviderApiKeyHint(
                'sk-proj-Abcdefghijklmnopqrstuvwxyz0123456789j3kl',
            ),
        ).toBe('sk-proj-Abc...j3kl');
    });

    it('formats a legacy openai key', () => {
        expect(
            buildProviderApiKeyHint('sk-Abcdefghijklmnopqrstuvwxyz01234j3kl'),
        ).toBe('sk-Abc...j3kl');
    });

    it('degrades safely for short or unknown keys', () => {
        expect(buildProviderApiKeyHint('sk-short')).toBe('sk...');
        expect(buildProviderApiKeyHint('mykey123')).toBe('my...');
    });
});

describe('buildProviderApiKeyHints', () => {
    it('returns null when no keys are set', () => {
        expect(buildProviderApiKeyHints({})).toBeNull();
    });

    it('maps only the providers that are set', () => {
        expect(
            buildProviderApiKeyHints({
                openai: 'sk-proj-Abcdefghijklmnopqrstuvwxyz0123456789j3kl',
            }),
        ).toEqual({
            anthropic: null,
            google: null,
            openai: 'sk-proj-Abc...j3kl',
        });
    });

    it('redacts Google keys and never returns the full credential', () => {
        const key = 'AIza-fake-gemini-key-1234567890';
        const hints = buildProviderApiKeyHints({ google: key });

        expect(hints).toEqual({
            anthropic: null,
            google: 'AIz...7890',
            openai: null,
        });
        expect(JSON.stringify(hints)).not.toContain(key);
    });
});

describe('provider API key read contracts', () => {
    it('keeps known keys when a decrypted blob contains a future provider', () => {
        expect(
            parseAiOrgProviderApiKeys({
                anthropic: 'sk-ant-known',
                future: 'future-provider-key',
            }),
        ).toEqual({ anthropic: 'sk-ant-known' });
    });

    it('normalizes legacy hint rows that predate Google support', () => {
        expect(
            normalizeProviderApiKeyHints({
                anthropic: 'sk-ant...1234',
                openai: null,
            }),
        ).toEqual({
            anthropic: 'sk-ant...1234',
            google: null,
            openai: null,
        });
    });

    it('omits unknown and invalid hint fields from the API contract', () => {
        const unknownSecret = 'FULL-FAKE-SECRET-VALUE';
        const normalized = normalizeProviderApiKeyHints({
            anthropic: 'sk-ant...1234',
            future: unknownSecret,
            google: 42,
        });

        expect(normalized).toEqual({
            anthropic: 'sk-ant...1234',
            google: null,
            openai: null,
        });
        expect(Object.keys(normalized)).toHaveLength(3);
        expect(JSON.stringify(normalized)).not.toContain(unknownSecret);
    });

    it('reports every BYO provider without exposing credentials', () => {
        expect(
            buildProviderApiKeysSet({
                google: 'AIza-fake-gemini-key-1234567890',
            }),
        ).toEqual({ anthropic: false, google: true, openai: false });
    });
});
