import { describe, expect, it } from 'vitest';
import { overlayOrgProviderApiKeys } from '../ee/services/ai/OrgAiCopilotConfigResolver';
import {
    hasConfiguredAiModel,
    isAiCopilotAvailable,
    type AiCopilotAvailabilityConfig,
} from './aiCopilotAvailability';
import { lightdashConfigMock } from './lightdashConfig.mock';

const anthropic = {
    apiKey: 'sk-ant-instance',
    modelName: 'claude-sonnet-5-5',
    customHeaders: {},
    supportsStreaming: true,
    supportsContextManagement: true,
};

const bedrockOrgKeys = {
    bedrock: {
        apiKey: 'org-bedrock-key',
        region: 'eu-west-1',
        allowedModels: ['claude-sonnet-4-5'],
    },
};

const instanceConfig = (
    overrides: Partial<AiCopilotAvailabilityConfig> = {},
): typeof lightdashConfigMock.ai.copilot => ({
    ...lightdashConfigMock.ai.copilot,
    enabled: true,
    defaultProvider: 'anthropic',
    providers: { anthropic },
    ...overrides,
});

describe('hasConfiguredAiModel', () => {
    it('is true when the default provider has credentials', () => {
        expect(hasConfiguredAiModel(instanceConfig())).toBe(true);
    });

    it('is false when no provider is configured', () => {
        expect(hasConfiguredAiModel(instanceConfig({ providers: {} }))).toBe(
            false,
        );
    });

    it('is false when only a non-default provider is configured', () => {
        // AI_DEFAULT_PROVIDER falls back to openai; a key for another provider
        // alone does not configure a model.
        expect(
            hasConfiguredAiModel(instanceConfig({ defaultProvider: 'openai' })),
        ).toBe(false);
    });

    it('is true for an org that brings its own Bedrock key without an instance provider', () => {
        const resolved = overlayOrgProviderApiKeys(
            instanceConfig({ providers: {} }),
            bedrockOrgKeys,
        );
        expect(hasConfiguredAiModel(resolved)).toBe(true);
    });

    it('is true when an org key for a configured provider switches the default to it', () => {
        const resolved = overlayOrgProviderApiKeys(
            instanceConfig({ defaultProvider: 'openai' }),
            { anthropic: 'sk-ant-org' },
        );
        expect(resolved.defaultProvider).toBe('anthropic');
        expect(hasConfiguredAiModel(resolved)).toBe(true);
    });

    it('ignores an org key for a provider the instance does not run', () => {
        const resolved = overlayOrgProviderApiKeys(
            instanceConfig({ providers: {} }),
            { anthropic: 'sk-ant-org' },
        );
        expect(hasConfiguredAiModel(resolved)).toBe(false);
    });
});

describe('isAiCopilotAvailable', () => {
    it('is available with a valid licence, AI enabled and a model', () => {
        expect(
            isAiCopilotAvailable({
                licenseValid: true,
                config: instanceConfig(),
            }),
        ).toBe(true);
    });

    it('is unavailable without a valid licence', () => {
        expect(
            isAiCopilotAvailable({
                licenseValid: false,
                config: instanceConfig(),
            }),
        ).toBe(false);
    });

    it('is unavailable when AI is not enabled on the instance', () => {
        expect(
            isAiCopilotAvailable({
                licenseValid: true,
                config: instanceConfig({ enabled: false }),
            }),
        ).toBe(false);
    });

    it('is unavailable without a configured model', () => {
        expect(
            isAiCopilotAvailable({
                licenseValid: true,
                config: instanceConfig({ providers: {} }),
            }),
        ).toBe(false);
    });
});
