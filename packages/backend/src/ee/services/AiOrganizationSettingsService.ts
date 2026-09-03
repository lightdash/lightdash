import { subject } from '@casl/ability';
import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AiOrganizationRuntimeSettings,
    AiOrganizationSettings,
    BYO_AI_PROVIDERS,
    CommercialFeatureFlags,
    ComputedAiOrganizationSettings,
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
    type ByoAiProvider,
    type SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationModel } from '../../models/OrganizationModel';
import { BaseService } from '../../services/BaseService';
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

export const validateDeepResearchLimits = (
    limits: AiDeepResearchLimits,
): void => {
    (
        Object.entries(limits) as Array<[keyof AiDeepResearchLimits, number]>
    ).forEach(([key, value]) => {
        if (!Number.isInteger(value) || value <= 0) {
            throw new ParameterError(`${key} must be a positive integer`);
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
    organizationModel: OrganizationModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
    lightdashConfig: LightdashConfig;
    orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;
};

export class AiOrganizationSettingsService extends BaseService {
    private readonly aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private readonly organizationModel: OrganizationModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly orgAiCopilotConfigResolver: OrgAiCopilotConfigResolver;

    // Date when trial feature was enabled for new organizations
    private static readonly TRIAL_START_DATE = new Date('2025-10-13T00:00:00Z');

    constructor(dependencies: AiOrganizationSettingsServiceDependencies) {
        super();
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.organizationModel = dependencies.organizationModel;
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
    }> {
        const [copilotConfig, overrides] = await Promise.all([
            this.orgAiCopilotConfigResolver.getCopilotConfig(organizationUuid),
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
            { effectiveOptions, configurableOptions, effectiveModelVisibility },
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
                requireExplicitSlackChannelLinking: false,
                defaultAiAgentModelConfig: null,
                modelVisibility: effectiveModelVisibility,
                dataAppModelVisibility: null,
                providerApiKeysSet: { anthropic: false, openai: false },
                providerApiKeyHints: { anthropic: null, openai: null },
                threadRetentionHours: null,
                defaultAiAgentModelOptions: effectiveOptions,
                configurableModelOptions: configurableOptions,
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
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        await this.checkAiSettingsAccess(user, organizationUuid);

        const { aiAgentMemoryEnabled, ...aiSettingsUpdate } = data;
        const isMemoryOnlyUpdate =
            aiAgentMemoryEnabled !== undefined &&
            Object.keys(aiSettingsUpdate).length === 0;

        if (isMemoryOnlyUpdate) {
            await this.organizationModel.updateAiAgentMemoryEnabled(
                organizationUuid,
                aiAgentMemoryEnabled,
            );
            return this.getSettings(user);
        }

        if (aiSettingsUpdate.deepResearchLimits !== undefined) {
            validateDeepResearchLimits(aiSettingsUpdate.deepResearchLimits);
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

        // A supplied default has to be checked against the visibility the write
        // lands on, whether or not this request is the one changing it —
        // visibility filters model LISTINGS only, never resolution, so a
        // default pointing at a restricted model would still be served.
        if (
            aiSettingsUpdate.modelVisibility ||
            aiSettingsUpdate.defaultAiAgentModelConfig
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
        const settings =
            aiAgentMemoryEnabled === undefined
                ? await this.aiOrganizationSettingsModel.upsert(
                      organizationUuid,
                      update,
                  )
                : await this.aiOrganizationSettingsModel.transaction(
                      async (trx) => {
                          const updatedSettings =
                              await this.aiOrganizationSettingsModel.upsert(
                                  organizationUuid,
                                  update,
                                  trx,
                              );
                          await this.organizationModel.updateAiAgentMemoryEnabled(
                              organizationUuid,
                              aiAgentMemoryEnabled,
                              trx,
                          );
                          return updatedSettings;
                      },
                  );

        return {
            ...settings,
            aiAgentMemoryEnabled:
                aiAgentMemoryEnabled ??
                (await this.isAiAgentMemoryEnabled(user)),
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
}
