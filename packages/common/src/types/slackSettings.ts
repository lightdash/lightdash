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
    slackEnabled: boolean;
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
    'files:write',
    'files:read',
];
