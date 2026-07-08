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
    resolveEffectiveModelVisibility,
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

describe('resolveEffectiveModelVisibility', () => {
    it('hides openai when a BYO anthropic key exists but no openai key', () => {
        expect(
            resolveEffectiveModelVisibility({ anthropic: 'sk-ant-x' }, null),
        ).toEqual({ openai: { enabled: false } });
    });

    it('does not hide openai when both keys are present', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x', openai: 'sk-x' },
                null,
            ),
        ).toBeNull();
    });

    it('does not hide anything with only an openai key', () => {
        expect(
            resolveEffectiveModelVisibility({ openai: 'sk-x' }, null),
        ).toBeNull();
    });

    it('lets explicit stored visibility override the implicit hide', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x' },
                { openai: { enabled: true } },
            ),
        ).toEqual({ openai: { enabled: true } });
    });

    it('keeps stored visibility for other providers alongside the implicit hide', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x' },
                {
                    anthropic: {
                        enabled: true,
                        allowedModels: ['claude-opus-4-8'],
                    },
                },
            ),
        ).toEqual({
            openai: { enabled: false },
            anthropic: { enabled: true, allowedModels: ['claude-opus-4-8'] },
        });
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

        it('auto-hides openai when only an anthropic key is set', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: null,
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

    describe('getReviewJudgeAvailability', () => {
        const none = { hasActiveByoKey: false, canJudgeOnByoKey: false };

        it('returns no BYO without an organization uuid', async () => {
            const resolver = makeResolver({ flagEnabled: true });
            expect(await resolver.getReviewJudgeAvailability(null)).toEqual(
                none,
            );
        });

        it('returns no BYO when the flag is off', async () => {
            const resolver = makeResolver({
                flagEnabled: false,
                orgKeys: { anthropic: 'sk-ant-x' },
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual(none);
        });

        it('returns no BYO when there are no keys', async () => {
            const resolver = makeResolver({ flagEnabled: true, orgKeys: null });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual(none);
        });

        it('can judge when the anthropic key serves haiku', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-haiku-4-5-20251001'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: true });
        });

        it('cannot judge when the anthropic key lacks haiku', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: null,
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });

        it('has an active key but cannot judge with only an openai key', async () => {
            const resolver = makeResolver({
                flagEnabled: true,
                orgKeys: { openai: 'sk-x' },
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });
    });
});
