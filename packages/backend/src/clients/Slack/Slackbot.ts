console.warn('Getting started with Node Slack SDK');

export const postTestMessage = async () => {
    console.warn('test slack message');
};
/* const { WebClient } = require('@slack/web-api');


const web = new WebClient('xoxb-1207722259383-4199846793957-EcrdRTzdPcxOXMVd4g8HC3eg');
// The current date
const currentTime = new Date().toTimeString();



const { createEventAdapter } = require('@slack/events-api');

// Read the signing secret from the environment variables
const slackSigningSecret = '3d79525597025cabd8e0523be6158e71';

// Initialize
const slackEvents = createEventAdapter(slackSigningSecret);

const port = 4000;


  slackEvents.on('link_shared', (event: any) => {
  });

(async () => {
  // Start the built-in server
  const server = await slackEvents.start(port);

  // Log a message when the server is ready
})();

*/

// https://github.com/slackapi/sample-app-unfurls
// https://api.slack.com/block-kit/building

const appToken =
    'xapp-1-A045RUZPJK0-4215807550449-fd48c147ebe85566975b66c663de07881a2cc61bd7461d3bc7bf2bc8ded2fc0f';
const botToken = 'xoxb-1207722259383-4199846793957-EcrdRTzdPcxOXMVd4g8HC3eg';
// Reply to slack challenge

// Start slack Event
const { WebClient } = require('@slack/client');

const slack = new WebClient(
    'xoxb-1207722259383-4199846793957-EcrdRTzdPcxOXMVd4g8HC3eg',
);
/*
const { App } = require('@slack/bolt');

const app: any = new App({
    token: botToken,
    appToken: appToken,
    socketMode: true,
  }); */

const { SocketModeClient } = require('@slack/socket-mode');

const socketModeClient = new SocketModeClient({ appToken });

// Attach listeners to events by type. See: https://api.slack.com/events/message

/*
  
  const { createEventAdapter } = require('@slack/events-api');
//const { url } = require('inspector')
// Read the signing secret from the environment variables
const slackSigningSecret = '3d79525597025cabd8e0523be6158e71';
// The current date
// Initialize
const slackEvents = createEventAdapter(slackSigningSecret);

//const port = 3000;
*/

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
    console.warn('unfurls', unfurls);
    slack.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};
/*
slackEvents.on('message', (event) => {
  }); */

socketModeClient.on('link_shared', (message: any) => {
    const event = message.links ? message : message.event; // depending on the api, the message is different
    console.warn('link_shared event', event);
    unfurl(event);
});

/*
(async () => {
  // Start the built-in server
  const server = await slackEvents.start(port);

  // Log a message when the server is ready
})();

*/

(async () => {
    console.warn('Starting slack socket mode client');

    await socketModeClient.start();
})();

/*
  
  (async () => {
    await app.start();

  })(); */
