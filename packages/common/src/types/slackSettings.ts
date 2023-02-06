import intersection from 'lodash-es/intersection';

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

export const hasRequiredScopes = (slackSettings: SlackSettings) =>
    intersection(slackSettings.scopes, slackRequiredScopes) ===
    slackRequiredScopes;
