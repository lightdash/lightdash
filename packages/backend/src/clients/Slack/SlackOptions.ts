import { slackAuthenticationModel } from '../../models/models';

export const slackOptions = {
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    stateSecret: process.env.SLACK_STATE_SECRET || '',
    scopes: [
        'links:read',
        'links:write',
        'files:write',
        'files:read',
        'channels:read',
    ],

    // Slack only allow https on redirections
    // When testing locally on http://localhost:3000, replace again https:// with http:// after redirection happens
    redirectUri: `${(process.env.SITE_URL || '').replace(
        'http://',
        'https://',
    )}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        redirectUriPath: '/slack/oauth_redirect',
        userScopes: ['identify', 'files:write', 'files:read'],
    },
};
