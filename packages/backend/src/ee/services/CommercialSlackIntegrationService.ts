import { ForbiddenError, SessionUser, SlackSettings } from '@lightdash/common';
import { SlackIntegrationService } from '../../services/SlackIntegrationService/SlackIntegrationService';
import { CommercialSlackAuthenticationModel } from '../models/CommercialSlackAuthenticationModel';

export class CommercialSlackIntegrationService extends SlackIntegrationService<CommercialSlackAuthenticationModel> {
    async getInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (installation === undefined) return undefined;

        const response: SlackSettings = {
            organizationUuid,
            slackTeamName: installation.slackTeamName,
            createdAt: installation.createdAt,
            scopes: installation.scopes,
            notificationChannel: installation.notificationChannel,
            appProfilePhotoUrl: installation.appProfilePhotoUrl,
            slackChannelProjectMappings:
                installation.slackChannelProjectMappings,
        };

        return response;
    }
}
