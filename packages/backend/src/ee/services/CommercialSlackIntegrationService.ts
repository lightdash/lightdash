import {
    Account,
    FeatureFlags,
    ForbiddenError,
    SessionUser,
    SlackSettings,
} from '@lightdash/common';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import {
    SlackIntegrationService,
    SlackIntegrationServiceArguments,
} from '../../services/SlackIntegrationService/SlackIntegrationService';
import { AiAgentModel } from '../models/AiAgentModel';
import { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

export class CommercialSlackIntegrationService extends SlackIntegrationService<CommercialSlackAuthenticationModel> {
    private readonly aiAgentModel: AiAgentModel;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        aiAgentModel,
        featureFlagModel,
        ...rest
    }: SlackIntegrationServiceArguments<CommercialSlackAuthenticationModel> & {
        aiAgentModel: AiAgentModel;
        featureFlagModel: FeatureFlagModel;
    }) {
        super(rest);

        this.aiAgentModel = aiAgentModel;
        this.featureFlagModel = featureFlagModel;
    }

    private async isModernSlackAiAgentEnabled(user: SessionUser) {
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AiAgentSlackModernBlocks,
        });

        return flag.enabled;
    }

    async getSlackInstallOptions(user: SessionUser) {
        const includeAiAgentSlackModernScopes =
            await this.isModernSlackAiAgentEnabled(user);

        const { slackOptions, metadata } = await super.getSlackInstallOptions(
            user,
        );

        return {
            slackOptions: {
                ...slackOptions,
                scopes: this.slackClient.getRequiredScopes({
                    includeAiAgentSlackModernScopes,
                }),
            },
            metadata,
        };
    }

    async getInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (installation === undefined) return undefined;

        const appName = await this.slackClient.getAppName(organizationUuid);

        const response: SlackSettings = {
            organizationUuid,
            slackTeamName: installation.slackTeamName,
            appName,
            createdAt: installation.createdAt,
            scopes: installation.scopes,
            notificationChannel: installation.notificationChannel,
            appProfilePhotoUrl: installation.appProfilePhotoUrl,
            hasRequiredScopes: this.slackClient.hasRequiredScopes(
                installation.scopes,
                {
                    includeAiAgentSlackModernScopes:
                        await this.isModernSlackAiAgentEnabled(user),
                },
            ),
            slackChannelProjectMappings:
                installation.slackChannelProjectMappings,
            aiThreadAccessConsent: installation.aiThreadAccessConsent,
            aiRequireOAuth: installation.aiRequireOAuth,
            aiMultiAgentChannelId: installation.aiMultiAgentChannelId,
            aiMultiAgentProjectUuids: installation.aiMultiAgentProjectUuids,
        };

        return response;
    }

    async deleteInstallationFromOrganizationUuid(account: Account) {
        await super.deleteInstallationFromOrganizationUuid(account);

        await this.aiAgentModel.deleteSlackIntegrations({
            organizationUuid: account.organization.organizationUuid!,
        });
    }
}
