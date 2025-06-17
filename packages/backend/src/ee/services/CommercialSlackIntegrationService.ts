import { ForbiddenError, SessionUser, SlackSettings } from '@lightdash/common';
import {
    SlackIntegrationService,
    SlackIntegrationServiceArguments,
} from '../../services/SlackIntegrationService/SlackIntegrationService';
import { AiAgentModel } from '../models/AiAgentModel';
import { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

export class CommercialSlackIntegrationService extends SlackIntegrationService<CommercialSlackAuthenticationModel> {
    private readonly aiAgentModel: AiAgentModel;

    constructor({
        aiAgentModel,
        ...rest
    }: SlackIntegrationServiceArguments<CommercialSlackAuthenticationModel> & {
        aiAgentModel: AiAgentModel;
    }) {
        super(rest);

        this.aiAgentModel = aiAgentModel;
    }

    async getInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

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
            slackChannelProjectMappings:
                installation.slackChannelProjectMappings,
            aiThreadAccessConsent: installation.aiThreadAccessConsent,
        };

        return response;
    }

    async deleteInstallationFromOrganizationUuid(user: SessionUser) {
        await super.deleteInstallationFromOrganizationUuid(user);

        await this.aiAgentModel.deleteSlackIntegrations({
            organizationUuid: user.organizationUuid!,
        });
    }
}
