import { AiOrganizationSettings } from '@lightdash/common';
import {
    areReviewsEnabledForSettings,
    findUnconfiguredProviderKeyWrites,
    maskProviderKeyExposure,
} from './AiOrganizationSettingsService';

const settingsWithKeys: AiOrganizationSettings = {
    organizationUuid: 'org-uuid',
    aiAgentsVisible: true,
    aiAgentReviewsEnabled: false,
    mcpContentWritesEnabled: true,
    defaultAiAgentModelConfig: null,
    modelVisibility: null,
    providerApiKeysSet: { anthropic: true, openai: false },
    providerApiKeyHints: { anthropic: 'sk-ant-api03-R2D...igAA', openai: null },
};

describe('maskProviderKeyExposure', () => {
    it('returns the settings untouched for org admins', () => {
        expect(maskProviderKeyExposure(settingsWithKeys, true)).toEqual(
            settingsWithKeys,
        );
    });

    it('strips key hints and set-booleans for non-admins', () => {
        const masked = maskProviderKeyExposure(settingsWithKeys, false);
        expect(masked.providerApiKeyHints).toEqual({
            anthropic: null,
            openai: null,
        });
        expect(masked.providerApiKeysSet).toEqual({
            anthropic: false,
            openai: false,
        });
    });

    it('leaves non-key settings intact when masking', () => {
        const masked = maskProviderKeyExposure(settingsWithKeys, false);
        expect(masked.aiAgentsVisible).toBe(true);
        expect(masked.mcpContentWritesEnabled).toBe(true);
        expect(masked.organizationUuid).toBe('org-uuid');
    });
});

describe('findUnconfiguredProviderKeyWrites', () => {
    it('flags setting a key for a provider the instance does not configure', () => {
        expect(
            findUnconfiguredProviderKeyWrites(
                { anthropic: 'sk-ant-123' },
                { openai: {} },
            ),
        ).toEqual(['anthropic']);
    });

    it('allows setting a key for a configured provider', () => {
        expect(
            findUnconfiguredProviderKeyWrites(
                { openai: 'sk-123' },
                { openai: {} },
            ),
        ).toEqual([]);
    });

    it('always allows removing a key (null) regardless of instance config', () => {
        expect(
            findUnconfiguredProviderKeyWrites({ anthropic: null }, {}),
        ).toEqual([]);
    });

    it('ignores providers not present in the update', () => {
        expect(
            findUnconfiguredProviderKeyWrites(
                { openai: 'sk-123' },
                { openai: {} },
            ),
        ).toEqual([]);
    });
});

describe('areReviewsEnabledForSettings', () => {
    const base = {
        aiAgentReviewsEnabled: true,
        providerApiKeysSet: { anthropic: false, openai: false },
    };

    it('returns false when there are no settings', () => {
        expect(areReviewsEnabledForSettings(null)).toBe(false);
    });

    it('returns true when reviews are on and no BYO key is set', () => {
        expect(areReviewsEnabledForSettings(base)).toBe(true);
    });

    it('returns false when reviews are off', () => {
        expect(
            areReviewsEnabledForSettings({
                ...base,
                aiAgentReviewsEnabled: false,
            }),
        ).toBe(false);
    });

    it('disables reviews while a BYO anthropic key is set', () => {
        expect(
            areReviewsEnabledForSettings({
                ...base,
                providerApiKeysSet: { anthropic: true, openai: false },
            }),
        ).toBe(false);
    });

    it('disables reviews while a BYO openai key is set', () => {
        expect(
            areReviewsEnabledForSettings({
                ...base,
                providerApiKeysSet: { anthropic: false, openai: true },
            }),
        ).toBe(false);
    });
});
