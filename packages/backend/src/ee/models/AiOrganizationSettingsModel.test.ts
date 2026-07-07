import { ParameterError } from '@lightdash/common';
import {
    applyProviderApiKeyUpdates,
    buildProviderApiKeyHint,
    buildProviderApiKeyHints,
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
        ).toEqual({ anthropic: null, openai: 'sk-proj-Abc...j3kl' });
    });
});
