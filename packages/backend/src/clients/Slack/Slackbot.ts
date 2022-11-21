import { apiV1Router } from '../../routers/apiV1Router';
import {
    createInstallation,
    deleteInstallation,
    getInstallation,
} from './SlackStorage';

const { FileInstallationStore } = require('@slack/oauth');
const { App, ExpressReceiver } = require('@slack/bolt');
// import {App} from '@slack/bolt' //TODO fix import

// Docs: https://slack.dev/bolt-js/concepts#authenticating-oauth

const receiverOptions = {
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    // appToken: process.env.SLACK_APP_TOKEN,

    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET,
    router: apiV1Router,
    // port: 4000,
    // port: 3000, // use same express port
    scopes: ['links:read', 'links:write', 'channels:read'],
    installationStore: {
        storeInstallation: createInstallation,
        fetchInstallation: getInstallation,
        deleteInstallation,
    },
    // installationStore: new FileInstallationStore(), // TODO replace with DB storage
    redirectUri: 'http://localhost:3000/api/v1/slack/oauth_redirect',
    installerOptions: {
        directInstall: true,
        redirectUriPath: '/slack/oauth_redirect',
    },
};
// export const app = new App(receiverOptions );

export const receiver = new ExpressReceiver(receiverOptions);

apiV1Router.get('/slack/install/:organizationUuid', async (req, res, next) => {
    try {
        const options = {
            redirectUri: receiverOptions.redirectUri,
            scopes: receiverOptions.scopes,
            metadata: { organizationUuid: req.params.organizationUuid },
        };
        await receiver.installer.handleInstallPath(
            req,
            res,
            receiverOptions.installerOptions,
            options,
        );
    } catch (error) {
        next(error);
    }
});

const app = new App({
    // receiver,
    ...receiverOptions,
    port: 4000,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

const unfurl = (event: any, client: any) => {
    const unfurls = event.links.reduce((acc: any, l: any) => {
        const { url } = l;
        const imgUrl =
            'https://uploads-ssl.webflow.com/62a9ae93cf7542032ae55b9c/62b6fe214cc86859e7f29485_Group%201000000843.png';
        return {
            [url]: {
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `Unfurling url`,
                        },
                        accessory: {
                            type: 'image',
                            image_url: imgUrl,
                            alt_text: 'Image unfurled',
                        },
                    },
                ],
            },
        };
    }, {});
    console.info('unfurls', unfurls);
    client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};

app.event('link_shared', (message: any) => {
    const { event, client } = message; // message.links ? message : message.event; // depending on the api, the message is different
    // console.debug('link_shared event', event);
    // console.debug('client event', client);

    unfurl(event, client);
});

app.message(':wave:', async (event: any) => {
    const { message, say } = event;
    await say(`Hello, <@${message.user}>`);
});

export const startSlackBot = async () => {
    await receiver.start();

    await app.start();

    console.debug('⚡️ Bolt app is running!');
};
