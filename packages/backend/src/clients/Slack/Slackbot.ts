import { apiV1Router } from '../../routers/apiV1Router';
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
    scopes: ['links:read', 'links:write'],
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
    },
};

const receiver = new ExpressReceiver(slackOptions);

apiV1Router.get('/slack/install/:organizationUuid', async (req, res, next) => {
    try {
        const options = {
            redirectUri: slackOptions.redirectUri,
            scopes: slackOptions.scopes,
            metadata: { organizationUuid: req.params.organizationUuid },
        };
        await receiver.installer.handleInstallPath(
            req,
            res,
            slackOptions.installerOptions,
            options,
        );
    } catch (error) {
        next(error);
    }
});

const unfurl = (event: any, client: any) => {
    const unfurls = event.links.reduce((acc: any, l: any) => {
        const { url } = l;

        return {
            [url]: {
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: 'Lightdash URL unfurls are not yet available',
                        },
                    },

                    /* {
                        type: 'image',
                        title: {
                            type: 'plain_text',
                            text: 'Public dashboard',
                        },
                        block_id: 'image4',
                        image_url: imgUrl,
                        alt_text: 'An incredibly cute kitten.',
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `<${dashboardUrl}|${dashboardName}> `,
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Open dashboard',
                                emoji: true,
                            },
                            value: 'view_alternate_1',
                        },
                    }, */
                ],
            },
        };
    }, {});
    client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};

export const startSlackBot = async () => {
    try {
        await receiver.start();

        if (process.env.SLACK_APP_TOKEN) {
            const app = new App({
                ...slackOptions,
                logLevel: LogLevel.INFO,
                port: process.env.SLACK_PORT || 4000,
                socketMode: true,
                appToken: process.env.SLACK_APP_TOKEN,
            });

            app.event('link_shared', (message: any) => {
                const { event, client } = message;
                unfurl(event, client);
            });

            await app.start();
        } else {
            console.warn(`Missing "SLACK_APP_TOKEN", Slack App will not run`);
        }
        console.debug('Slack app is running');
    } catch (e: unknown) {
        console.error(`Unable to start Slack app ${e}`);
    }
};
