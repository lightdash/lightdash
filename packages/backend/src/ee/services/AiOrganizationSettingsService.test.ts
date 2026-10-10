import { Ability } from '@casl/ability';
import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AiOrganizationSettings,
    DATA_APP_ANALYSIS_DEFAULT_LIMITS,
    ParameterError,
} from '@lightdash/common';
import {
    fromOauth,
    fromSession,
    toSessionUser,
} from '../../auth/account/account';
import { aiCopilotConfigSchema } from '../../config/aiConfigSchema';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ModelPreset, ModelPresetProvider } from './ai/models/presets';
import {
    AiOrganizationSettingsService,
    areReviewsEnabledForSettings,
    findBaseUrlRemovalsBlockedByInstanceGateway,
    findUnconfiguredProviderKeyWrites,
    isModelConfigAvailable,
    pickReplacementDefaultModelConfig,
    validateDataAppAnalysisLimits,
    validateDeepResearchLimits,
} from './AiOrganizationSettingsService';

const settingsWithKeys: AiOrganizationSettings = {
    organizationUuid: 'org-uuid',
    aiAgentsVisible: true,
    aiAgentReviewsEnabled: false,
    aiAgentMemoryEnabled: false,
    deepResearchLimits: AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    deepResearchRawSqlEnabled: false,
    mcpContentWritesEnabled: true,
    mcpAgentsEnabled: true,
    requireExplicitSlackChannelLinking: false,
    defaultAiAgentModelConfig: null,
    modelVisibility: null,
    providerApiKeysSet: {
        anthropic: true,
        google: false,
        openai: false,
        bedrock: false,
    },
    providerApiKeyHints: {
        anthropic: 'sk-ant-api03-R2D...igAA',
        google: null,
        openai: null,
        bedrock: null,
    },
    bedrockConfig: null,
    providerBaseUrls: { anthropic: null, google: null, openai: null },
};

describe('validateDeepResearchLimits', () => {
    it('accepts the default limits', () => {
        expect(() =>
            validateDeepResearchLimits(AI_DEEP_RESEARCH_DEFAULT_LIMITS),
        ).not.toThrow();
    });

    it('allows positive integer values in unrecognized fields', () => {
        const limits = { ...AI_DEEP_RESEARCH_DEFAULT_LIMITS, extraLimit: 1 };

        expect(() => validateDeepResearchLimits(limits)).not.toThrow();
    });

    it.each([0, -1, 1.5, 'invalid'])(
        'rejects invalid values in unrecognized fields: %s',
        (extraLimit) => {
            const limits = { ...AI_DEEP_RESEARCH_DEFAULT_LIMITS, extraLimit };

            expect(() => validateDeepResearchLimits(limits)).toThrow(
                'extraLimit must be a positive integer',
            );
        },
    );

    it.each([
        ['maxTokens', 0],
        ['maxToolCalls', -1],
        ['maxWarehouseQueries', 0],
        ['maxSteps', 2.5],
        ['deadlineMs', 0],
    ] as const)('rejects invalid %s', (key, value) => {
        expect(() =>
            validateDeepResearchLimits({
                ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                [key]: value,
            }),
        ).toThrow(ParameterError);
    });
});

describe('validateDataAppAnalysisLimits', () => {
    it('accepts the defaults and uncapped days', () => {
        expect(() =>
            validateDataAppAnalysisLimits(DATA_APP_ANALYSIS_DEFAULT_LIMITS),
        ).not.toThrow();
        expect(() =>
            validateDataAppAnalysisLimits({
                ...DATA_APP_ANALYSIS_DEFAULT_LIMITS,
                dailyDetectCap: null,
                dailyInvestigateCap: null,
            }),
        ).not.toThrow();
    });

    it.each([
        ['investigateMaxSteps', null],
        ['investigateMaxSteps', 0],
        ['investigateMaxWarehouseQueries', 2.5],
        ['investigateMaxWarehouseQueries', 201],
        ['dailyDetectCap', 0],
        ['dailyInvestigateCap', -1],
    ] as const)('rejects %s = %s', (key, value) => {
        expect(() =>
            validateDataAppAnalysisLimits({
                ...DATA_APP_ANALYSIS_DEFAULT_LIMITS,
                [key]: value,
            }),
        ).toThrow(ParameterError);
    });

    it('rejects unknown limit keys', () => {
        expect(() =>
            validateDataAppAnalysisLimits({
                ...DATA_APP_ANALYSIS_DEFAULT_LIMITS,
                extra: 1,
            } as never),
        ).toThrow('Unknown limit extra');
    });
});

describe('findBaseUrlRemovalsBlockedByInstanceGateway', () => {
    const { providers } = aiCopilotConfigSchema.parse({
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
            anthropic: {
                apiKey: 'instance-anthropic-key',
                baseUrl: 'https://llm-gateway.example',
            },
            google: { apiKey: 'instance-google-key' },
            openai: {
                apiKey: 'instance-openai-key',
                baseUrl: 'https://openai-gateway.example',
            },
        },
    });

    it('blocks clearing an Anthropic or Google URL when the instance has a gateway', () => {
        expect(
            findBaseUrlRemovalsBlockedByInstanceGateway(
                { providerBaseUrls: { anthropic: null, google: null } },
                providers,
            ),
        ).toEqual(['anthropic']);
    });

    it('never blocks OpenAI, setting a URL, or removing the key itself', () => {
        expect(
            findBaseUrlRemovalsBlockedByInstanceGateway(
                {
                    anthropic: null,
                    providerBaseUrls: {
                        openai: null,
                        anthropic: 'https://litellm.example.com',
                    },
                },
                providers,
            ),
        ).toEqual([]);
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

    it('applies the same configured-provider guard to Google keys', () => {
        expect(
            findUnconfiguredProviderKeyWrites(
                { google: 'AIza-fake-gemini-key' },
                { openai: {} },
            ),
        ).toEqual(['google']);
        expect(
            findUnconfiguredProviderKeyWrites(
                { google: 'AIza-fake-gemini-key' },
                { google: {} },
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
    const noByo = {
        hasActiveByoKey: false,
        canJudgeOnByoKey: false,
        byoJudgeProvider: null,
    };

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
                byoJudgeProvider: null,
            }),
        ).toBe(false);
    });

    it('keeps reviews on when the BYO key can serve the review model', () => {
        expect(
            areReviewsEnabledForSettings(on, {
                hasActiveByoKey: true,
                canJudgeOnByoKey: true,
                byoJudgeProvider: 'anthropic',
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

describe('upsertSettings model validation', () => {
    const ANTHROPIC_ONLY_CONFIG = {
        ai: {
            copilot: {
                defaultProvider: 'anthropic',
                providers: { anthropic: { modelName: 'claude-sonnet-5' } },
            },
        },
    };

    const buildService = ({
        storedVisibility = null,
        storedDefault = null,
    }: {
        storedVisibility?: unknown;
        storedDefault?: unknown;
    } = {}) => {
        const upsert = vi.fn(async (_org: string, data: unknown) => data);
        const service = new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: async () => ({
                    defaultAiAgentModelConfig: storedDefault,
                }),
                upsert,
            },
            organizationModel: {
                getAiAgentMemoryEnabled: async () => false,
            },
            commercialFeatureFlagModel: {
                get: async () => ({ enabled: true }),
            },
            lightdashConfig: ANTHROPIC_ONLY_CONFIG,
            orgAiCopilotConfigResolver: {
                // Writing modelVisibility is gated on the BYO-keys flag.
                isEnabled: async () => true,
                getOrgModelOverrides: async () => ({
                    modelVisibility: storedVisibility,
                    keyAccessibleModelIds: null,
                }),
                resolveEffectiveModelVisibilityForOrg: async (
                    _org: string,
                    submitted: unknown,
                ) => submitted,
            },
        } as never);
        // Bypass real CASL — this covers validation flow, not authorization.
        (
            service as unknown as { createAuditedAbility: () => unknown }
        ).createAuditedAbility = () => ({ can: () => true });
        return { service, upsert };
    };

    const user = fromSession({
        organizationUuid: 'org-uuid',
        ability: new Ability([{ action: 'manage', subject: 'all' }]),
        abilityRules: [{ action: 'manage', subject: 'all' }],
    } as never);
    it('refuses an OAuth admin enabling agent admission without OAuth scope metadata', async () => {
        const { service, upsert } = buildService();
        const policy = vi
            .spyOn(AgentCapabilityPolicyModel.prototype, 'get')
            .mockResolvedValue({
                mode: 'managed',
                version: 1,
                allowedProjectUuids: null,
                systemRoleMatrix: {} as never,
            });
        const account = fromOauth(toSessionUser(user), {
            accessToken: 'token',
            client: { id: 'client' },
        });
        await expect(
            service.upsertSettings(account, { mcpAgentsEnabled: true }),
        ).rejects.toMatchObject({
            refusal: {
                reason: 'agent_capability_denied',
                settingsUrl: '/generalSettings/agentIdentity',
            },
        });
        expect(upsert).not.toHaveBeenCalled();
        policy.mockRestore();
    });

    const restrictToSonnet = {
        anthropic: { enabled: true, allowedModels: ['claude-sonnet-5'] },
    };

    it('repoints the org default at Bedrock when Bedrock is configured', async () => {
        const { service, upsert } = buildService({
            storedDefault: {
                modelName: 'claude-sonnet-5',
                modelProvider: 'anthropic',
            },
        });
        await service.upsertSettings(user, {
            providerApiKeys: {
                bedrock: {
                    apiKey: 'ABSKtest',
                    region: 'ap-northeast-1',
                    allowedModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
                },
            },
        });
        expect(upsert).toHaveBeenCalledWith(
            'org-uuid',
            expect.objectContaining({
                defaultAiAgentModelConfig: {
                    modelName: 'claude-sonnet-4-5',
                    modelProvider: 'bedrock',
                },
            }),
        );
    });

    it('keeps an explicitly submitted default when Bedrock is configured', async () => {
        const { service, upsert } = buildService();
        await service.upsertSettings(user, {
            defaultAiAgentModelConfig: {
                modelName: 'claude-haiku-4-5',
                modelProvider: 'bedrock',
            },
            providerApiKeys: {
                bedrock: {
                    apiKey: 'ABSKtest',
                    region: 'us-east-1',
                    allowedModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
                },
            },
        });
        expect(upsert).toHaveBeenCalledWith(
            'org-uuid',
            expect.objectContaining({
                defaultAiAgentModelConfig: {
                    modelName: 'claude-haiku-4-5',
                    modelProvider: 'bedrock',
                },
            }),
        );
    });

    it('rejects a default outside the allowed Bedrock models', async () => {
        const { service } = buildService();
        await expect(
            service.upsertSettings(user, {
                defaultAiAgentModelConfig: {
                    modelName: 'claude-opus-5',
                    modelProvider: 'bedrock',
                },
                providerApiKeys: {
                    bedrock: {
                        apiKey: 'ABSKtest',
                        region: 'us-east-1',
                        allowedModels: ['claude-sonnet-4-5'],
                    },
                },
            }),
        ).rejects.toThrow(
            'The default AI model must be one of the allowed Bedrock models',
        );
    });

    // Regression: this validation used to live inside the modelVisibility
    // branch, so a default-only request skipped it entirely — and because
    // visibility filters listings but never resolution, that default would
    // still be served.
    it('rejects a default that the ALREADY-STORED visibility hides, with no visibility in the request', async () => {
        const { service } = buildService({
            storedVisibility: restrictToSonnet,
        });
        await expect(
            service.upsertSettings(user, {
                defaultAiAgentModelConfig: {
                    modelName: 'claude-haiku-4-5',
                    modelProvider: 'anthropic',
                },
            }),
        ).rejects.toThrow(
            'The default AI model is not available under this model visibility',
        );
    });

    it('accepts a default the stored visibility allows', async () => {
        const { service, upsert } = buildService({
            storedVisibility: restrictToSonnet,
        });
        await service.upsertSettings(user, {
            defaultAiAgentModelConfig: {
                modelName: 'claude-sonnet-5',
                modelProvider: 'anthropic',
            },
        });
        expect(upsert).toHaveBeenCalled();
    });

    it('accepts any default when the org has no visibility restrictions', async () => {
        const { service, upsert } = buildService();
        await service.upsertSettings(user, {
            defaultAiAgentModelConfig: {
                modelName: 'claude-haiku-4-5',
                modelProvider: 'anthropic',
            },
        });
        expect(upsert).toHaveBeenCalled();
    });

    it('accepts clearing the default', async () => {
        const { service, upsert } = buildService({
            storedVisibility: restrictToSonnet,
        });
        await service.upsertSettings(user, {
            defaultAiAgentModelConfig: null,
        });
        expect(upsert).toHaveBeenCalled();
    });

    it('rejects invalid Deep Research limits before writing', async () => {
        const { service, upsert } = buildService();

        await expect(
            service.upsertSettings(user, {
                deepResearchLimits: {
                    maxTokens: 10_000_000,
                    maxToolCalls: 0,
                    maxWarehouseQueries: 7,
                    maxSteps: 16,
                    deadlineMs: 600_000,
                },
            }),
        ).rejects.toThrow('maxToolCalls must be a positive integer');
        expect(upsert).not.toHaveBeenCalled();
    });

    it.each([
        ['maxToolCalls', 1],
        ['maxToolCalls', 2],
        ['deadlineMs', 1],
        ['deadlineMs', 999],
        ['maxTokens', 10_000_001],
        ['maxSteps', 1_001],
        ['maxToolCalls', 1_001],
        ['maxWarehouseQueries', 1_001],
        ['deadlineMs', 3_600_001],
    ] as const)(
        'rejects out-of-range %s=%s before writing',
        async (key, value) => {
            const { service, upsert } = buildService();

            await expect(
                service.upsertSettings(user, {
                    deepResearchLimits: {
                        ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                        [key]: value,
                    },
                }),
            ).rejects.toThrow(ParameterError);
            expect(upsert).not.toHaveBeenCalled();
        },
    );

    it.each([
        {
            maxTokens: 1,
            maxSteps: 1,
            maxToolCalls: 3,
            maxWarehouseQueries: 1,
            deadlineMs: 1_000,
        },
        {
            maxTokens: 10_000_000,
            maxSteps: 1_000,
            maxToolCalls: 1_000,
            maxWarehouseQueries: 1_000,
            deadlineMs: 3_600_000,
        },
    ])(
        'persists inclusive limit boundaries: %j',
        async (deepResearchLimits) => {
            const { service, upsert } = buildService();

            await service.upsertSettings(user, { deepResearchLimits });

            expect(upsert).toHaveBeenCalledWith('org-uuid', {
                deepResearchLimits,
            });
        },
    );

    it('forwards valid Deep Research limits to the model', async () => {
        const { service, upsert } = buildService();
        const deepResearchLimits = {
            maxTokens: 9_000_000,
            maxToolCalls: 42,
            maxWarehouseQueries: 7,
            maxSteps: 16,
            deadlineMs: 600_000,
        };

        await service.upsertSettings(user, { deepResearchLimits });

        expect(upsert).toHaveBeenCalledWith('org-uuid', {
            deepResearchLimits,
        });
    });

    it('forwards the Deep Research raw SQL policy to the model', async () => {
        const { service, upsert } = buildService();

        await service.upsertSettings(user, {
            deepResearchRawSqlEnabled: true,
        });

        expect(upsert).toHaveBeenCalledWith('org-uuid', {
            deepResearchRawSqlEnabled: true,
        });
    });

    it('repoints a stored default that the new visibility hides', async () => {
        const { service, upsert } = buildService({
            storedDefault: {
                modelName: 'claude-haiku-4-5',
                modelProvider: 'anthropic',
            },
        });
        await service.upsertSettings(user, {
            modelVisibility: restrictToSonnet,
        });
        expect(upsert.mock.calls[0][1]).toMatchObject({
            defaultAiAgentModelConfig: {
                modelName: 'claude-sonnet-5',
                modelProvider: 'anthropic',
            },
        });
    });
});

describe('converting a legacy Bedrock configuration', () => {
    const LEGACY = {
        apiKey: 'ABSKlegacy-key',
        region: 'ap-northeast-1',
        allowedModels: ['claude-sonnet-4-5'],
    };

    const buildService = ({
        existingCount = 0,
        legacy = LEGACY,
    }: {
        existingCount?: number;
        legacy?: typeof LEGACY | null;
    } = {}) => {
        const createCredential = vi.fn(
            async (_org: string, _user: string | null, _data: unknown) =>
                'new-cred-uuid',
        );
        const updateSettings = vi.fn(async () => undefined);
        const service = new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: async () =>
                    legacy ? { bedrock: legacy } : null,
                findByOrganizationUuid: async () => ({
                    defaultAiAgentModelConfig: {
                        modelName: 'gpt-6-sol',
                        modelProvider: 'openai',
                    },
                }),
                update: updateSettings,
            },
            aiOrganizationProviderCredentialModel: {
                countByOrganizationUuid: async () => existingCount,
                create: createCredential,
                // Mirroring and default-model reconciliation read these back
                // after every lifecycle change.
                findDefaultDecrypted: async () =>
                    legacy
                        ? {
                              status: 'ok',
                              credential: {
                                  uuid: 'new-cred-uuid',
                                  organizationUuid: 'org-uuid',
                                  provider: 'bedrock',
                                  label: legacy.region,
                                  isDefault: true,
                                  config: legacy,
                              },
                          }
                        : { status: 'none' },
                findAllByOrganizationUuid: async () => ({
                    credentials: legacy
                        ? [
                              {
                                  uuid: 'new-cred-uuid',
                                  provider: 'bedrock',
                                  label: legacy.region,
                                  region: legacy.region,
                                  allowedModels: legacy.allowedModels,
                                  apiKeyHint: 'ABSK...',
                                  isDefault: true,
                              },
                          ]
                        : [],
                    unreadable: [],
                }),
            },
            organizationModel: {},
            projectModel: {},
            commercialFeatureFlagModel: {
                get: async () => ({ enabled: true }),
            },
            lightdashConfig: { ai: { copilot: { providers: {} } } },
            orgAiCopilotConfigResolver: {},
        } as never);
        (
            service as unknown as { createAuditedAbility: () => unknown }
        ).createAuditedAbility = () => ({ can: () => true });
        return { service, createCredential, updateSettings };
    };

    const user = {
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
    } as never;

    // Without this an org that configured Bedrock before named credentials
    // could see its configuration but never edit or remove it.
    it('converts the legacy config into a managed credential', async () => {
        const { service, createCredential, updateSettings } = buildService();
        await service.adoptLegacyProviderCredential(user);

        expect(createCredential).toHaveBeenCalledTimes(1);
        expect(createCredential.mock.calls[0][2]).toEqual({
            provider: 'bedrock',
            label: 'ap-northeast-1',
            region: 'ap-northeast-1',
            allowedModels: ['claude-sonnet-4-5'],
            apiKey: 'ABSKlegacy-key',
        });
        // Mirrored, not cleared — an N-1 pod reads only this blob.
        expect(updateSettings).toHaveBeenCalledWith('org-uuid', {
            providerApiKeys: { bedrock: LEGACY },
        });
    });

    it('refuses when the org already manages credentials', async () => {
        const { service, createCredential } = buildService({
            existingCount: 1,
        });
        await expect(
            service.adoptLegacyProviderCredential(user),
        ).rejects.toThrow(/already manages/);
        expect(createCredential).not.toHaveBeenCalled();
    });

    it('refuses when there is no legacy configuration', async () => {
        const { service, createCredential } = buildService({ legacy: null });
        await expect(
            service.adoptLegacyProviderCredential(user),
        ).rejects.toThrow(/No legacy Bedrock/);
        expect(createCredential).not.toHaveBeenCalled();
    });
});

describe('pinning a project to a credential', () => {
    const buildService = ({
        resolution = { status: 'ok' as const, credential: {} },
        customProvidersEnabled = true,
    } = {}) => {
        const setProjectCredential = vi.fn(async () => undefined);
        const service = new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({
                    enabled: customProvidersEnabled,
                }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {},
            aiOrganizationProviderCredentialModel: {
                findDecrypted: async () => resolution,
                setProjectCredential,
            },
            organizationModel: {},
            projectModel: {
                getSummary: async () => ({ organizationUuid: 'org-uuid' }),
            },
            commercialFeatureFlagModel: {
                get: async () => ({ enabled: true }),
            },
            lightdashConfig: { ai: { copilot: { providers: {} } } },
            orgAiCopilotConfigResolver: {},
        } as never);
        (
            service as unknown as { createAuditedAbility: () => unknown }
        ).createAuditedAbility = () => ({ can: () => true });
        return { service, setProjectCredential };
    };

    const user = {
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
    } as never;

    it('stores the pin for a readable credential', async () => {
        const { service, setProjectCredential } = buildService();
        await service.setProjectProviderCredential(user, 'project-1', 'cred-1');
        expect(setProjectCredential).toHaveBeenCalledWith(
            'project-1',
            'cred-1',
        );
    });

    it('rejects a credential that does not exist', async () => {
        const { service, setProjectCredential } = buildService({
            resolution: { status: 'none' } as never,
        });
        await expect(
            service.setProjectProviderCredential(user, 'project-1', 'cred-1'),
        ).rejects.toThrow(/not found/);
        expect(setProjectCredential).not.toHaveBeenCalled();
    });

    // Caught at pin time, not at the project's first AI request, which would
    // otherwise fail with no obvious cause.
    it('rejects an unreadable credential', async () => {
        const { service, setProjectCredential } = buildService({
            resolution: {
                status: 'unreadable',
                uuid: 'cred-1',
                label: 'Japan (Tokyo)',
            } as never,
        });
        await expect(
            service.setProjectProviderCredential(user, 'project-1', 'cred-1'),
        ).rejects.toThrow(/cannot be read/);
        expect(setProjectCredential).not.toHaveBeenCalled();
    });

    it('clears the pin without looking up a credential', async () => {
        const { service, setProjectCredential } = buildService({
            resolution: { status: 'none' } as never,
        });
        await service.setProjectProviderCredential(user, 'project-1', null);
        expect(setProjectCredential).toHaveBeenCalledWith('project-1', null);
    });

    // A pin saved while the flag is off would be inert at best and rerouted
    // at worst, so the write is refused outright — same contract as agent pins.
    it('rejects a pin while custom providers are disabled', async () => {
        const { service, setProjectCredential } = buildService({
            customProvidersEnabled: false,
        });
        await expect(
            service.setProjectProviderCredential(user, 'project-1', 'cred-1'),
        ).rejects.toThrow(/not enabled/);
        expect(setProjectCredential).not.toHaveBeenCalled();
    });

    // Cleanup must stay possible for a flag-off organization.
    it('clears the pin while custom providers are disabled', async () => {
        const { service, setProjectCredential } = buildService({
            customProvidersEnabled: false,
        });
        await service.setProjectProviderCredential(user, 'project-1', null);
        expect(setProjectCredential).toHaveBeenCalledWith('project-1', null);
    });
});

describe('credential writes while custom providers are disabled', () => {
    const buildService = () => {
        const credentialModel = {
            create: vi.fn(async () => 'new-cred-uuid'),
            update: vi.fn(async () => undefined),
            replace: vi.fn(async () => undefined),
            setDefault: vi.fn(async () => undefined),
            delete: vi.fn(async () => undefined),
            countByOrganizationUuid: vi.fn(async () => 0),
            findDefaultDecrypted: vi.fn(async () => ({
                status: 'none' as const,
            })),
            findAllByOrganizationUuid: vi.fn(async () => ({
                credentials: [],
                unreadable: [],
            })),
        };
        const service = new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: false }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: async () => null,
                findByOrganizationUuid: async () => null,
                update: vi.fn(async () => undefined),
            },
            aiOrganizationProviderCredentialModel: credentialModel,
            organizationModel: {},
            projectModel: {},
            commercialFeatureFlagModel: {
                get: async () => ({ enabled: true }),
            },
            lightdashConfig: { ai: { copilot: { providers: {} } } },
            orgAiCopilotConfigResolver: {},
        } as never);
        (
            service as unknown as { createAuditedAbility: () => unknown }
        ).createAuditedAbility = () => ({ can: () => true });
        return { service, credentialModel };
    };

    const user = {
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
    } as never;

    const credentialData = {
        provider: 'bedrock' as const,
        label: 'Japan (Tokyo)',
        region: 'ap-northeast-1',
        allowedModels: ['claude-sonnet-4-5'],
        apiKey: 'ABSKkey',
    };

    // Stored org provider config is inert while the flag is off, so these
    // writes would save successfully and then silently do nothing.
    it('rejects creating a credential', async () => {
        const { service, credentialModel } = buildService();
        await expect(
            service.createProviderCredential(user, credentialData),
        ).rejects.toThrow(/not enabled/);
        expect(credentialModel.create).not.toHaveBeenCalled();
    });

    it('rejects updating a credential', async () => {
        const { service, credentialModel } = buildService();
        await expect(
            service.updateProviderCredential(user, 'cred-1', {
                label: 'renamed',
            }),
        ).rejects.toThrow(/not enabled/);
        expect(credentialModel.update).not.toHaveBeenCalled();
    });

    it('rejects replacing a credential', async () => {
        const { service, credentialModel } = buildService();
        await expect(
            service.replaceProviderCredential(user, 'cred-1', credentialData),
        ).rejects.toThrow(/not enabled/);
        expect(credentialModel.replace).not.toHaveBeenCalled();
    });

    it('rejects changing the default credential', async () => {
        const { service, credentialModel } = buildService();
        await expect(
            service.setDefaultProviderCredential(user, 'cred-1'),
        ).rejects.toThrow(/not enabled/);
        expect(credentialModel.setDefault).not.toHaveBeenCalled();
    });

    it('rejects adopting the legacy configuration', async () => {
        const { service, credentialModel } = buildService();
        await expect(
            service.adoptLegacyProviderCredential(user),
        ).rejects.toThrow(/not enabled/);
        expect(credentialModel.create).not.toHaveBeenCalled();
    });

    // Deletion stays allowed so a flag-off organization can clean up.
    it('still deletes a credential', async () => {
        const { service, credentialModel } = buildService();
        await service.deleteProviderCredential(user, 'cred-1');
        expect(credentialModel.delete).toHaveBeenCalledWith(
            'org-uuid',
            'cred-1',
        );
    });
});

describe('validating an agent credential pin', () => {
    const credential = {
        uuid: 'cred-1',
        organizationUuid: 'org-uuid',
        provider: 'bedrock' as const,
        label: 'Japan (Tokyo)',
        isDefault: false,
        config: {
            apiKey: 'key',
            region: 'ap-northeast-1',
            allowedModels: ['claude-sonnet-4-5'],
        },
    };

    const buildService = ({
        resolution = { status: 'ok' as const, credential },
        customProvidersEnabled = true,
    } = {}) =>
        new AiOrganizationSettingsService({
            aiOrganizationSettingsModel: {},
            aiOrganizationProviderCredentialModel: {
                findDecrypted: async () => resolution,
            },
            organizationModel: {},
            projectModel: {},
            commercialFeatureFlagModel: {},
            featureFlagModel: {
                get: async () => ({ enabled: customProvidersEnabled }),
            },
            lightdashConfig: { ai: { copilot: { providers: {} } } },
            orgAiCopilotConfigResolver: {},
        } as never);

    // A pin saved while the flag is off would be inert at best and rerouted
    // at worst, so the write is refused outright.
    it('rejects a pin while custom providers are disabled', async () => {
        await expect(
            buildService({
                customProvidersEnabled: false,
            }).validateAgentProviderCredential('org-uuid', 'cred-1', null),
        ).rejects.toThrow(/not enabled/);
    });

    it('accepts a readable credential when the agent pins no model', async () => {
        await expect(
            buildService().validateAgentProviderCredential(
                'org-uuid',
                'cred-1',
                null,
            ),
        ).resolves.toBeUndefined();
    });

    it('rejects a credential that does not exist', async () => {
        await expect(
            buildService({
                resolution: { status: 'none' } as never,
            }).validateAgentProviderCredential('org-uuid', 'cred-1', null),
        ).rejects.toThrow(/not found/);
    });

    // Caught at save time, not at the agent's first prompt, which would
    // otherwise fail with no obvious cause.
    it('rejects an unreadable credential', async () => {
        await expect(
            buildService({
                resolution: {
                    status: 'unreadable',
                    uuid: 'cred-1',
                    label: 'Japan (Tokyo)',
                } as never,
            }).validateAgentProviderCredential('org-uuid', 'cred-1', null),
        ).rejects.toThrow(/cannot be read/);
    });

    it("rejects a model from another provider than the credential's", async () => {
        await expect(
            buildService().validateAgentProviderCredential(
                'org-uuid',
                'cred-1',
                { modelName: 'gpt-5.4', modelProvider: 'openai' },
            ),
        ).rejects.toThrow(/bedrock/);
    });

    it("rejects a model outside the credential's allowed models", async () => {
        await expect(
            buildService().validateAgentProviderCredential(
                'org-uuid',
                'cred-1',
                { modelName: 'claude-opus-4-8', modelProvider: 'bedrock' },
            ),
        ).rejects.toThrow(/not in the allowed models/);
    });

    it('accepts a model the credential can serve', async () => {
        await expect(
            buildService().validateAgentProviderCredential(
                'org-uuid',
                'cred-1',
                { modelName: 'claude-sonnet-4-5', modelProvider: 'bedrock' },
            ),
        ).resolves.toBeUndefined();
    });
});

describe('legacy Bedrock adoption', () => {
    const LEGACY_BEDROCK = {
        apiKey: 'ABSKlegacy-key',
        region: 'ap-northeast-1',
        allowedModels: ['claude-sonnet-4-5'],
    };

    const buildService = ({
        existingCount = 0,
        legacy = LEGACY_BEDROCK,
    }: {
        existingCount?: number;
        legacy?: typeof LEGACY_BEDROCK | null;
    } = {}) => {
        const createCredential = vi.fn(
            async (_org: string, _user: string | null, _data: unknown) =>
                'new-cred-uuid',
        );
        const updateSettings = vi.fn(async () => undefined);
        const service = new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findDecryptedProviderApiKeys: async () =>
                    legacy ? { bedrock: legacy } : null,
                findByOrganizationUuid: async () => ({
                    defaultAiAgentModelConfig: {
                        modelName: 'gpt-6-sol',
                        modelProvider: 'openai',
                    },
                }),
                update: updateSettings,
            },
            aiOrganizationProviderCredentialModel: {
                countByOrganizationUuid: async () => existingCount,
                create: createCredential,
                // Mirroring and default-model reconciliation read these back
                // after every lifecycle change.
                findDefaultDecrypted: async () =>
                    legacy
                        ? {
                              status: 'ok',
                              credential: {
                                  uuid: 'new-cred-uuid',
                                  organizationUuid: 'org-uuid',
                                  provider: 'bedrock',
                                  label: legacy.region,
                                  isDefault: true,
                                  config: legacy,
                              },
                          }
                        : { status: 'none' },
                findAllByOrganizationUuid: async () => ({
                    credentials: legacy
                        ? [
                              {
                                  uuid: 'new-cred-uuid',
                                  provider: 'bedrock',
                                  label: legacy.region,
                                  region: legacy.region,
                                  allowedModels: legacy.allowedModels,
                                  apiKeyHint: 'ABSK...',
                                  isDefault: true,
                              },
                          ]
                        : [],
                    unreadable: [],
                }),
            },
            organizationModel: {},
            projectModel: {},
            commercialFeatureFlagModel: {
                get: async () => ({ enabled: true }),
            },
            lightdashConfig: { ai: { copilot: { providers: {} } } },
            orgAiCopilotConfigResolver: {},
        } as never);
        (
            service as unknown as { createAuditedAbility: () => unknown }
        ).createAuditedAbility = () => ({ can: () => true });
        return { service, createCredential, updateSettings };
    };

    const user = {
        organizationUuid: 'org-uuid',
        userUuid: 'user-uuid',
    } as never;

    const newCredential = {
        provider: 'bedrock' as const,
        label: 'US (Virginia)',
        region: 'us-east-1',
        allowedModels: ['claude-sonnet-4-5'],
        apiKey: 'ABSKus-key',
    };

    // Without adoption, adding a second region would leave the original
    // org-wide config unreachable from the credential list.
    it('adopts the legacy blob as a credential before the first create', async () => {
        const { service, createCredential } = buildService();
        await service.createProviderCredential(user, newCredential);

        expect(createCredential).toHaveBeenCalledTimes(2);
        expect(createCredential.mock.calls[0][2]).toEqual({
            provider: 'bedrock',
            label: 'ap-northeast-1',
            region: 'ap-northeast-1',
            allowedModels: ['claude-sonnet-4-5'],
            apiKey: 'ABSKlegacy-key',
        });
        expect(createCredential.mock.calls[1][2]).toEqual(newCredential);
    });

    // An N-1 pod mid-rollout can only read the legacy blob. Clearing it on
    // adoption would make that pod see no Bedrock key and fall through to
    // another provider — a residency break, not just an outage. The blob is
    // mirrored to the default credential instead.
    it('keeps the legacy blob as a mirror of the default credential', async () => {
        const { service, updateSettings } = buildService();
        await service.createProviderCredential(user, newCredential);

        expect(updateSettings).not.toHaveBeenCalledWith('org-uuid', {
            providerApiKeys: { bedrock: null },
        });
        expect(updateSettings).toHaveBeenCalledWith('org-uuid', {
            providerApiKeys: { bedrock: LEGACY_BEDROCK },
        });
    });

    // Model resolution honours a pinned provider and never falls back, so a
    // default left on OpenAI while the config is Bedrock-only fails every turn.
    it('repoints the default model at the adopted Bedrock credential', async () => {
        const { service, updateSettings } = buildService();
        await service.createProviderCredential(user, newCredential);

        expect(updateSettings).toHaveBeenCalledWith('org-uuid', {
            defaultAiAgentModelConfig: {
                modelName: LEGACY_BEDROCK.allowedModels[0],
                modelProvider: 'bedrock',
            },
        });
    });

    it('does not adopt again once the org has credentials', async () => {
        const { service, createCredential, updateSettings } = buildService({
            existingCount: 2,
        });
        await service.createProviderCredential(user, newCredential);

        // Only the requested credential is created — no second adoption.
        expect(createCredential).toHaveBeenCalledTimes(1);
        // Mirroring still runs on every lifecycle change, but it must never
        // clear the blob out from under an N-1 pod.
        expect(updateSettings).not.toHaveBeenCalledWith('org-uuid', {
            providerApiKeys: { bedrock: null },
        });
    });

    it('does nothing to adopt when there is no legacy blob', async () => {
        const { service, createCredential, updateSettings } = buildService({
            legacy: null,
        });
        await service.createProviderCredential(user, newCredential);

        expect(createCredential).toHaveBeenCalledTimes(1);
        expect(updateSettings).not.toHaveBeenCalled();
    });
});

describe('isAiAgentMemoryEnabled', () => {
    const buildService = (settingEnabled: boolean | null) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            organizationModel: {
                getAiAgentMemoryEnabled: vi
                    .fn()
                    .mockResolvedValue(settingEnabled),
            },
        } as never);

    it.each([
        [null, false],
        [false, false],
        [true, true],
    ])('resolves persisted=%s as %s', async (settingEnabled, expected) => {
        await expect(
            buildService(settingEnabled).isAiAgentMemoryEnabled({
                organizationUuid: 'org-uuid',
                userUuid: 'user-uuid',
            }),
        ).resolves.toBe(expected);
    });

    it('is disabled for a user without an organization', async () => {
        await expect(
            buildService(true).isAiAgentMemoryEnabled({
                organizationUuid: undefined,
                userUuid: 'user-uuid',
            }),
        ).resolves.toBe(false);
    });
});

describe('isDeepResearchRawSqlEnabled', () => {
    const buildService = (settings: AiOrganizationSettings | null) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue(settings),
            },
        } as never);

    it('fails closed when the organization has no stored settings', async () => {
        await expect(
            buildService(null).isDeepResearchRawSqlEnabled({
                organizationUuid: 'org-uuid',
            }),
        ).resolves.toBe(false);
    });

    it.each([false, true])(
        'returns the current stored raw SQL policy when it is %s',
        async (deepResearchRawSqlEnabled) => {
            await expect(
                buildService({
                    ...settingsWithKeys,
                    deepResearchRawSqlEnabled,
                }).isDeepResearchRawSqlEnabled({
                    organizationUuid: 'org-uuid',
                }),
            ).resolves.toBe(deepResearchRawSqlEnabled);
        },
    );
});

describe('isExplicitSlackChannelLinkingRequired', () => {
    const buildService = (settings: AiOrganizationSettings | null) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
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

describe('isDataAppContinueInAskAiEnabled', () => {
    const buildService = (
        stored: { dataAppContinueInAskAiEnabled?: boolean } | null,
    ) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue(stored),
            },
        } as never);

    it.each([
        [null, true],
        [{}, true],
        [{ dataAppContinueInAskAiEnabled: true }, true],
        [{ dataAppContinueInAskAiEnabled: false }, false],
    ])('resolves stored=%j as %s (on by default)', async (stored, expected) => {
        await expect(
            buildService(stored).isDataAppContinueInAskAiEnabled('org-uuid'),
        ).resolves.toBe(expected);
    });
});

describe('isDataAppAutoAnalysisEnabled', () => {
    const buildService = (
        stored: { dataAppAutoAnalysisEnabled?: boolean } | null,
    ) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue(stored),
            },
        } as never);

    it.each([
        [null, false],
        [{}, false],
        [{ dataAppAutoAnalysisEnabled: true }, true],
        [{ dataAppAutoAnalysisEnabled: false }, false],
    ])(
        'resolves stored=%j as %s (off by default)',
        async (stored, expected) => {
            await expect(
                buildService(stored).isDataAppAutoAnalysisEnabled('org-uuid'),
            ).resolves.toBe(expected);
        },
    );
});

describe('isDataAppRuntimeAiEnabled', () => {
    const buildService = (
        stored: { dataAppRuntimeAiEnabled?: boolean } | null,
    ) =>
        new AiOrganizationSettingsService({
            featureFlagModel: {
                get: vi.fn().mockResolvedValue({ enabled: true }),
            } as Pick<FeatureFlagModel, 'get'> as FeatureFlagModel,
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: vi.fn().mockResolvedValue(stored),
            },
        } as never);

    it.each([
        [null, false],
        [{}, false],
        [{ dataAppRuntimeAiEnabled: false }, false],
        [{ dataAppRuntimeAiEnabled: true }, true],
    ])(
        'resolves stored=%j as %s (off by default)',
        async (stored, expected) => {
            await expect(
                buildService(stored).isDataAppRuntimeAiEnabled('org-uuid'),
            ).resolves.toBe(expected);
        },
    );
});
