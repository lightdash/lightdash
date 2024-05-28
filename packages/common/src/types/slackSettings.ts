export type SlackSettings = {
    organizationUuid: string;
    slackTeamName: string;
    createdAt: Date;
    token?: string;
    scopes: string[];
    notificationChannel: string | undefined;
};

export const slackRequiredScopes = [
    'links:read',
    'links:write',
    'chat:write',
    'channels:read',
    'channels:join',
    'users:read',
    'files:write',
    'files:read',
];
