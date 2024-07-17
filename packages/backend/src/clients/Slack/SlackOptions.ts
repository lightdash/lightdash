import { slackRequiredScopes } from '@lightdash/common';
import { lightdashConfig } from '../../config/lightdashConfig';

export const slackOptions = {
    signingSecret: lightdashConfig.slack?.signingSecret || '',
    clientId: lightdashConfig.slack?.clientId || '',
    clientSecret: lightdashConfig.slack?.clientSecret || '',
    stateSecret: lightdashConfig.slack?.stateSecret || '',
    appToken: lightdashConfig.slack?.appToken || '',
    scopes: slackRequiredScopes,

    // Slack only allow https on redirections
    // When testing locally on http://localhost:3000, replace again https:// with http:// after redirection happens
    redirectUri: `${lightdashConfig.siteUrl.replace(
        'http://',
        'https://',
    )}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        // The default value for redirectUriPath is ‘/slack/oauth_redirect’, but we override it to match the existing redirect route in the Slack app manifest files.
        redirectUriPath: '/api/v1/slack/oauth_redirect',
        userScopes: [],
    },
};
