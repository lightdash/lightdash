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
};

export const slackRequiredScopes = [
    'links:read',
    'links:write',
    'chat:write',
    'chat:write.customize',
    'channels:read',
    'channels:join',
    'groups:read',
    'users:read',
    'app_mentions:read',
    'files:write',
    'files:read',
];
