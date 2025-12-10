import { type SchedulerJobStatus } from './scheduler';
import { type SlackChannelProjectMapping } from './slack';

export type SlackSettings = {
    organizationUuid: string;
    slackTeamName: string;
    appName?: string;
    createdAt: Date;
    token?: string;
    scopes: string[];
    notificationChannel: string | undefined;
    appProfilePhotoUrl: string | undefined;
    slackChannelProjectMappings?: SlackChannelProjectMapping[];
    aiThreadAccessConsent?: boolean;
    hasRequiredScopes: boolean;
    aiRequireOAuth?: boolean;
    aiMultiAgentChannelId?: string;
    /** Current status of the Slack channels cache sync job */
    channelsSyncStatus?: SchedulerJobStatus | null;
};
