import { type SlackChannelProjectMapping } from './slack';

export type SlackSettings = {
    organizationUuid: string;
    slackTeamName: string;
    createdAt: Date;
    token?: string;
    scopes: string[];
    notificationChannel: string | undefined;
    appProfilePhotoUrl: string | undefined;
    slackChannelProjectMappings?: SlackChannelProjectMapping[];
};

export const slackRequiredScopes = [
    'links:read',
    'links:write',
    'chat:write',
    'chat:write.customize',
    'channels:read',
    'channels:join',
    'users:read',
    'files:write',
    'files:read',
];
