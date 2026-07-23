import { AiOrganizationSettings } from '@lightdash/common';
import {
    AiOrganizationSettingsService,
    areReviewsEnabledForSettings,
    findUnconfiguredProviderKeyWrites,
    maskProviderKeyExposure,
} from './AiOrganizationSettingsService';

const settingsWithKeys: AiOrganizationSettings = {
    organizationUuid: 'org-uuid',
    aiAgentsVisible: true,
    aiAgentReviewsEnabled: false,
    mcpContentWritesEnabled: true,
    requireExplicitSlackChannelLinking: false,
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
    const on = { aiAgentReviewsEnabled: true };
    const noByo = { hasActiveByoKey: false, canJudgeOnByoKey: false };

    it('returns false when there are no settings', () => {
        expect(areReviewsEnabledForSettings(null, noByo)).toBe(false);
    });

    it('returns false when reviews are off', () => {
        expect(
            areReviewsEnabledForSettings(
                { aiAgentReviewsEnabled: false },
                noByo,
            ),
        ).toBe(false);
    });

    it('returns true when reviews are on and no BYO key is active', () => {
        expect(areReviewsEnabledForSettings(on, noByo)).toBe(true);
    });

    it('pauses reviews when a BYO key cannot serve the review model', () => {
        expect(
            areReviewsEnabledForSettings(on, {
                hasActiveByoKey: true,
                canJudgeOnByoKey: false,
            }),
        ).toBe(false);
    });

    it('keeps reviews on when the BYO key can serve the review model', () => {
        expect(
            areReviewsEnabledForSettings(on, {
                hasActiveByoKey: true,
                canJudgeOnByoKey: true,
            }),
        ).toBe(true);
    });
});

describe('isExplicitSlackChannelLinkingRequired', () => {
    const buildService = (settings: AiOrganizationSettings | null) =>
        new AiOrganizationSettingsService({
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue(settings),
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

    it('returns false when the organization has no settings row', async () => {
        const service = buildService(null);
        await expect(
            service.isExplicitSlackChannelLinkingRequired('org-uuid'),
        ).resolves.toBe(false);
    });

    it('returns false when the setting is off', async () => {
        const service = buildService({
            ...settingsWithKeys,
            requireExplicitSlackChannelLinking: false,
        });
        await expect(
            service.isExplicitSlackChannelLinkingRequired('org-uuid'),
        ).resolves.toBe(false);
    });

    it('returns true when the setting is on', async () => {
        const service = buildService({
            ...settingsWithKeys,
            requireExplicitSlackChannelLinking: true,
        });
        await expect(
            service.isExplicitSlackChannelLinkingRequired('org-uuid'),
        ).resolves.toBe(true);
    });
});
