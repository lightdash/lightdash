import { AiOrganizationSettings } from '@lightdash/common';
import {
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
