import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AiOrganizationSettings,
    ParameterError,
} from '@lightdash/common';
import type { ModelPreset, ModelPresetProvider } from './ai/models/presets';
import {
    AiOrganizationSettingsService,
    areReviewsEnabledForSettings,
    findUnconfiguredProviderKeyWrites,
    isModelConfigAvailable,
    pickReplacementDefaultModelConfig,
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
    providerApiKeysSet: { anthropic: true, google: false, openai: false },
    providerApiKeyHints: {
        anthropic: 'sk-ant-api03-R2D...igAA',
        google: null,
        openai: null,
    },
};

describe('validateDeepResearchLimits', () => {
    it('accepts the default limits', () => {
        expect(() =>
            validateDeepResearchLimits(AI_DEEP_RESEARCH_DEFAULT_LIMITS),
        ).not.toThrow();
    });

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
        const updateAiAgentMemoryEnabled = vi.fn();
        const transaction = vi.fn(
            async (callback: (trx: unknown) => Promise<unknown>) =>
                callback('transaction'),
        );
        const service = new AiOrganizationSettingsService({
            aiOrganizationSettingsModel: {
                findByOrganizationUuid: async () => ({
                    defaultAiAgentModelConfig: storedDefault,
                }),
                upsert,
                transaction,
            },
            organizationModel: {
                getAiAgentMemoryEnabled: async () => false,
                updateAiAgentMemoryEnabled,
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
        const getSettings = vi.fn().mockResolvedValue({
            organizationUuid: 'org-uuid',
            aiAgentMemoryEnabled: false,
        });
        service.getSettings = getSettings;
        return {
            service,
            getSettings,
            upsert,
            transaction,
            updateAiAgentMemoryEnabled,
        };
    };

    const user = { organizationUuid: 'org-uuid' } as never;
    const restrictToSonnet = {
        anthropic: { enabled: true, allowedModels: ['claude-sonnet-5'] },
    };

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

    it('stores an explicit off setting without writing AI settings', async () => {
        const { service, getSettings, upsert, updateAiAgentMemoryEnabled } =
            buildService();

        await service.upsertSettings(user, { aiAgentMemoryEnabled: false });

        expect(upsert).not.toHaveBeenCalled();
        expect(updateAiAgentMemoryEnabled).toHaveBeenCalledWith(
            'org-uuid',
            false,
        );
        expect(getSettings).toHaveBeenCalledWith(user);
    });

    it('updates memory with other settings in one transaction', async () => {
        const { service, transaction, upsert, updateAiAgentMemoryEnabled } =
            buildService();

        await service.upsertSettings(user, {
            aiAgentMemoryEnabled: false,
            aiAgentsVisible: false,
        });

        expect(transaction).toHaveBeenCalledOnce();
        expect(upsert).toHaveBeenCalledWith(
            'org-uuid',
            { aiAgentsVisible: false },
            'transaction',
        );
        expect(updateAiAgentMemoryEnabled).toHaveBeenCalledWith(
            'org-uuid',
            false,
            'transaction',
        );
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

describe('isAiAgentMemoryEnabled', () => {
    const buildService = (settingEnabled: boolean | null) =>
        new AiOrganizationSettingsService({
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
