import { apiV1Router } from '../../routers/apiV1Router';
import {
    createInstallation,
    deleteInstallation,
    getInstallation,
} from './SlackStorage';

// TODO https://github.com/slackapi/bolt-js/issues/904 fix slack bot compatibility with typescript
const { App, ExpressReceiver } = require('@slack/bolt');

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
    redirectUri: `${process.env.SITE_URL}/api/v1/slack/oauth_redirect`,
    installerOptions: {
        directInstall: true,
        redirectUriPath: '/slack/oauth_redirect',
    },
};

export const receiver = new ExpressReceiver(slackOptions);

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

const app = new App({
    ...slackOptions,
    port: process.env.SLACK_PORT || 4000,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

const unfurl = (event: any, client: any) => {
    const unfurls = event.links.reduce((acc: any, l: any) => {
        const { url } = l;
        const imgUrl =
            'https://user-images.githubusercontent.com/1983672/203070424-c6051437-f92d-448b-827e-0c4aec58867a.png';
        const dashboardName = 'Public dashboard';
        const dashboardUrl = `${process.env.SITE_URL}/projects/3675b69e-8324-4110-bdca-059031aa8da3/dashboards/2844e926-a868-4dfe-b41c-6d7cc74e1b24/edit`;
        return {
            [url]: {
                blocks: [
                    {
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
                    },
                ],
            },
        };
    }, {});
    client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};

app.event('link_shared', (message: any) => {
    const { event, client } = message;
    unfurl(event, client);
});

export const startSlackBot = async () => {
    await receiver.start();
    await app.start();

    console.debug('⚡️ Bolt app is running!');
};
