import { vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { AiOrganizationSettingsModel } from '../../models/AiOrganizationSettingsModel';
import {
    OrgAiCopilotConfigResolver,
    overlayOrgProviderApiKeys,
    type CopilotConfig,
} from './OrgAiCopilotConfigResolver';

const baseConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    debugLoggingEnabled: false,
    askAiButtonEnabled: false,
    embeddingEnabled: false,
    maxQueryLimit: 100,
    runSqlMaxLimit: 100,
    defaultProvider: 'openai',
    defaultEmbeddingModelProvider: 'openai',
    providers: {
        openai: {
            apiKey: 'instance-openai-key',
            modelName: 'gpt-5.4',
            embeddingModelName: 'text-embedding-3-small',
            zeroDataRetention: false,
        },
    },
});

describe('overlayOrgProviderApiKeys', () => {
    it('replaces the apiKey of an instance-configured provider, keeping other settings', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            openai: 'org-openai-key',
        });
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        expect(result.providers.openai?.modelName).toBe('gpt-5.4');
        expect(result.defaultProvider).toBe('openai');
    });

    it('ignores a key for a provider the instance has not configured', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            anthropic: 'org-anthropic-key',
        });
        // No instance anthropic provider → nothing to override, key is dropped
        // here (the write path rejects such keys before they are stored).
        expect(result.providers.anthropic).toBeUndefined();
        expect(result.defaultProvider).toBe('openai');
    });

    it('does not mutate the base config', () => {
        overlayOrgProviderApiKeys(baseConfig, { openai: 'org-openai-key' });
        expect(baseConfig.providers.openai?.apiKey).toBe('instance-openai-key');
    });

    it('leaves the config untouched when the org has no keys', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {});
        expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
        expect(result.defaultProvider).toBe('openai');
    });
});

describe('OrgAiCopilotConfigResolver', () => {
    const makeResolver = (flagEnabled: boolean) =>
        new OrgAiCopilotConfigResolver({
            lightdashConfig: {
                ai: { copilot: baseConfig },
            } as LightdashConfig,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: vi
                    .fn()
                    .mockResolvedValue({ openai: 'org-openai-key' }),
            } as Pick<
                AiOrganizationSettingsModel,
                'findDecryptedProviderApiKeys'
            > as AiOrganizationSettingsModel,
            featureFlagService: {
                get: vi.fn().mockResolvedValue({
                    id: 'org-ai-provider-api-keys',
                    enabled: flagEnabled,
                }),
            } as Pick<FeatureFlagService, 'get'> as FeatureFlagService,
        });

    it('returns the base config untouched when the feature flag is off', async () => {
        const result = await makeResolver(false).getCopilotConfig('org-uuid');
        expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
    });

    it('overlays org keys when the feature flag is on', async () => {
        const result = await makeResolver(true).getCopilotConfig('org-uuid');
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
    });
});
