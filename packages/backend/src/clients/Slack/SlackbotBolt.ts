const { App } = require('@slack/bolt');
// import {App} from '@slack/bolt'

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    // Socket Mode doesn't listen on a port, but in case you want your app to respond to OAuth,
    // you still need to listen on some port!
    // port: process.env.PORT || 3000
});

const unfurl = (event: any) => {
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
    app.client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};

app.event('link_shared', (message: any) => {
    const event = message.links ? message : message.event; // depending on the api, the message is different
    console.debug('link_shared event', event);

    unfurl(event);
});

export const startSlackBot = async () => {
    await app.start();

    console.debug('⚡️ Bolt app is running!');
};
