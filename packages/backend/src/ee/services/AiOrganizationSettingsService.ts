import { subject } from '@casl/ability';
import {
    AiOrganizationSettings,
    CommercialFeatureFlags,
    ComputedAiOrganizationSettings,
    ForbiddenError,
    LightdashUser,
    UpdateAiOrganizationSettings,
    type SessionUser,
} from '@lightdash/common';
import { OrganizationModel } from '../../models/OrganizationModel';
import { AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';

type AiOrganizationSettingsServiceDependencies = {
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    organizationModel: OrganizationModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
};

export class AiOrganizationSettingsService {
    private readonly aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private readonly organizationModel: OrganizationModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    // Date when trial feature was enabled for new organizations
    private static readonly TRIAL_START_DATE = new Date('2025-10-13T00:00:00Z');

    constructor(dependencies: AiOrganizationSettingsServiceDependencies) {
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.organizationModel = dependencies.organizationModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
    }

    private static checkManageAiAgentAccess(user: SessionUser): void {
        if (
            user.ability.cannot(
                'manage',
                subject('AiAgent', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage AI agent settings',
            );
        }
    }

    private async getIsCopilotEnabled(
        user: Pick<
            LightdashUser,
            'userUuid' | 'organizationUuid' | 'organizationName'
        >,
    ): Promise<boolean> {
        const isCopilotEnabled = await this.commercialFeatureFlagModel.get({
            user,
            featureFlagId: CommercialFeatureFlags.AiCopilot,
        });
        return isCopilotEnabled.enabled;
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
                isTrial: isTrialEligible,
            };
        }

        return {
            ...settings,
            isTrial: isTrialEligible,
            isCopilotEnabled,
        };
    }

    async upsertSettings(
        user: SessionUser,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        AiOrganizationSettingsService.checkManageAiAgentAccess(user);

        return this.aiOrganizationSettingsModel.upsert(
            user.organizationUuid,
            data,
        );
    }
}
