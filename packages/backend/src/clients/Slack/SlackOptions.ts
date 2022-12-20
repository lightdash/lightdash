import { lightdashConfig } from '../../config/lightdashConfig';

export const slackOptions = {
    signingSecret: lightdashConfig.slack.signingSecret || '',
    clientId: lightdashConfig.slack.clientId || '',
    clientSecret: lightdashConfig.slack.clientSecret || '',
    stateSecret: lightdashConfig.slack.stateSecret,
    scopes: ['links:read', 'links:write'],

    // Slack only allow https on redirections
    // When testing locally on http://localhost:3000, replace again https:// with http:// after redirection happens
    redirectUri: `${lightdashConfig.siteUrl.replace(
        'http://',
        'https://',
    )}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        redirectUriPath: '/slack/oauth_redirect',
        userScopes: [],
    },
};
