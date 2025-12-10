import {
    AlreadyExistsError,
    ForbiddenError,
    NotFoundError,
    SchedulerJobStatus,
    SessionUser,
    SlackAppCustomSettings,
    SlackChannel,
    SlackSettings,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';

export type SlackIntegrationServiceArguments<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> = {
    analytics: LightdashAnalytics;
    slackAuthenticationModel: T;
    slackClient: SlackClient;
    schedulerClient: SchedulerClient;
};

export class SlackIntegrationService<
    T extends SlackAuthenticationModel = SlackAuthenticationModel,
> extends BaseService {
    private readonly analytics: LightdashAnalytics;

    protected readonly slackAuthenticationModel: T;

    protected readonly slackClient: SlackClient;

    protected readonly schedulerClient: SchedulerClient;

    constructor(args: SlackIntegrationServiceArguments<T>) {
        super();
        this.analytics = args.analytics;
        this.slackAuthenticationModel = args.slackAuthenticationModel;
        this.slackClient = args.slackClient;
        this.schedulerClient = args.schedulerClient;
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
            includeChannelIds?: string[];
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

    /**
     * Look up a single channel by ID or name. Used for on-demand fetching when
     * user types a channel ID or name not in the cache.
     * - If input looks like a Slack ID (C/G/U/W + alphanumerics), looks up by ID
     * - Otherwise, searches by name (e.g., "#my-channel" or "my-channel")
     */
    async lookupChannelById(
        user: SessionUser,
        input: string,
    ): Promise<SlackChannel | null> {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

        return this.slackClient.lookupChannelById(organizationUuid, input);
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

    /**
     * Trigger a Slack channel sync job for the user's organization.
     * This queues a background job to fetch all channels from Slack and update the cache.
     */
    async triggerSlackChannelSync(
        user: SessionUser,
    ): Promise<{ jobId: string }> {
        const organizationUuid = user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();

        if (user.ability.cannot('manage', 'Organization')) {
            throw new ForbiddenError();
        }

        // Verify organization has Slack installation
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) {
            throw new NotFoundError('Slack installation not found');
        }

        // Check if a sync is already in progress
        if (installation.channelsSyncStatus === SchedulerJobStatus.STARTED) {
            throw new AlreadyExistsError(
                'A Slack channel sync is already in progress',
            );
        }

        const jobId = await this.schedulerClient.syncSlackChannelsJob({
            organizationUuid,
            userUuid: undefined,
            projectUuid: undefined,
        });

        this.analytics.track({
            event: 'share_slack.sync_channels_triggered',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
            },
        });

        return { jobId };
    }
}
