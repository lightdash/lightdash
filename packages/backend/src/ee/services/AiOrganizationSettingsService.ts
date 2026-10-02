import { subject } from '@casl/ability';
import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AI_DEEP_RESEARCH_MAX_WORKERS,
    AiOrganizationRuntimeSettings,
    AiOrganizationSettings,
    BYO_AI_PROVIDERS,
    CommercialFeatureFlags,
    ComputedAiOrganizationSettings,
    DATA_APP_ANALYSIS_DEFAULT_LIMITS,
    FeatureFlags,
    ForbiddenError,
    getVisibleDataAppClaudeModels,
    isValidRetentionWindowHours,
    LightdashUser,
    ParameterError,
    RETENTION_WINDOW_HOURS_ERROR,
    UpdateAiOrganizationSettings,
    UpdateAiProviderApiKeys,
    type AiAgentModelConfig,
    type AiDeepResearchLimits,
    type AiModelOption,
    type AiOrgModelVisibility,
    type AiProviderCredentialsList,
    type ByoAiProvider,
    type CreateAiProviderCredential,
    type DataAppAnalysisLimits,
    type ProjectAiCredentialSelection,
    type SessionUser,
    type UpdateAiProviderCredential,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../services/BaseService';
import { AiOrganizationProviderCredentialModel } from '../models/AiOrganizationProviderCredentialModel';
import { AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import {
    filterModelsForOrg,
    getAvailableModels,
    getDefaultModel,
    presetToModelOption,
} from './ai/models';
import {
    matchesPreset,
    MODEL_PRESETS,
    type ModelPreset,
    type SelectableModelProvider,
} from './ai/models/presets';
import {
    OrgAiCopilotConfigResolver,
    type ReviewJudgeAvailability,
} from './ai/OrgAiCopilotConfigResolver';

type AvailableModelPreset = ModelPreset<SelectableModelProvider>;

/**
 * Whether a stored model config still resolves to one of the models left
 * available. Uses `matchesPreset` (preset name OR model id) because a stored
 * `modelName` may be either form — an exact name comparison silently misses
 * defaults persisted as dated model ids.
 */
export const isModelConfigAvailable = (
    modelConfig: AiAgentModelConfig,
    remaining: AvailableModelPreset[],
): boolean =>
    remaining.some(
        (preset) =>
            preset.provider === modelConfig.modelProvider &&
            matchesPreset(preset, modelConfig.modelName),
    );

/**
 * Pick a replacement org default once the configured one is no longer
 * available. Prefers the instance default when it survived the visibility
 * filter, else the first still-available model.
 *
 * Returns a concrete model rather than null on purpose: `filterModelsForOrg`
 * is applied to model LISTINGS only, never when a model is resolved for a
 * turn, so clearing the default to null would fall through to the instance
 * default — which may be exactly the model the org's allowlist excluded.
 */
export const pickReplacementDefaultModelConfig = (
    remaining: AvailableModelPreset[],
    instanceDefault: { name: string; provider: string } | null,
    previous: AiAgentModelConfig,
): AiAgentModelConfig | null => {
    const preset =
        (instanceDefault
            ? remaining.find(
                  (candidate) =>
                      candidate.provider === instanceDefault.provider &&
                      matchesPreset(candidate, instanceDefault.name),
              )
            : undefined) ?? remaining[0];
    if (!preset) return null;
    return {
        modelName: preset.name,
        modelProvider: preset.provider,
        // Only carry the reasoning preference to a model that supports it.
        reasoning: preset.supportsReasoning ? previous.reasoning : undefined,
    };
};

/**
 * Providers being SET to a key that this instance does not configure. BYO can
 * only swap the key of a provider the instance already runs, so setting a key
 * for an unconfigured provider is rejected. Removing a key (null) is always
 * allowed.
 */
export const findUnconfiguredProviderKeyWrites = (
    providerApiKeys: UpdateAiProviderApiKeys,
    configuredProviders: Partial<Record<ByoAiProvider, unknown>>,
): ByoAiProvider[] =>
    BYO_AI_PROVIDERS.filter(
        (provider) =>
            typeof providerApiKeys[provider] === 'string' &&
            !configuredProviders[provider],
    );

const DEEP_RESEARCH_LIMIT_BOUNDS: Record<
    keyof AiDeepResearchLimits,
    { min: number; max: number }
> = {
    maxTokens: { min: 1, max: 10_000_000 },
    maxSteps: { min: 1, max: 1_000 },
    maxToolCalls: { min: AI_DEEP_RESEARCH_MAX_WORKERS + 1, max: 1_000 },
    maxWarehouseQueries: { min: 1, max: 1_000 },
    deadlineMs: { min: 1_000, max: 3_600_000 },
};

const DATA_APP_ANALYSIS_LIMIT_BOUNDS = {
    investigateMaxSteps: { min: 1, max: 100 },
    investigateMaxWarehouseQueries: { min: 1, max: 200 },
    dailyDetectCap: { min: 1, max: 100_000 },
    dailyInvestigateCap: { min: 1, max: 100_000 },
    dailyPromptCap: { min: 1, max: 100_000 },
} as const;

export const validateDataAppAnalysisLimits = (
    limits: DataAppAnalysisLimits,
): void => {
    (
        Object.entries(limits) as Array<
            [keyof DataAppAnalysisLimits, number | null]
        >
    ).forEach(([key, value]) => {
        const bounds = DATA_APP_ANALYSIS_LIMIT_BOUNDS[key];
        if (!bounds) {
            throw new ParameterError(`Unknown limit ${key}`);
        }
        // Daily caps may be null (no cap); per-run limits may not.
        if (value === null && key.startsWith('daily')) return;
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            throw new ParameterError(`${key} must be a positive integer`);
        }
        if (value < bounds.min || value > bounds.max) {
            throw new ParameterError(
                `${key} must be between ${bounds.min} and ${bounds.max}`,
            );
        }
    });
};

export const validateDeepResearchLimits = (
    limits: AiDeepResearchLimits,
): void => {
    (
        Object.entries(limits) as Array<[keyof AiDeepResearchLimits, number]>
    ).forEach(([key, value]) => {
        if (!Number.isInteger(value) || value <= 0) {
            throw new ParameterError(`${key} must be a positive integer`);
        }
        const bounds = DEEP_RESEARCH_LIMIT_BOUNDS[key];
        if (bounds && (value < bounds.min || value > bounds.max)) {
            throw new ParameterError(
                `${key} must be between ${bounds.min} and ${bounds.max}`,
            );
        }
    });
};

/**
 * Reviews run on the org's own key when it has one (never the instance
 * provider), so a BYO key that can't serve the review model pauses reviews
 * rather than leaking turn data through our LLM account.
 */
export const areReviewsEnabledForSettings = (
    settings: Pick<AiOrganizationSettings, 'aiAgentReviewsEnabled'> | null,
    byo: ReviewJudgeAvailability,
): boolean => {
    if (!settings?.aiAgentReviewsEnabled) return false;
    return !byo.hasActiveByoKey || byo.canJudgeOnByoKey;
};

type AiOrganizationSettingsServiceDependencies = {
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    aiOrganizationProviderCredentialModel: AiOrganizationProviderCredentialModel;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    lightdashConfig: LightdashConfig;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
};

export class AiOrganizationSettingsService extends BaseService {
    private readonly aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private readonly aiOrganizationProviderCredentialModel: AiOrganizationProviderCredentialModel;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    // Date when trial feature was enabled for new organizations
    private static readonly TRIAL_START_DATE = new Date('2025-10-13T00:00:00Z');

    constructor(dependencies: AiOrganizationSettingsServiceDependencies) {
        super();
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.aiOrganizationProviderCredentialModel =
            dependencies.aiOrganizationProviderCredentialModel;
        this.organizationModel = dependencies.organizationModel;
        this.projectModel = dependencies.projectModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
        this.lightdashConfig = dependencies.lightdashConfig;
        this.orgAiCopilotConfigResolver =
            dependencies.orgAiCopilotConfigResolver;
    }

    private checkManageAiAgentAccess(user: SessionUser): void {
        if (!this.canManageAiAgent(user)) {
            throw new ForbiddenError(
                'Insufficient permissions to manage AI agent settings',
            );
        }
    }

    private canManageAiAgent(user: SessionUser): boolean {
        return this.createAuditedAbility(user).can(
            'manage',
            subject('OrganizationAiAgent', {
                organizationUuid: user.organizationUuid!,
            }),
        );
    }

    private async getIsCopilotEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const isCopilotEnabled = await this.commercialFeatureFlagModel.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return isCopilotEnabled.enabled;
    }

    private async getAiAvailability(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
        organizationUuid: string,
    ): Promise<{ isCopilotEnabled: boolean; isTrial: boolean }> {
        const isCopilotEnabled = await this.getIsCopilotEnabled(user);
        const isTrial = await this.isEligibleForTrial(
            isCopilotEnabled,
            organizationUuid,
        );
        return { isCopilotEnabled, isTrial };
    }

    private async checkAiSettingsAccess(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<{ isCopilotEnabled: boolean; isTrial: boolean }> {
        this.checkManageAiAgentAccess(user);
        const availability = await this.getAiAvailability(
            user,
            organizationUuid,
        );
        if (!availability.isCopilotEnabled && !availability.isTrial) {
            throw new ForbiddenError(
                'AI agent settings are not available for this organization',
            );
        }
        return availability;
    }

    private async getModelOptionLists(organizationUuid: string): Promise<{
        effectiveOptions: AiModelOption[];
        configurableOptions: AiModelOption[];
        effectiveModelVisibility: AiOrgModelVisibility | null;
        bedrockModelOptions: AiModelOption[];
    }> {
        // Display-only: this read path must survive an unreadable credential,
        // because the screen it renders is where that credential is replaced.
        const [copilotConfig, overrides] = await Promise.all([
            this.orgAiCopilotConfigResolver.getCopilotConfigForDisplay(
                organizationUuid,
            ),
            this.orgAiCopilotConfigResolver.getOrgModelOverrides(
                organizationUuid,
            ),
        ]);
        const defaultModel = getDefaultModel(copilotConfig);
        const allPresets = getAvailableModels(copilotConfig);
        const toOption = (preset: (typeof allPresets)[number]): AiModelOption =>
            presetToModelOption(preset, defaultModel);
        return {
            effectiveOptions: filterModelsForOrg(allPresets, overrides).map(
                toOption,
            ),
            // Admin picker ignores visibility so restricted models stay selectable
            configurableOptions: filterModelsForOrg(allPresets, {
                modelVisibility: null,
                keyAccessibleModelIds: overrides.keyAccessibleModelIds,
            }).map(toOption),
            effectiveModelVisibility: overrides.modelVisibility,
            // The org brings its own Bedrock key, so every Bedrock preset is
            // selectable regardless of what this instance configures.
            bedrockModelOptions: MODEL_PRESETS.bedrock.map((preset) =>
                presetToModelOption(preset, defaultModel),
            ),
        };
    }

    /**
     * Check if the organization qualifies for AI trial
     * Organization was created on or after TRIAL_START_DATE
     */
    async isEligibleForTrial(
        isCopilotEnabled: boolean,
        organizationUuid: string,
    ): Promise<boolean> {
        if (isCopilotEnabled) {
            return false;
        }

        if (!this.lightdashConfig.ai.copilot.enabled) {
            return false;
        }

        try {
            const org = await this.organizationModel.get(organizationUuid);
            if (!org || !org.createdAt) {
                return false;
            }
            const orgCreatedAt = new Date(org.createdAt);

            return (
                orgCreatedAt >= AiOrganizationSettingsService.TRIAL_START_DATE
            );
        } catch (error) {
            return false;
        }
    }

    /**
     * The org-level default model config, without the admin-gated key-hint
     * masking that getSettings applies. Callers that only need to resolve a
     * model (e.g. the Slack prompt flow) use this instead of getSettings so
     * they don't require a SessionUser ability or `manage` permission.
     */
    async getDefaultModelConfig(
        organizationUuid: string,
    ): Promise<AiAgentModelConfig | null> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.defaultAiAgentModelConfig ?? null;
    }

    async isExplicitSlackChannelLinkingRequired(
        organizationUuid: string,
    ): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.requireExplicitSlackChannelLinking ?? false;
    }

    async isAiAgentMemoryEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        if (!user.organizationUuid) return false;
        const settingEnabled =
            await this.organizationModel.getAiAgentMemoryEnabled(
                user.organizationUuid,
            );
        return settingEnabled ?? false;
    }

    private async resolveSettings(
        user: SessionUser,
        availability: { isCopilotEnabled: boolean; isTrial: boolean },
    ): Promise<AiOrganizationSettings & ComputedAiOrganizationSettings> {
        const organizationUuid = user.organizationUuid!;
        const { isCopilotEnabled, isTrial } = availability;

        const [settings, aiAgentMemoryEnabled] = await Promise.all([
            this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            ),
            this.isAiAgentMemoryEnabled(user),
        ]);

        const [
            {
                effectiveOptions,
                configurableOptions,
                effectiveModelVisibility,
                bedrockModelOptions,
            },
            reviewJudge,
            effectiveDataAppModelVisibility,
        ] = await Promise.all([
            this.getModelOptionLists(organizationUuid),
            this.orgAiCopilotConfigResolver.getReviewJudgeAvailability(
                organizationUuid,
            ),
            this.orgAiCopilotConfigResolver.getDataAppModelVisibility(
                organizationUuid,
            ),
        ]);

        // Reviews are paused when the org's own key can't serve the review model
        // (we never fall back to the instance provider for their turn data).
        const aiAgentReviewsPausedByByok =
            reviewJudge.hasActiveByoKey && !reviewJudge.canJudgeOnByoKey;

        // Return default settings if none exist
        if (!settings) {
            return {
                organizationUuid,
                isCopilotEnabled,
                aiAgentsVisible: true,
                aiAgentReviewsEnabled: false,
                aiAgentMemoryEnabled,
                deepResearchLimits: AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                deepResearchRawSqlEnabled: false,
                mcpContentWritesEnabled: true,
                mcpAgentsEnabled: true,
                dataAppRuntimeAiEnabled: false,
                dataAppContinueInAskAiEnabled: true,
                dataAppAutoAnalysisEnabled: false,
                dataAppAnalysisLimits: DATA_APP_ANALYSIS_DEFAULT_LIMITS,
                requireExplicitSlackChannelLinking: false,
                defaultAiAgentModelConfig: null,
                modelVisibility: effectiveModelVisibility,
                dataAppModelVisibility: null,
                providerApiKeysSet: {
                    anthropic: false,
                    google: false,
                    openai: false,
                    bedrock: false,
                },
                providerApiKeyHints: {
                    anthropic: null,
                    google: null,
                    openai: null,
                    bedrock: null,
                },
                bedrockConfig: null,
                threadRetentionHours: null,
                defaultAiAgentModelOptions: effectiveOptions,
                configurableModelOptions: configurableOptions,
                bedrockModelOptions,
                aiAgentReviewsPausedByByok,
                isTrial,
            };
        }

        return {
            ...settings,
            aiAgentMemoryEnabled,
            // Surface the effective visibility (implicit BYOK defaults merged in)
            // so the admin card reflects what users actually see.
            modelVisibility: effectiveModelVisibility,
            // Likewise: stored Data App settings are inert without a BYO key,
            // so the picker must not filter on them when the backend won't.
            dataAppModelVisibility: effectiveDataAppModelVisibility,
            isTrial,
            isCopilotEnabled,
            defaultAiAgentModelOptions: effectiveOptions,
            configurableModelOptions: configurableOptions,
            bedrockModelOptions,
            aiAgentReviewsPausedByByok,
        };
    }

    async getSettings(
        user: SessionUser,
    ): Promise<AiOrganizationSettings & ComputedAiOrganizationSettings> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        const availability = await this.checkAiSettingsAccess(
            user,
            organizationUuid,
        );
        return this.resolveSettings(user, availability);
    }

    async getRuntimeSettings(
        user: SessionUser,
    ): Promise<AiOrganizationRuntimeSettings> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        const availability = await this.getAiAvailability(
            user,
            organizationUuid,
        );
        if (!availability.isCopilotEnabled && !availability.isTrial) {
            const dataAppModelVisibility =
                await this.orgAiCopilotConfigResolver.getDataAppModelVisibility(
                    organizationUuid,
                );
            return {
                ...availability,
                aiAgentsVisible: false,
                aiAgentMemoryEnabled: false,
                aiAgentReviewsEnabled: false,
                aiAgentReviewsAvailable: false,
                defaultAiAgentModelConfig: null,
                defaultAiAgentModelOptions: [],
                dataAppCodingAgent:
                    this.lightdashConfig.appRuntime.dataAppCodingAgent,
                visibleDataAppModels: getVisibleDataAppClaudeModels(
                    dataAppModelVisibility,
                ),
                dataAppRuntimeAiEnabled: false,
                dataAppContinueInAskAiEnabled: true,
                dataAppAutoAnalysisEnabled: false,
                threadRetentionHours: null,
            };
        }

        const settings = await this.resolveSettings(user, availability);
        return {
            ...availability,
            aiAgentsVisible: settings.aiAgentsVisible,
            aiAgentMemoryEnabled: settings.aiAgentMemoryEnabled,
            aiAgentReviewsEnabled: settings.aiAgentReviewsEnabled,
            aiAgentReviewsAvailable:
                settings.aiAgentReviewsEnabled &&
                settings.aiAgentReviewsPausedByByok !== true,
            defaultAiAgentModelConfig: settings.defaultAiAgentModelConfig,
            defaultAiAgentModelOptions: settings.defaultAiAgentModelOptions,
            dataAppCodingAgent:
                this.lightdashConfig.appRuntime.dataAppCodingAgent,
            visibleDataAppModels: getVisibleDataAppClaudeModels(
                settings.dataAppModelVisibility,
            ),
            dataAppRuntimeAiEnabled: settings.dataAppRuntimeAiEnabled ?? false,
            dataAppContinueInAskAiEnabled:
                settings.dataAppContinueInAskAiEnabled ?? true,
            dataAppAutoAnalysisEnabled:
                settings.dataAppAutoAnalysisEnabled ?? false,
            threadRetentionHours: settings.threadRetentionHours ?? null,
        };
    }

    async isMcpAgentsEnabled(organizationUuid: string): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.mcpAgentsEnabled ?? true;
    }

    /** Customer consent gate for any AI call made on behalf of a running data app. */
    async isDataAppRuntimeAiEnabled(
        organizationUuid: string,
    ): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.dataAppRuntimeAiEnabled ?? false;
    }

    /** Whether viewers may carry a data-app investigation on in Ask AI. */
    async isDataAppContinueInAskAiEnabled(
        organizationUuid: string,
    ): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.dataAppContinueInAskAiEnabled ?? true;
    }

    /** Per-run ceilings and daily caps for AI analysis in data apps. */
    async getDataAppAnalysisLimits(
        organizationUuid: string,
    ): Promise<DataAppAnalysisLimits> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return (
            settings?.dataAppAnalysisLimits ?? DATA_APP_ANALYSIS_DEFAULT_LIMITS
        );
    }

    /** Org default for running AI analysis when a data app loads. */
    async isDataAppAutoAnalysisEnabled(
        organizationUuid: string,
    ): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.dataAppAutoAnalysisEnabled ?? false;
    }

    async isDeepResearchRawSqlEnabled({
        organizationUuid,
    }: {
        organizationUuid: string;
    }): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.deepResearchRawSqlEnabled ?? false;
    }

    async isThreadRetentionEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const flag = await this.commercialFeatureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiThreadRetention,
        });
        return flag.enabled;
    }

    async assertThreadRetentionWriteAllowed(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
        threadRetentionHours: number | null,
    ): Promise<void> {
        if (!(await this.isThreadRetentionEnabled(user))) {
            throw new ForbiddenError(
                'AI thread retention is not enabled for this organization',
            );
        }
        if (!isValidRetentionWindowHours(threadRetentionHours)) {
            throw new ParameterError(RETENTION_WINDOW_HOURS_ERROR);
        }
    }

    async getThreadRetentionCeiling(
        organizationUuid: string,
    ): Promise<number | null> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.threadRetentionHours ?? null;
    }

    async upsertSettings(
        user: SessionUser,
        aiSettingsUpdate: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        await this.checkAiSettingsAccess(user, organizationUuid);

        if (aiSettingsUpdate.deepResearchLimits !== undefined) {
            validateDeepResearchLimits(aiSettingsUpdate.deepResearchLimits);
        }
        if (aiSettingsUpdate.dataAppAnalysisLimits !== undefined) {
            validateDataAppAnalysisLimits(
                aiSettingsUpdate.dataAppAnalysisLimits,
            );
        }

        if (aiSettingsUpdate.threadRetentionHours !== undefined) {
            // No-op writes stay allowed: clients that round-trip the settings
            // object must not be rejected while the flag is off.
            const storedRetention =
                await this.getThreadRetentionCeiling(organizationUuid);
            if (aiSettingsUpdate.threadRetentionHours !== storedRetention) {
                await this.assertThreadRetentionWriteAllowed(
                    user,
                    aiSettingsUpdate.threadRetentionHours,
                );
            }
        }

        // Set when hiding models orphans the org's configured default, so the
        // write can repoint it in the same upsert.
        let reconciledDefaultModelConfig: AiAgentModelConfig | null | undefined;

        // The model-visibility validation below reads the CURRENT key's model
        // access, which would be stale if the key changed in the same request
        // (e.g. restrict to only a key-unlocked model while swapping to a key
        // that can't reach it → zero models). Require separate requests so the
        // two never race.
        if (
            aiSettingsUpdate.providerApiKeys !== undefined &&
            aiSettingsUpdate.modelVisibility !== undefined
        ) {
            throw new ParameterError(
                'Update provider API keys and model visibility in separate requests',
            );
        }

        if (
            aiSettingsUpdate.providerApiKeys !== undefined ||
            aiSettingsUpdate.modelVisibility !== undefined
        ) {
            // BYO keys and model visibility require AI copilot (env/ai-copilot
            // flag) to be enabled for this org.
            const copilotEnabled = await this.getIsCopilotEnabled(user);
            if (!copilotEnabled) {
                throw new ForbiddenError(
                    'AI copilot is not enabled for this organization',
                );
            }
        }

        if (aiSettingsUpdate.providerApiKeys !== undefined) {
            const unconfigured = findUnconfiguredProviderKeyWrites(
                aiSettingsUpdate.providerApiKeys,
                this.lightdashConfig.ai.copilot.providers,
            );
            if (unconfigured.length > 0) {
                throw new ParameterError(
                    `Cannot set an API key for a provider this instance does not configure: ${unconfigured.join(
                        ', ',
                    )}`,
                );
            }
        }

        // Configuring Bedrock makes it the org's only provider, so a stored
        // default pointing at another provider would fail every turn — model
        // resolution honours the pinned provider, it does not fall back. The
        // first allowed model becomes the default, which is what the settings
        // form promises.
        //
        // The visibility checks below can't judge a Bedrock default: `remaining`
        // derives from the INSTANCE config, which need not run Bedrock at all.
        // Validate against the org's own allowlist instead.
        const bedrockUpdate = aiSettingsUpdate.providerApiKeys?.bedrock;
        if (bedrockUpdate) {
            const submitted = aiSettingsUpdate.defaultAiAgentModelConfig;
            if (!submitted) {
                reconciledDefaultModelConfig = {
                    modelName: bedrockUpdate.allowedModels[0],
                    modelProvider: 'bedrock',
                };
            } else if (
                submitted.modelProvider !== 'bedrock' ||
                !bedrockUpdate.allowedModels.includes(submitted.modelName)
            ) {
                throw new ParameterError(
                    'The default AI model must be one of the allowed Bedrock models',
                );
            }
        }

        // A supplied default has to be checked against the visibility the write
        // lands on, whether or not this request is the one changing it —
        // visibility filters model LISTINGS only, never resolution, so a
        // default pointing at a restricted model would still be served.
        if (
            !bedrockUpdate &&
            (aiSettingsUpdate.modelVisibility ||
                aiSettingsUpdate.defaultAiAgentModelConfig)
        ) {
            // Validate against the EFFECTIVE visibility (implicit auto-hide
            // merged under the submission) and real key access — so disabling
            // the only provider whose toggle isn't locked can't leave an empty
            // selector, and an allowlist of only a key-unlocked hidden model
            // (e.g. opus 4.8) still counts. When this request doesn't touch
            // visibility, validate against what is already stored.
            const [overrides, submittedVisibility] = await Promise.all([
                this.orgAiCopilotConfigResolver.getOrgModelOverrides(
                    organizationUuid,
                ),
                aiSettingsUpdate.modelVisibility
                    ? this.orgAiCopilotConfigResolver.resolveEffectiveModelVisibilityForOrg(
                          organizationUuid,
                          aiSettingsUpdate.modelVisibility,
                      )
                    : null,
            ]);
            const effectiveVisibility = aiSettingsUpdate.modelVisibility
                ? submittedVisibility
                : overrides.modelVisibility;
            const remaining = filterModelsForOrg(
                getAvailableModels(this.lightdashConfig.ai.copilot),
                {
                    modelVisibility: effectiveVisibility,
                    keyAccessibleModelIds: overrides.keyAccessibleModelIds,
                },
            );
            if (aiSettingsUpdate.modelVisibility && remaining.length === 0) {
                throw new ParameterError(
                    'At least one AI model must remain available',
                );
            }

            if (
                aiSettingsUpdate.defaultAiAgentModelConfig &&
                !isModelConfigAvailable(
                    aiSettingsUpdate.defaultAiAgentModelConfig,
                    remaining,
                )
            ) {
                throw new ParameterError(
                    'The default AI model is not available under this model visibility',
                );
            }

            // When the update hides the org's configured default and the
            // request doesn't set a new one, repoint it at a model that is
            // still available. Not null: a null default resolves to the
            // instance default, which may be the very model this org just
            // restricted.
            if (
                aiSettingsUpdate.modelVisibility &&
                aiSettingsUpdate.defaultAiAgentModelConfig === undefined
            ) {
                const currentDefault = (
                    await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                        organizationUuid,
                    )
                )?.defaultAiAgentModelConfig;
                if (
                    currentDefault &&
                    !isModelConfigAvailable(currentDefault, remaining)
                ) {
                    reconciledDefaultModelConfig =
                        pickReplacementDefaultModelConfig(
                            remaining,
                            getDefaultModel(this.lightdashConfig.ai.copilot),
                            currentDefault,
                        );
                }
            }
        }

        if (aiSettingsUpdate.dataAppModelVisibility) {
            const remainingDataAppModels = getVisibleDataAppClaudeModels(
                aiSettingsUpdate.dataAppModelVisibility,
            );
            if (remainingDataAppModels.length === 0) {
                throw new ParameterError(
                    'At least one Data App model must remain available',
                );
            }
        }

        const update =
            reconciledDefaultModelConfig === undefined
                ? aiSettingsUpdate
                : {
                      ...aiSettingsUpdate,
                      defaultAiAgentModelConfig: reconciledDefaultModelConfig,
                  };
        const settings = await this.aiOrganizationSettingsModel.upsert(
            organizationUuid,
            update,
        );

        return {
            ...settings,
            aiAgentMemoryEnabled: await this.isAiAgentMemoryEnabled(user),
        };
    }

    async isAiAgentReviewsEnabled(
        user: Pick<LightdashUser, 'organizationUuid'>,
    ): Promise<boolean> {
        if (!user.organizationUuid) {
            return false;
        }

        const [settings, byo] = await Promise.all([
            this.aiOrganizationSettingsModel.findByOrganizationUuid(
                user.organizationUuid,
            ),
            this.orgAiCopilotConfigResolver.getReviewJudgeAvailability(
                user.organizationUuid,
            ),
        ]);

        return areReviewsEnabledForSettings(settings, byo);
    }

    async isMcpContentWritesEnabled(
        user: Pick<LightdashUser, 'organizationUuid'>,
    ): Promise<boolean> {
        if (!user.organizationUuid) {
            return false;
        }

        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                user.organizationUuid,
            );

        return settings?.mcpContentWritesEnabled ?? true;
    }

    /**
     * Named provider credentials for the organization, plus any Bedrock config
     * still held in the legacy single-key blob and any row whose ciphertext
     * cannot be read.
     */
    async listProviderCredentials(
        user: SessionUser,
    ): Promise<AiProviderCredentialsList> {
        this.checkManageAiAgentAccess(user);
        const organizationUuid = user.organizationUuid!;

        const [{ credentials, unreadable }, settings] = await Promise.all([
            this.aiOrganizationProviderCredentialModel.findAllByOrganizationUuid(
                organizationUuid,
            ),
            this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            ),
        ]);

        // Only surfaced while the org has not adopted it as a credential;
        // adoption happens on the first credential write.
        const legacyBedrock =
            credentials.length === 0 && settings?.bedrockConfig
                ? {
                      region: settings.bedrockConfig.region,
                      allowedModels: settings.bedrockConfig.allowedModels,
                      apiKeyHint: settings.providerApiKeyHints.bedrock ?? '',
                  }
                : null;

        return {
            credentials,
            legacyBedrock,
            unreadableCredentials: unreadable,
        };
    }

    /**
     * Move a legacy single-blob Bedrock config into a real credential before
     * the first explicit credential is created. Without this, adding a second
     * region would leave the original config unreachable from the list, and
     * clearing the blob outright would lose it.
     *
     * The adopted credential becomes the default because the blob was already
     * serving the whole organization — so unscoped paths keep their region.
     */
    private async adoptLegacyBedrockCredential(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<void> {
        const existingCount =
            await this.aiOrganizationProviderCredentialModel.countByOrganizationUuid(
                organizationUuid,
            );
        if (existingCount > 0) return;

        const legacy =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!legacy?.bedrock) return;

        await this.aiOrganizationProviderCredentialModel.create(
            organizationUuid,
            user.userUuid,
            {
                provider: 'bedrock',
                label: legacy.bedrock.region,
                region: legacy.bedrock.region,
                allowedModels: legacy.bedrock.allowedModels,
                apiKey: legacy.bedrock.apiKey,
            },
        );
        // The blob is deliberately NOT cleared here — see
        // `mirrorDefaultCredentialToLegacyBlob`.
    }

    /**
     * Keep the legacy single-blob Bedrock config in step with the default
     * credential, and clear it only when no credentials remain.
     *
     * A release that is mid-rollout still has N−1 pods serving traffic, and
     * those pods know nothing about the credentials table — the blob is the
     * only configuration they can read. Clearing it on adoption would make
     * them see no Bedrock key at all and fall through to another provider,
     * which for a region-pinned organization is a data-residency break rather
     * than an outage. Mirroring means an old pod resolves the organization's
     * default region, which is the closest thing it is capable of.
     *
     * It also keeps the resolver's legacy fallback honest: the blob can never
     * hold a region staler than the current default.
     */
    private async mirrorDefaultCredentialToLegacyBlob(
        organizationUuid: string,
    ): Promise<void> {
        const defaultCredential =
            await this.aiOrganizationProviderCredentialModel.findDefaultDecrypted(
                organizationUuid,
            );

        if (defaultCredential.status === 'ok') {
            const { config } = defaultCredential.credential;
            await this.aiOrganizationSettingsModel.update(organizationUuid, {
                providerApiKeys: {
                    bedrock: {
                        apiKey: config.apiKey,
                        region: config.region,
                        allowedModels: config.allowedModels,
                    },
                },
            });
            return;
        }

        // An unreadable default is left alone: overwriting the blob with
        // nothing would strand N−1 pods, and the admin is already being told
        // to replace that credential.
        if (defaultCredential.status === 'unreadable') return;

        // No credentials at all — drop the mirror so the organization is back
        // to having no Bedrock configuration.
        const existing =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!existing?.bedrock) return;
        await this.aiOrganizationSettingsModel.update(organizationUuid, {
            providerApiKeys: { bedrock: null },
        });
    }

    /**
     * Convert a legacy single-blob Bedrock config into a managed credential
     * without creating a second one.
     *
     * Without this an organization that configured Bedrock before named
     * credentials existed could see its configuration but never change or
     * remove it: the legacy row has no edit affordance, and adoption otherwise
     * only happens as a side effect of adding another credential.
     */
    async adoptLegacyProviderCredential(user: SessionUser): Promise<void> {
        this.checkManageAiAgentAccess(user);
        const organizationUuid = user.organizationUuid!;
        const existingCount =
            await this.aiOrganizationProviderCredentialModel.countByOrganizationUuid(
                organizationUuid,
            );
        if (existingCount > 0) {
            throw new ParameterError(
                'This organization already manages its credentials; there is nothing to convert.',
            );
        }
        const legacy =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!legacy?.bedrock) {
            throw new ParameterError(
                'No legacy Bedrock configuration to convert',
            );
        }
        await this.adoptLegacyBedrockCredential(user, organizationUuid);
        await this.mirrorDefaultCredentialToLegacyBlob(organizationUuid);
        await this.reconcileDefaultModelForCredentials(organizationUuid);
    }

    /**
     * Keep the organization's default agent model consistent with the set of
     * credentials, mirroring what the legacy settings path already does.
     *
     * Model resolution honours a pinned provider and does not fall back, so a
     * default left pointing at OpenAI while the resolved config is Bedrock-only
     * fails every turn with "openai configuration is required" — and the
     * reverse once the last Bedrock credential is deleted.
     */
    private async reconcileDefaultModelForCredentials(
        organizationUuid: string,
    ): Promise<void> {
        const stored =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        const currentDefault = stored?.defaultAiAgentModelConfig;
        if (!currentDefault) return;

        const { credentials } =
            await this.aiOrganizationProviderCredentialModel.findAllByOrganizationUuid(
                organizationUuid,
            );
        const defaultCredential = credentials.find((c) => c.isDefault) ?? null;

        if (defaultCredential) {
            // Bedrock replaces the provider set outright, so the default must
            // name one of that credential's allowed models.
            if (
                currentDefault.modelProvider === 'bedrock' &&
                defaultCredential.allowedModels.includes(
                    currentDefault.modelName,
                )
            ) {
                return;
            }
            await this.aiOrganizationSettingsModel.update(organizationUuid, {
                defaultAiAgentModelConfig: {
                    modelName: defaultCredential.allowedModels[0],
                    modelProvider: 'bedrock',
                },
            });
            return;
        }

        // No credentials left: a stored Bedrock default can no longer resolve,
        // so repoint it at a model the instance config actually serves.
        if (currentDefault.modelProvider !== 'bedrock') return;
        const overrides =
            await this.orgAiCopilotConfigResolver.getOrgModelOverrides(
                organizationUuid,
            );
        const remaining = filterModelsForOrg(
            getAvailableModels(this.lightdashConfig.ai.copilot),
            overrides,
        );
        await this.aiOrganizationSettingsModel.update(organizationUuid, {
            defaultAiAgentModelConfig: pickReplacementDefaultModelConfig(
                remaining,
                getDefaultModel(this.lightdashConfig.ai.copilot),
                currentDefault,
            ),
        });
    }

    async createProviderCredential(
        user: SessionUser,
        data: CreateAiProviderCredential,
    ): Promise<{ uuid: string }> {
        this.checkManageAiAgentAccess(user);
        const organizationUuid = user.organizationUuid!;
        await this.adoptLegacyBedrockCredential(user, organizationUuid);
        const uuid = await this.aiOrganizationProviderCredentialModel.create(
            organizationUuid,
            user.userUuid,
            data,
        );
        await this.mirrorDefaultCredentialToLegacyBlob(organizationUuid);
        await this.reconcileDefaultModelForCredentials(organizationUuid);
        return { uuid };
    }

    async updateProviderCredential(
        user: SessionUser,
        credentialUuid: string,
        data: UpdateAiProviderCredential,
    ): Promise<void> {
        this.checkManageAiAgentAccess(user);
        await this.aiOrganizationProviderCredentialModel.update(
            user.organizationUuid!,
            credentialUuid,
            data,
        );
    }

    /**
     * Overwrite a credential wholesale. The only way back for a row whose
     * ciphertext can no longer be decrypted, since `update` has to merge with
     * the stored config and cannot read it.
     */
    async replaceProviderCredential(
        user: SessionUser,
        credentialUuid: string,
        data: CreateAiProviderCredential,
    ): Promise<void> {
        this.checkManageAiAgentAccess(user);
        await this.aiOrganizationProviderCredentialModel.replace(
            user.organizationUuid!,
            credentialUuid,
            data,
        );
        await this.mirrorDefaultCredentialToLegacyBlob(user.organizationUuid!);
        await this.reconcileDefaultModelForCredentials(user.organizationUuid!);
    }

    async deleteProviderCredential(
        user: SessionUser,
        credentialUuid: string,
    ): Promise<void> {
        this.checkManageAiAgentAccess(user);
        await this.aiOrganizationProviderCredentialModel.delete(
            user.organizationUuid!,
            credentialUuid,
        );
        await this.mirrorDefaultCredentialToLegacyBlob(user.organizationUuid!);
        await this.reconcileDefaultModelForCredentials(user.organizationUuid!);
    }

    async setDefaultProviderCredential(
        user: SessionUser,
        credentialUuid: string,
    ): Promise<void> {
        this.checkManageAiAgentAccess(user);
        await this.aiOrganizationProviderCredentialModel.setDefault(
            user.organizationUuid!,
            credentialUuid,
        );
        await this.mirrorDefaultCredentialToLegacyBlob(user.organizationUuid!);
        await this.reconcileDefaultModelForCredentials(user.organizationUuid!);
    }

    /**
     * Pinning a project to a region is a compliance decision, so it is gated on
     * organization-level AI administration rather than project membership.
     */
    private async assertProjectInOrganization(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        this.checkManageAiAgentAccess(user);
        const organizationUuid = user.organizationUuid!;
        const project = await this.projectModel.getSummary(projectUuid);
        if (project.organizationUuid !== organizationUuid) {
            throw new ForbiddenError(
                'Project does not belong to this organization',
            );
        }
        return organizationUuid;
    }

    async getProjectProviderCredential(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectAiCredentialSelection> {
        await this.assertProjectInOrganization(user, projectUuid);
        const credentialUuid =
            await this.aiOrganizationProviderCredentialModel.findProjectCredentialUuid(
                projectUuid,
            );
        return { credentialUuid };
    }

    async setProjectProviderCredential(
        user: SessionUser,
        projectUuid: string,
        credentialUuid: string | null,
    ): Promise<void> {
        const organizationUuid = await this.assertProjectInOrganization(
            user,
            projectUuid,
        );
        // Resolved through the organization so a project can never be pinned to
        // another organization's credential.
        if (credentialUuid !== null) {
            const resolution =
                await this.aiOrganizationProviderCredentialModel.findDecrypted(
                    organizationUuid,
                    credentialUuid,
                );
            if (resolution.status === 'none') {
                throw new ParameterError('AI provider credential not found');
            }
            // Refused at pin time rather than at the project's first AI
            // request, which would otherwise fail with no obvious cause.
            if (resolution.status === 'unreadable') {
                throw new ParameterError(
                    'That credential cannot be read with the current encryption secret. Replace its API key before pinning a project to it.',
                );
            }
        }
        await this.aiOrganizationProviderCredentialModel.setProjectCredential(
            projectUuid,
            credentialUuid,
        );
    }
}
