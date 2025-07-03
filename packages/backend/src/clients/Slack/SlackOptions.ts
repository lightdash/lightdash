import { slackRequiredScopes } from '@lightdash/common';
import { lightdashConfig } from '../../config/lightdashConfig';

export const slackOptions = {
    signingSecret: lightdashConfig.slack?.signingSecret || '',
    clientId: lightdashConfig.slack?.clientId || '',
    clientSecret: lightdashConfig.slack?.clientSecret || '',
    stateSecret: lightdashConfig.slack?.stateSecret || '',
    scopes: slackRequiredScopes,

    redirectUri: `${lightdashConfig.siteUrl}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        // The default value for redirectUriPath is ‘/slack/oauth_redirect’, but we override it to match the existing redirect route in the Slack app manifest files.
        redirectUriPath: '/api/v1/slack/oauth_redirect',
        userScopes: [],
    },
};
