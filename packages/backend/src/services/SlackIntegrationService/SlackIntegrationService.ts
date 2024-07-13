import {
    ForbiddenError,
    NotFoundError,
    SessionUser,
    SlackSettings,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { BaseService } from '../BaseService';

type SlackIntegrationServiceArguments<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> = {
    analytics: LightdashAnalytics;
    slackAuthenticationModel: T;
};

export class SlackIntegrationService<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> extends BaseService {
    private readonly analytics: LightdashAnalytics;

    protected readonly slackAuthenticationModel: T;

    constructor(args: SlackIntegrationServiceArguments<T>) {
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
            return {
                slackEnabled: false
            };
            // throw new NotFoundError(
            //     `Could not find an installation for organizationUuid ${organizationUuid}`,
            // );
        }
        const response: SlackSettings = {
            organizationUuid,
            slackTeamName: slackAuth.slackTeamName,
            createdAt: slackAuth.createdAt,
            scopes: slackAuth.scopes,
            notificationChannel: slackAuth.notificationChannel,
            appProfilePhotoUrl: slackAuth.appProfilePhotoUrl,
            slackEnabled: true
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
