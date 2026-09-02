import type {
    AiOrganizationSettings,
    AiOrgModelVisibility,
} from '@lightdash/common';
import { vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
import { filterModelsForOrg, getAvailableModels } from './models';
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
    threadDumpEnabled: false,
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

const bothProvidersConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    threadDumpEnabled: false,
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
        anthropic: { apiKey: 'instance-anthropic-key' },
    },
});

const allByoProvidersConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...bothProvidersConfig,
    providers: {
        ...bothProvidersConfig.providers,
        google: {
            apiKey: 'instance-google-key',
            modelName: 'gemini-3.7-flash',
        },
    },
});

const anthropicGatewayConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...bothProvidersConfig,
    providers: {
        ...bothProvidersConfig.providers,
        anthropic: {
            ...bothProvidersConfig.providers.anthropic,
            baseUrl: 'https://llm-gateway.example',
        },
    },
});

const googleGatewayConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    ...allByoProvidersConfig,
    providers: {
        ...allByoProvidersConfig.providers,
        google: {
            ...allByoProvidersConfig.providers.google,
            baseUrl: 'https://gemini-gateway.example/v1beta',
        },
    },
});

const bedrockConfig: CopilotConfig = aiCopilotConfigSchema.parse({
    enabled: true,
    requiresFeatureFlag: false,
    telemetryEnabled: false,
    threadDumpEnabled: false,
    debugLoggingEnabled: false,
    askAiButtonEnabled: false,
    embeddingEnabled: false,
    maxQueryLimit: 100,
    runSqlMaxLimit: 100,
    defaultProvider: 'bedrock',
    defaultEmbeddingModelProvider: 'openai',
    providers: {
        bedrock: {
            apiKey: 'instance-bedrock-key',
            region: 'us-east-2',
        },
    },
});

describe('overlayOrgProviderApiKeys', () => {
    it('switches the default provider to the org key when the instance default is not BYO-supplied', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            anthropic: 'org-anthropic-key',
        });
        // Anthropic-only BYO key + instance default "openai" would otherwise
        // resolve auxiliary AI to the instance OpenAI key — switch to anthropic.
        expect(result.defaultProvider).toBe('anthropic');
        expect(result.providers.anthropic?.apiKey).toBe('org-anthropic-key');
    });

    it('keeps the default provider when the org supplied a key for it', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            openai: 'org-openai-key',
        });
        expect(result.defaultProvider).toBe('openai');
    });

    it('keeps the default provider when the org keyed both providers', () => {
        const result = overlayOrgProviderApiKeys(bothProvidersConfig, {
            anthropic: 'org-anthropic-key',
            openai: 'org-openai-key',
        });
        expect(result.defaultProvider).toBe('openai');
    });

    it('records byoProviders for each overlaid org key', () => {
        expect(
            overlayOrgProviderApiKeys(bothProvidersConfig, {
                anthropic: 'org-anthropic-key',
            }).byoProviders,
        ).toEqual(['anthropic']);
        expect(
            overlayOrgProviderApiKeys(bothProvidersConfig, {
                anthropic: 'org-anthropic-key',
                openai: 'org-openai-key',
            }).byoProviders.sort(),
        ).toEqual(['anthropic', 'openai']);
    });

    it('omits from byoProviders any key the instance has not configured', () => {
        // baseConfig has no anthropic provider, so an anthropic org key is not
        // overlaid and must not count as self-managed.
        expect(
            overlayOrgProviderApiKeys(baseConfig, {
                anthropic: 'org-anthropic-key',
            }).byoProviders,
        ).toEqual([]);
    });

    it('replaces the apiKey of an instance-configured provider, keeping other settings', () => {
        const result = overlayOrgProviderApiKeys(baseConfig, {
            openai: 'org-openai-key',
        });
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        expect(result.providers.openai?.modelName).toBe('gpt-5.4');
        expect(result.defaultProvider).toBe('openai');
    });

    it('overlays a Google key without changing the configured Gemini model', () => {
        const result = overlayOrgProviderApiKeys(allByoProvidersConfig, {
            google: 'org-google-key',
        });

        expect(result.providers.google?.apiKey).toBe('org-google-key');
        expect(result.providers.google?.modelName).toBe('gemini-3.7-flash');
        expect(result.defaultProvider).toBe('google');
        expect(result.byoProviders).toEqual(['google']);
    });

    it('rejects an organization Anthropic key when the instance uses an Anthropic gateway', () => {
        expect(() =>
            overlayOrgProviderApiKeys(anthropicGatewayConfig, {
                anthropic: 'org-anthropic-key',
            }),
        ).toThrow('Organization Anthropic API keys cannot be used');
    });

    it('rejects an organization Google key when the instance uses a Gemini gateway without exposing the key', () => {
        const orgKey = 'full-fake-org-google-secret';

        try {
            overlayOrgProviderApiKeys(googleGatewayConfig, {
                google: orgKey,
            });
            throw new Error('Expected Gemini gateway conflict');
        } catch (error) {
            if (!(error instanceof Error)) throw error;
            expect(error.message).toContain('GEMINI_BASE_URL');
            expect(error.message).not.toContain(orgKey);
        }
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
    it('hides every unkeyed BYO provider when an Anthropic key exists', () => {
        expect(
            resolveEffectiveModelVisibility({ anthropic: 'sk-ant-x' }, null),
        ).toEqual({
            google: { enabled: false },
            openai: { enabled: false },
        });
    });

    it('still hides Google when Anthropic and OpenAI keys are present', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x', openai: 'sk-x' },
                null,
            ),
        ).toEqual({ google: { enabled: false } });
    });

    it('hides Anthropic and Google with only an OpenAI key', () => {
        expect(
            resolveEffectiveModelVisibility({ openai: 'sk-x' }, null),
        ).toEqual({
            anthropic: { enabled: false },
            google: { enabled: false },
        });
    });

    it('hides Anthropic and OpenAI with only a Google key', () => {
        expect(
            resolveEffectiveModelVisibility({ google: 'google-key' }, null),
        ).toEqual({
            anthropic: { enabled: false },
            openai: { enabled: false },
        });
    });

    it('lets explicit stored visibility override the implicit hide', () => {
        expect(
            resolveEffectiveModelVisibility(
                { anthropic: 'sk-ant-x' },
                { openai: { enabled: true } },
            ),
        ).toEqual({
            google: { enabled: false },
            openai: { enabled: true },
        });
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
            google: { enabled: false },
            openai: { enabled: false },
            anthropic: { enabled: true, allowedModels: ['claude-opus-4-8'] },
        });
    });
});

describe('OrgAiCopilotConfigResolver', () => {
    type ResolverOptions = {
        orgKeys?: AiOrgProviderApiKeys | null;
        modelVisibility?: AiOrgModelVisibility | null;
        accessibleModelIds?: string[] | null;
        instanceConfig?: CopilotConfig;
    };

    const makeResolver = ({
        orgKeys = { openai: 'org-openai-key' },
        modelVisibility = null,
        accessibleModelIds = null,
        instanceConfig = baseConfig,
    }: ResolverOptions = {}) =>
        new OrgAiCopilotConfigResolver({
            lightdashConfig: {
                ai: { copilot: instanceConfig },
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
            aiModelCatalog: {
                getAccessibleModelIds: vi
                    .fn()
                    .mockResolvedValue(accessibleModelIds),
            } as Pick<
                AiModelCatalog,
                'getAccessibleModelIds'
            > as AiModelCatalog,
        });

    it('overlays org keys onto the instance config', async () => {
        const result = await makeResolver().getCopilotConfig('org-uuid');
        expect(result.providers.openai?.apiKey).toBe('org-openai-key');
    });

    it('uses configured Anthropic models without probing a gateway catalog', async () => {
        const resolver = makeResolver({
            accessibleModelIds: null,
        });

        expect(
            await resolver.getAccessibleModelIds('anthropic', 'gateway-token', {
                baseUrl: 'https://llm-gateway.example',
                availableModels: ['claude-sonnet-4-6'],
            }),
        ).toEqual(['claude-sonnet-4-6']);
    });

    describe('getClaudeCodeConfig', () => {
        it('returns the instance config unchanged without an organization uuid', async () => {
            const result = await makeResolver({
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig(null);
            expect(result.defaultProvider).toBe('openai');
            expect(result.providers.anthropic?.apiKey).toBe(
                'instance-anthropic-key',
            );
        });

        it('returns the instance config unchanged when the org has no keys', async () => {
            const result = await makeResolver({
                orgKeys: null,
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            expect(result.providers.anthropic?.apiKey).toBe(
                'instance-anthropic-key',
            );
        });

        it('runs a BYO org on its own Anthropic key and forces the Anthropic provider', async () => {
            const result = await makeResolver({
                orgKeys: { anthropic: 'org-anthropic-key' },
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            expect(result.defaultProvider).toBe('anthropic');
            expect(result.providers.anthropic?.apiKey).toBe(
                'org-anthropic-key',
            );
        });

        it('never leaks the instance Anthropic key to a BYO org that only keyed OpenAI', async () => {
            const result = await makeResolver({
                orgKeys: { openai: 'org-openai-key' },
                instanceConfig: bothProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');
            // Anthropic is stripped, so key resolution fails loudly rather than
            // silently billing the instance — the sandbox can't run a Claude
            // turn on the instance key.
            expect(result.providers.anthropic).toBeUndefined();
            expect(result.defaultProvider).toBe('anthropic');
        });

        it('fails closed for Claude Code when the org only keyed Google', async () => {
            const result = await makeResolver({
                orgKeys: { google: 'org-google-key' },
                instanceConfig: allByoProvidersConfig,
            }).getClaudeCodeConfig('org-uuid');

            expect(result.providers.anthropic).toBeUndefined();
            expect(result.defaultProvider).toBe('anthropic');
        });
    });

    describe('getCodexConfig', () => {
        it('keeps instance Bedrock as the managed Codex provider', async () => {
            const result = await makeResolver({
                orgKeys: null,
                instanceConfig: bedrockConfig,
            }).getCodexConfig('org-uuid');
            expect(result.defaultProvider).toBe('bedrock');
            expect(result.providers.bedrock?.region).toBe('us-east-2');
        });

        it('returns the instance config unchanged without an organization uuid', async () => {
            const result = await makeResolver({
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig(null);
            expect(result.providers.openai?.apiKey).toBe('instance-openai-key');
        });

        it('runs a BYO org on its own OpenAI key', async () => {
            const result = await makeResolver({
                orgKeys: { openai: 'org-openai-key' },
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig('org-uuid');
            expect(result.defaultProvider).toBe('openai');
            expect(result.providers.openai?.apiKey).toBe('org-openai-key');
        });

        it('never leaks the instance OpenAI key to a BYO org that only keyed Anthropic', async () => {
            const result = await makeResolver({
                orgKeys: { anthropic: 'org-anthropic-key' },
                instanceConfig: bothProvidersConfig,
            }).getCodexConfig('org-uuid');
            expect(result.providers.openai).toBeUndefined();
            expect(result.defaultProvider).toBe('openai');
        });

        it('fails closed for Codex when the org only keyed Google', async () => {
            const result = await makeResolver({
                orgKeys: { google: 'org-google-key' },
                instanceConfig: allByoProvidersConfig,
            }).getCodexConfig('org-uuid');

            expect(result.providers.openai).toBeUndefined();
            expect(result.defaultProvider).toBe('openai');
        });
    });

    describe('resolveEffectiveModelVisibilityForOrg', () => {
        it('merges the implicit auto-hide under the submitted visibility', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant' },
            });
            const effective =
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    { anthropic: { enabled: false } },
                );
            expect(effective).toEqual({
                google: { enabled: false },
                openai: { enabled: false },
                anthropic: { enabled: false },
            });
        });

        it('blocks the lockout: an anthropic-only org disabling anthropic leaves no models', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant' },
            });
            const effective =
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    { anthropic: { enabled: false } },
                );
            const remaining = filterModelsForOrg(
                getAvailableModels(baseConfig),
                {
                    modelVisibility: effective,
                    keyAccessibleModelIds: null,
                },
            );
            expect(remaining).toHaveLength(0);
        });

        it('validating the raw submission (the old bug) would have left instance models', () => {
            const remaining = filterModelsForOrg(
                getAvailableModels(baseConfig),
                {
                    modelVisibility: { anthropic: { enabled: false } },
                    keyAccessibleModelIds: null,
                },
            );
            expect(remaining.length).toBeGreaterThan(0);
        });

        it('returns the submission unchanged when the org has no keys', async () => {
            const resolver = makeResolver({
                orgKeys: null,
            });
            const submitted = { openai: { enabled: false } };
            expect(
                await resolver.resolveEffectiveModelVisibilityForOrg(
                    'org-uuid',
                    submitted,
                ),
            ).toEqual(submitted);
        });
    });

    describe('getOrgModelOverrides', () => {
        const none = { modelVisibility: null, keyAccessibleModelIds: null };

        it('returns no overrides without an organization uuid', async () => {
            const resolver = makeResolver();
            expect(await resolver.getOrgModelOverrides(null)).toEqual(none);
        });

        it('returns no overrides without BYO keys (settings become inert)', async () => {
            const resolver = makeResolver({
                orgKeys: null,
                modelVisibility: { openai: { enabled: false } },
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual(
                none,
            );
        });

        it('returns stored visibility and key-accessible ids with an anthropic key', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
            });
        });

        it('auto-hides openai when only an anthropic key is set', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: null,
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
            });
        });

        it('does not query the catalog with only an openai key', async () => {
            const resolver = makeResolver({
                orgKeys: { openai: 'sk-x' },
                modelVisibility: { anthropic: { enabled: true } },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    anthropic: { enabled: true },
                    google: { enabled: false },
                },
                keyAccessibleModelIds: null,
            });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                modelVisibility: { openai: { enabled: false } },
                accessibleModelIds: null,
            });
            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: null },
            });
        });

        it('does not probe a BYO Anthropic key through an instance gateway', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-opus-4-8'],
                instanceConfig: anthropicGatewayConfig,
            });

            expect(await resolver.getOrgModelOverrides('org-uuid')).toEqual({
                modelVisibility: {
                    google: { enabled: false },
                    openai: { enabled: false },
                },
                keyAccessibleModelIds: { anthropic: null },
            });
        });
    });

    describe('getReviewJudgeAvailability', () => {
        const none = { hasActiveByoKey: false, canJudgeOnByoKey: false };

        it('returns no BYO without an organization uuid', async () => {
            const resolver = makeResolver();
            expect(await resolver.getReviewJudgeAvailability(null)).toEqual(
                none,
            );
        });

        it('returns no BYO when there are no keys', async () => {
            const resolver = makeResolver({ orgKeys: null });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual(none);
        });

        it('can judge when the anthropic key serves haiku', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-haiku-4-5-20251001'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: true });
        });

        it('cannot judge when the anthropic key lacks haiku', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-opus-4-8'],
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });

        it('fails closed when the catalog returns null', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: null,
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });

        it('has an active key but cannot judge with only an openai key', async () => {
            const resolver = makeResolver({
                orgKeys: { openai: 'sk-x' },
            });
            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });

        it('does not judge with a BYO Anthropic key through an instance gateway', async () => {
            const resolver = makeResolver({
                orgKeys: { anthropic: 'sk-ant-x' },
                accessibleModelIds: ['claude-haiku-4-5-20251001'],
                instanceConfig: anthropicGatewayConfig,
            });

            expect(
                await resolver.getReviewJudgeAvailability('org-uuid'),
            ).toEqual({ hasActiveByoKey: true, canJudgeOnByoKey: false });
        });
    });
});
