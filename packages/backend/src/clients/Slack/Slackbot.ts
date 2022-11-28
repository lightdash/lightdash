import { analytics } from '../../analytics/client';
import { apiV1Router } from '../../routers/apiV1Router';
import { slackService } from '../../services/services';
import {
    createInstallation,
    deleteInstallation,
    getInstallation,
} from './SlackStorage';

// TODO https://github.com/slackapi/bolt-js/issues/904 fix slack bot compatibility with typescript
const { App, ExpressReceiver, LogLevel } = require('@slack/bolt');

const slackOptions = {
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET,
    router: apiV1Router,
    scopes: [
        'links:read',
        'links:write',
        'files:write',
        'files:read',
        'channels:read',
    ],

    installationStore: {
        storeInstallation: createInstallation,
        fetchInstallation: getInstallation,
        deleteInstallation,
    },
    // Slack only allow https on redirections
    // When testing locally on http://localhost:3000, replace again https:// with http:// after redirection happens
    redirectUri: `${(process.env.SITE_URL || '').replace(
        'http://',
        'https://',
    )}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        redirectUriPath: '/slack/oauth_redirect',
        userScopes: ['files:write', 'files:read'],
    },
};

const receiver = new ExpressReceiver(slackOptions);

apiV1Router.get('/slack/install/:organizationUuid', async (req, res, next) => {
    try {
        const options = {
            redirectUri: slackOptions.redirectUri,
            scopes: slackOptions.scopes,
            userScopes: ['files:write'],
            metadata: { organizationUuid: req.params.organizationUuid },
        };
        analytics.track({
            event: 'share_slack.install',
            properties: {
                organizationUuid: req.params.organizationUuid,
            },
        });

        await receiver.installer.handleInstallPath(
            req,
            res,
            slackOptions.installerOptions,
            options,
        );
    } catch (error) {
        analytics.track({
            event: 'share_slack.install_error',
            properties: {
                error: `${error}`,
            },
        });
        next(error);
    }
});

export const startSlackBot = async () => {
    if (process.env.SLACK_APP_TOKEN) {
        try {
            await receiver.start();

            const app = new App({
                ...slackOptions,
                logLevel: LogLevel.INFO,
                port: process.env.SLACK_PORT || 4000,
                socketMode: true,
                appToken: process.env.SLACK_APP_TOKEN,
            });

            app.event('link_shared', async (message: any) => {
                const { event, client, context } = message;
                await slackService.unfurl(event, client, context);
            });

            await app.start();

            console.debug('Slack app is running');
        } catch (e: unknown) {
            console.error(`Unable to start Slack app ${e}`);
        }
    } else {
        console.warn(`Missing "SLACK_APP_TOKEN", Slack App will not run`);
    }
};
