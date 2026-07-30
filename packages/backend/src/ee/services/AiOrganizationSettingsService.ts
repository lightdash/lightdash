import { subject } from '@casl/ability';
import {
    AiOrganizationSettings,
    BYO_AI_PROVIDERS,
    CommercialFeatureFlags,
    ComputedAiOrganizationSettings,
    ForbiddenError,
    getVisibleDataAppClaudeModels,
    LightdashUser,
    ParameterError,
    UpdateAiOrganizationSettings,
    UpdateAiProviderApiKeys,
    type AiAgentModelConfig,
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
    type ModelPresetProvider,
} from './ai/models/presets';
import {
    OrgAiCopilotConfigResolver,
    type ReviewJudgeAvailability,
} from './ai/OrgAiCopilotConfigResolver';

type AvailableModelPreset = ModelPreset<ModelPresetProvider>;

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
 * Redact partial key material (hints) and the "key is set" booleans for callers
 * without the manage-AI-agent ability. Non-admin org members read the settings
 * endpoint (agent chat surfaces) and must not see key hints.
 */
export const maskProviderKeyExposure = (
    settings: AiOrganizationSettings,
    canManage: boolean,
): AiOrganizationSettings =>
    canManage
        ? settings
        : {
              ...settings,
              providerApiKeysSet: { anthropic: false, openai: false },
              providerApiKeyHints: { anthropic: null, openai: null },
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

    async getSettings(
        user: SessionUser,
    ): Promise<AiOrganizationSettings & ComputedAiOrganizationSettings> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        const isCopilotEnabled = await this.getIsCopilotEnabled(user);

        // Check if organization qualifies for trial
        const isTrialEligible = await this.isEligibleForTrial(
            isCopilotEnabled,
            user.organizationUuid,
        );

        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                user.organizationUuid,
            );

        // Partial key material (hints) and the "key is set" booleans are only
        // exposed to org admins; other members read this endpoint too (agent
        // chat surfaces) but must not see another org member's key hints.
        const canManage = this.canManageAiAgent(user);

        const [
            { effectiveOptions, configurableOptions, effectiveModelVisibility },
            reviewJudge,
            effectiveDataAppModelVisibility,
        ] = await Promise.all([
            this.getModelOptionLists(user.organizationUuid),
            this.orgAiCopilotConfigResolver.getReviewJudgeAvailability(
                user.organizationUuid,
            ),
            this.orgAiCopilotConfigResolver.getDataAppModelVisibility(
                user.organizationUuid,
            ),
        ]);

        // Reviews are paused when the org's own key can't serve the review model
        // (we never fall back to the instance provider for their turn data).
        const aiAgentReviewsPausedByByok =
            reviewJudge.hasActiveByoKey && !reviewJudge.canJudgeOnByoKey;

        // Return default settings if none exist
        if (!settings) {
            return {
                organizationUuid: user.organizationUuid,
                isCopilotEnabled,
                aiAgentsVisible: true,
                aiAgentReviewsEnabled: false,
                mcpContentWritesEnabled: true,
                requireExplicitSlackChannelLinking: false,
                defaultAiAgentModelConfig: null,
                modelVisibility: effectiveModelVisibility,
                dataAppModelVisibility: null,
                providerApiKeysSet: { anthropic: false, openai: false },
                providerApiKeyHints: { anthropic: null, openai: null },
                defaultAiAgentModelOptions: effectiveOptions,
                configurableModelOptions: canManage
                    ? configurableOptions
                    : null,
                aiAgentReviewsPausedByByok,
                isTrial: isTrialEligible,
            };
        }

        return {
            ...maskProviderKeyExposure(settings, canManage),
            // Surface the effective visibility (implicit BYOK defaults merged in)
            // so the admin card reflects what users actually see.
            modelVisibility: effectiveModelVisibility,
            // Likewise: stored Data App settings are inert without a BYO key,
            // so the picker must not filter on them when the backend won't.
            dataAppModelVisibility: effectiveDataAppModelVisibility,
            isTrial: isTrialEligible,
            isCopilotEnabled,
            defaultAiAgentModelOptions: effectiveOptions,
            configurableModelOptions: canManage ? configurableOptions : null,
            aiAgentReviewsPausedByByok,
        };
    }

    async upsertSettings(
        user: SessionUser,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        this.checkManageAiAgentAccess(user);

        // Set when hiding models orphans the org's configured default, so the
        // write can repoint it in the same upsert.
        let reconciledDefaultModelConfig: AiAgentModelConfig | null | undefined;

        // The model-visibility validation below reads the CURRENT key's model
        // access, which would be stale if the key changed in the same request
        // (e.g. restrict to only a key-unlocked model while swapping to a key
        // that can't reach it → zero models). Require separate requests so the
        // two never race.
        if (
            data.providerApiKeys !== undefined &&
            data.modelVisibility !== undefined
        ) {
            throw new ParameterError(
                'Update provider API keys and model visibility in separate requests',
            );
        }

        if (
            data.providerApiKeys !== undefined ||
            data.modelVisibility !== undefined
        ) {
            // BYO keys and model visibility require both AI copilot (env/ai-copilot
            // flag) and the org-ai-provider-api-keys flag to be enabled for this org.
            const [copilotEnabled, byoKeysEnabled] = await Promise.all([
                this.getIsCopilotEnabled(user),
                this.orgAiCopilotConfigResolver.isEnabled(
                    user.organizationUuid,
                ),
            ]);
            if (!copilotEnabled || !byoKeysEnabled) {
                throw new ForbiddenError(
                    'Organization AI provider API keys are not enabled',
                );
            }
        }

        if (data.providerApiKeys !== undefined) {
            const unconfigured = findUnconfiguredProviderKeyWrites(
                data.providerApiKeys,
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
        if (data.modelVisibility || data.defaultAiAgentModelConfig) {
            // Validate against the EFFECTIVE visibility (implicit auto-hide
            // merged under the submission) and real key access — so disabling
            // the only provider whose toggle isn't locked can't leave an empty
            // selector, and an allowlist of only a key-unlocked hidden model
            // (e.g. opus 4.8) still counts. When this request doesn't touch
            // visibility, validate against what is already stored.
            const [overrides, submittedVisibility] = await Promise.all([
                this.orgAiCopilotConfigResolver.getOrgModelOverrides(
                    user.organizationUuid,
                ),
                data.modelVisibility
                    ? this.orgAiCopilotConfigResolver.resolveEffectiveModelVisibilityForOrg(
                          user.organizationUuid,
                          data.modelVisibility,
                      )
                    : null,
            ]);
            const effectiveVisibility = data.modelVisibility
                ? submittedVisibility
                : overrides.modelVisibility;
            const remaining = filterModelsForOrg(
                getAvailableModels(this.lightdashConfig.ai.copilot),
                {
                    modelVisibility: effectiveVisibility,
                    keyAccessibleModelIds: overrides.keyAccessibleModelIds,
                },
            );
            if (data.modelVisibility && remaining.length === 0) {
                throw new ParameterError(
                    'At least one AI model must remain available',
                );
            }

            if (
                data.defaultAiAgentModelConfig &&
                !isModelConfigAvailable(
                    data.defaultAiAgentModelConfig,
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
                data.modelVisibility &&
                data.defaultAiAgentModelConfig === undefined
            ) {
                const currentDefault = (
                    await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                        user.organizationUuid,
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

        if (data.dataAppModelVisibility) {
            const remainingDataAppModels = getVisibleDataAppClaudeModels(
                data.dataAppModelVisibility,
            );
            if (remainingDataAppModels.length === 0) {
                throw new ParameterError(
                    'At least one Data App model must remain available',
                );
            }
        }

        return this.aiOrganizationSettingsModel.upsert(
            user.organizationUuid,
            reconciledDefaultModelConfig === undefined
                ? data
                : {
                      ...data,
                      defaultAiAgentModelConfig: reconciledDefaultModelConfig,
                  },
        );
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
