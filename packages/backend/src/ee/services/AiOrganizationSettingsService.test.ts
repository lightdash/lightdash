import { AiOrganizationSettings } from '@lightdash/common';
import type { ModelPreset, ModelPresetProvider } from './ai/models/presets';
import {
    areReviewsEnabledForSettings,
    findUnconfiguredProviderKeyWrites,
    isModelConfigAvailable,
    maskProviderKeyExposure,
    pickReplacementDefaultModelConfig,
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

const preset = (
    name: string,
    modelId: string,
    supportsReasoning = true,
): ModelPreset<ModelPresetProvider> =>
    ({
        name,
        provider: 'anthropic',
        modelId,
        displayName: name,
        description: '',
        contextWindowTokens: 200000,
        supportsReasoning,
        callOptions: {},
        providerOptions: undefined,
    }) as ModelPreset<ModelPresetProvider>;

// Mirrors the real presets, where modelId is a dated variant of name.
const SONNET = preset('claude-sonnet-4-5', 'claude-sonnet-4-5-20250929');
const HAIKU = preset('claude-haiku-4-5', 'claude-haiku-4-5-20251001');
const NO_REASONING = preset('claude-legacy', 'claude-legacy', false);

describe('isModelConfigAvailable', () => {
    it('matches a default stored as the preset name', () => {
        expect(
            isModelConfigAvailable(
                { modelName: 'claude-sonnet-4-5', modelProvider: 'anthropic' },
                [SONNET, HAIKU],
            ),
        ).toBe(true);
    });

    // An exact-name comparison would miss this and silently wipe the default
    // on every visibility update.
    it('matches a default stored as the dated model id', () => {
        expect(
            isModelConfigAvailable(
                {
                    modelName: 'claude-sonnet-4-5-20250929',
                    modelProvider: 'anthropic',
                },
                [SONNET, HAIKU],
            ),
        ).toBe(true);
    });

    it('does not match once the model is filtered out', () => {
        expect(
            isModelConfigAvailable(
                { modelName: 'claude-sonnet-4-5', modelProvider: 'anthropic' },
                [HAIKU],
            ),
        ).toBe(false);
    });

    it('does not match the same model name under another provider', () => {
        expect(
            isModelConfigAvailable(
                { modelName: 'claude-sonnet-4-5', modelProvider: 'openai' },
                [SONNET],
            ),
        ).toBe(false);
    });
});

describe('pickReplacementDefaultModelConfig', () => {
    const previous = {
        modelName: 'claude-sonnet-4-5',
        modelProvider: 'anthropic',
        reasoning: true,
    };

    it('prefers the instance default when it survived the filter', () => {
        expect(
            pickReplacementDefaultModelConfig(
                [SONNET, HAIKU],
                { name: 'claude-haiku-4-5', provider: 'anthropic' },
                previous,
            ),
        ).toEqual({
            modelName: 'claude-haiku-4-5',
            modelProvider: 'anthropic',
            reasoning: true,
        });
    });

    // The whole point of returning a concrete model: visibility filters
    // listings only, so falling through to the instance default could resolve
    // to the very model the org just restricted.
    it('falls back to a remaining model when the instance default was filtered out', () => {
        expect(
            pickReplacementDefaultModelConfig(
                [HAIKU],
                { name: 'claude-sonnet-4-5', provider: 'anthropic' },
                previous,
            ),
        ).toEqual({
            modelName: 'claude-haiku-4-5',
            modelProvider: 'anthropic',
            reasoning: true,
        });
    });

    it('drops the reasoning preference on a model that cannot support it', () => {
        expect(
            pickReplacementDefaultModelConfig([NO_REASONING], null, previous),
        ).toEqual({
            modelName: 'claude-legacy',
            modelProvider: 'anthropic',
            reasoning: undefined,
        });
    });

    it('returns null when nothing remains', () => {
        expect(
            pickReplacementDefaultModelConfig([], null, previous),
        ).toBeNull();
    });
});
