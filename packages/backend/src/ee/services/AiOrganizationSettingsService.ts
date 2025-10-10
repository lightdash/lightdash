import { subject } from '@casl/ability';
import {
    AiOrganizationSettings,
    ForbiddenError,
    UpdateAiOrganizationSettings,
    type SessionUser,
} from '@lightdash/common';
import { AiOrganizationSettingsModel } from '../models/AiOrganizationSettingsModel';

type AiOrganizationSettingsServiceDependencies = {
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
};

export class AiOrganizationSettingsService {
    private readonly aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    constructor(dependencies: AiOrganizationSettingsServiceDependencies) {
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
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

    async getSettings(user: SessionUser): Promise<AiOrganizationSettings> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }

        AiOrganizationSettingsService.checkManageAiAgentAccess(user);

        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                user.organizationUuid,
            );

        // Return default settings if none exist
        if (!settings) {
            return {
                organizationUuid: user.organizationUuid,
                aiAgentsVisible: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        return settings;
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

    /**
     * Check if AI agents are visible for an organization
     * This is used internally by other services to check if AI features should be available
     */
    async areAiAgentsVisible(organizationUuid: string): Promise<boolean> {
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );

        // Default to false if no settings exist (AI agents not visible by default)
        return settings?.aiAgentsVisible ?? false;
    }
}
