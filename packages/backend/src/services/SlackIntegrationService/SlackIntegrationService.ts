import {
    ForbiddenError,
    NotFoundError,
    SessionUser,
    SlackAppCustomSettings,
    SlackChannel,
    SlackSettings,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { BaseService } from '../BaseService';

export type SlackIntegrationServiceArguments<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> = {
    analytics: LightdashAnalytics;
    slackAuthenticationModel: T;
    slackClient: SlackClient;
};

export class SlackIntegrationService<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> extends BaseService {
    private readonly analytics: LightdashAnalytics;

    protected readonly slackAuthenticationModel: T;

    protected readonly slackClient: SlackClient;

    constructor(args: SlackIntegrationServiceArguments<T>) {
        super();
        this.analytics = args.analytics;
        this.slackAuthenticationModel = args.slackAuthenticationModel;
        this.slackClient = args.slackClient;
    }

    async getSlackInstallOptions(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError();
        }

        const slackOptions = this.slackClient.getSlackOptions();

        const metadata = {
            organizationUuid: user.organizationUuid,
            userId: user.userId,
        };

        this.analytics.track({
            event: 'share_slack.install',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
            },
        });

        return { slackOptions, metadata };
    }

    async trackInstallError(user: SessionUser, error: unknown) {
        this.analytics.track({
            event: 'share_slack.install_error',
            userId: user.userUuid,
            anonymousId: !user.userUuid
                ? LightdashAnalytics.anonymousId
                : undefined,
            properties: {
                error: `${error}`,
            },
        });
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
            ),
        };
        return response;
    }

    async deleteInstallationFromOrganizationUuid(user: SessionUser) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

        if (user.ability.cannot('manage', 'Organization')) {
            throw new ForbiddenError();
        }

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

    async getChannels(
        user: SessionUser,
        options: {
            search?: string;
            excludeArchived?: boolean;
            excludeDms?: boolean;
            excludeGroups?: boolean;
            forceRefresh?: boolean;
        },
    ): Promise<SlackChannel[] | undefined> {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

        return this.slackClient.getChannels(
            organizationUuid,
            options.search,
            options,
        );
    }

    async updateAppCustomSettings(
        user: SessionUser,
        body: SlackAppCustomSettings,
    ) {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

        return this.slackClient.updateAppCustomSettings(
            `${user.firstName} ${user.lastName}`,
            organizationUuid,
            body,
        );
    }
}
