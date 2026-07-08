import type {
    AiOrganizationSettings,
    AiOrgModelVisibility,
} from '@lightdash/common';
import { vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
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
    type ResolverOptions = {
        flagEnabled: boolean;
        orgKeys?: AiOrgProviderApiKeys | null;
        modelVisibility?: AiOrgModelVisibility | null;
        accessibleModelIds?: string[] | null;
    };

    const makeResolver = ({
        flagEnabled,
        orgKeys = { openai: 'org-openai-key' },
        modelVisibility = null,
        accessibleModelIds = null,
    }: ResolverOptions) =>
        new OrgAiCopilotConfigResolver({
            lightdashConfig: {
                ai: { copilot: baseConfig },
            } as LightdashConfig,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: vi
                    .fn()
                    .mockResolvedValue(orgKeys),
                findByOrganizationUuid: vi.fn().mockResolvedValue({
                    modelVisibility,
                } as AiOrganizationSettings),
            } as Pick<
                AiOrganizationSettingsModel,
                'findDecryptedProviderApiKeys' | 'findByOrganizationUuid'
            > as AiOrganizationSettingsModel,
            featureFlagService: {
                get: vi.fn().mockResolvedValue({
                    id: 'org-ai-provider-api-keys',
                    enabled: flagEnabled,
                }),
            } as Pick<FeatureFlagService, 'get'> as FeatureFlagService,
            aiModelCatalog: {
                getAccessibleModelIds: vi
                    .fn()
                    .mockResolvedValue(accessibleModelIds),
            } as Pick<
                AiModelCatalog,
                'getAccessibleModelIds'
            > as AiModelCatalog,
        });

    it('returns the base config untouched when the feature flag is off', async () => {
        const result = await makeResolver({
            flagEnabled: false,
        }).getCopilotConfig('org-uuid');
        expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
    });

    it('overlays org keys when the feature flag is on', async () => {
        const result = await makeResolver({
            flagEnabled: true,
        }).getCopilotConfig('org-uuid');
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
    });

    describe('getOrgModelOverrides', () => {
        const none = { modelVisibility: null, keyAccessibleModelIds: null };

        it('returns no overrides without an organization uuid', async () => {
            const resolver = makeResolver({ flagEnabled: true });
            expect(await resolver.getOrgModelOverrides(null)).toEqual(none);
        });

        it('returns no overrides when the feature flag is off', async () => {
            const resolver = makeResolver({
                flagEnabled: false,
                modelVisibility: { openai: { enabled: false } },
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual(
                none,
            );
        });

        it('returns no overrides without BYO keys (settings become inert)', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: null,
                modelVisibility: { openai: { enabled: false } },
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual(
                none,
            );
        });

        it('returns stored visibility and key-accessible ids with an anthropic key', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: { openai: { enabled: false } },
                keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
            });
        });

        it('does not query the catalog with only an openai key', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { openai: 'sk-x' },
                modelVisibility: { anthropic: { enabled: true } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: { anthropic: { enabled: true } },
                keyAccessibleModelIds: null,
            });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: null,
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: { openai: { enabled: false } },
                keyAccessibleModelIds: { anthropic: null },
            });
        });
    });
});
