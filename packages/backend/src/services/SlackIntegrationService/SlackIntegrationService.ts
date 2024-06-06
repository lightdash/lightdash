import {
    ForbiddenError,
    NotFoundError,
    SessionUser,
    SlackSettings,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { BaseService } from '../BaseService';

type SlackIntegrationServiceArguments = {
    analytics: LightdashAnalytics;
    slackAuthenticationModel: SlackAuthenticationModel;
};

export class SlackIntegrationService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly slackAuthenticationModel: SlackAuthenticationModel;

    constructor(args: SlackIntegrationServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.slackAuthenticationModel = args.slackAuthenticationModel;
    }

    async getInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        const slackAuth =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );
        if (slackAuth === undefined) {
            throw new NotFoundError(
                `Could not find an installation for organizationUuid ${organizationUuid}`,
            );
        }
        const response: SlackSettings = {
            organizationUuid,
            slackTeamName: slackAuth.slackTeamName,
            createdAt: slackAuth.createdAt,
            scopes: slackAuth.scopes,
            notificationChannel: slackAuth.notificationChannel,
            appName: slackAuth.appName,
            appProfilePhotoUrl: slackAuth.appProfilePhotoUrl,
        };
        return response;
    }

    async deleteInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        await this.slackAuthenticationModel.deleteInstallationFromOrganizationUuid(
            organizationUuid,
        );

        this.analytics.track({
            event: 'share_slack.delete',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
            },
        });
    }
}
