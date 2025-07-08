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
};
