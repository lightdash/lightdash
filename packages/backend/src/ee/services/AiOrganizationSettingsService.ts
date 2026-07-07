import { subject } from '@casl/ability';
import {
    AiOrganizationSettings,
    BYO_AI_PROVIDERS,
    CommercialFeatureFlags,
    ComputedAiOrganizationSettings,
    ForbiddenError,
    LightdashUser,
    ParameterError,
    UpdateAiOrganizationSettings,
    UpdateAiProviderApiKeys,
    type AiModelOption,
    type ByoAiProvider,
    type SessionUser,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationModel } from '../../models/OrganizationModel';
import { BaseService } from '../../services/BaseService';
import { AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';
import { getAvailableModels, getDefaultModel } from './ai/models';
import { matchesPreset } from './ai/models/presets';
import { OrgAiCopilotConfigResolver } from './ai/OrgAiCopilotConfigResolver';

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

    private async getDefaultModelOptions(
        organizationUuid: string,
    ): Promise<AiModelOption[]> {
        const copilotConfig =
            await this.orgAiCopilotConfigResolver.getCopilotConfig(
                organizationUuid,
            );
        const defaultModel = getDefaultModel(copilotConfig);

        return getAvailableModels(copilotConfig).map((preset) => ({
            name: preset.name,
            displayName: preset.displayName,
            description: preset.description,
            provider: preset.provider,
            default:
                defaultModel !== null &&
                preset.provider === defaultModel.provider &&
                matchesPreset(preset, defaultModel.name),
            supportsReasoning: preset.supportsReasoning,
        }));
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

        // Return default settings if none exist
        if (!settings) {
            return {
                organizationUuid: user.organizationUuid,
                isCopilotEnabled,
                aiAgentsVisible: true,
                aiAgentReviewsEnabled: false,
                mcpContentWritesEnabled: true,
                defaultAiAgentModelConfig: null,
                providerApiKeysSet: { anthropic: false, openai: false },
                providerApiKeyHints: { anthropic: null, openai: null },
                defaultAiAgentModelOptions: await this.getDefaultModelOptions(
                    user.organizationUuid,
                ),
                isTrial: isTrialEligible,
            };
        }

        // Partial key material (hints) and the "key is set" booleans are only
        // exposed to org admins; other members read this endpoint too (agent
        // chat surfaces) but must not see another org member's key hints.
        const canManage = this.canManageAiAgent(user);

        return {
            ...maskProviderKeyExposure(settings, canManage),
            isTrial: isTrialEligible,
            isCopilotEnabled,
            defaultAiAgentModelOptions: await this.getDefaultModelOptions(
                user.organizationUuid,
            ),
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

        if (data.providerApiKeys !== undefined) {
            // BYO keys require both AI copilot (env/ai-copilot flag) and the
            // org-ai-provider-api-keys flag to be enabled for this org.
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

        return this.aiOrganizationSettingsModel.upsert(
            user.organizationUuid,
            data,
        );
    }

    async isAiAgentReviewsEnabled(
        user: Pick<LightdashUser, 'organizationUuid'>,
    ): Promise<boolean> {
        if (!user.organizationUuid) {
            return false;
        }

        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                user.organizationUuid,
            );

        return settings?.aiAgentReviewsEnabled ?? false;
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
