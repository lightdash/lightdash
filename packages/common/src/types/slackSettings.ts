export type SlackSettings = {
    organizationUuid: string;
    slackTeamName: string;
    createdAt: Date;
    token?: string;
    scopes: string[];
};

export const slackRequiredScopes = [
    'links:read',
    'links:write',
    'chat:write',
    'channels:read',
    'channels:join',
    'im:read',
    'groups:read',
    'mpim:read',
    'users:read',
];
