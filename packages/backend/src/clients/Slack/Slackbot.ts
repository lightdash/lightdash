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

export const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET,
    stateSecret: process.env.SLACK_STATE_SECRET,
    router: apiV1Router,
    // socketMode: true,
    // appToken: process.env.SLACK_APP_TOKEN,
    port: 3000, // use same express port
    scopes: ['links:read', 'links:write'],
    installationStore: {
        storeInstallation: createInstallation,
        fetchInstallation: getInstallation,
        deleteInstallation,
    },
    // installationStore: new FileInstallationStore(), // TODO replace with DB storage
    redirectUri: 'http://localhost:3000/api/v1/slack/redirect',
    installerOptions: {
        //  installPath: '/api/v1/slack/install',
        directInstall: true,
        redirectUriPath: '/api/v1/slack/redirect',
    },
});

const app = new App({
    receiver,
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
    console.debug('link_shared event', event);
    console.debug('client event', client);

    unfurl(event, client);
});

export const startSlackBot = async () => {
    await app.start();

    console.debug('⚡️ Bolt app is running!');
};
