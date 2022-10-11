const { WebClient } = require('@slack/client');
const { SocketModeClient } = require('@slack/socket-mode');

let slackClient: any;
let socketModeClient: any;

if (process.env.SLACK_BOT_TOKEN) {
    slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
} else {
    console.warn('Unable to use slack, missing SLACK_BOT_TOKEN env variable');
}

if (process.env.SLACK_APP_TOKEN) {
    socketModeClient = new SocketModeClient({
        appToken: process.env.SLACK_APP_TOKEN,
    });
} else {
    console.warn(
        'Unable to connect to slack via socket, missing SLACK_APP_TOKEN env variable',
    );
}

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
    if (slackClient)
        slackClient.chat
            .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
            .catch(console.error);
};

export const startSlackBot = async () => {
    if (socketModeClient && slackClient) {
        console.info('Starting slack socket mode client');

        socketModeClient.on('link_shared', (message: any) => {
            const event = message.links ? message : message.event; // depending on the api, the message is different
            console.debug('link_shared event', event);
            unfurl(event);
        });

        await socketModeClient.start();
    }
};
