import { apiV1Router } from '../../routers/apiV1Router';
import {
    createInstallation,
    deleteInstallation,
    getInstallation,
} from './SlackStorage';

const puppeteer = require('puppeteer');

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

const fetchDashboardScreenshot = async (
    url: string,
): Promise<Buffer | string> => {
    let browser;

    try {
        const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
        console.debug(`Headless chrome endpoint: ${browserWSEndpoint}`);
        browser = await puppeteer.connect({
            browserWSEndpoint,
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: 1024,
            height: 768, // hardcoded
        });
        // await page.setExtraHTTPHeaders({ cookie: req.headers.cookie || '' }); // copy cookie

        const blockedUrls = [
            'headwayapp.co',
            'rudderlabs.com',
            'analytics.lightdash.com',
            'cohere.so',
            'intercom.io',
        ];
        await page.setRequestInterception(true);
        page.on('request', (request: any) => {
            const requestUrl = request.url();
            if (blockedUrls.includes(requestUrl)) {
                request.abort();
                return;
            }

            request.continue();
        });
        const hostname =
            process.env.NODE_ENV === 'development'
                ? 'lightdash-dev'
                : 'lightdash';

        const testUrl = `http://${hostname}:${process.env.PORT || 3000}/login`;
        console.debug(`Fetching headless chrome URL: ${testUrl}`);
        await page.goto(testUrl, {
            timeout: 100000,
            waitUntil: 'networkidle0',
        });

        const imageBuffer: Promise<Buffer | string> = await page.screenshot({
            path: 'screenshot.png',
            clip: { x: 0, y: 0, width: 1024, height: 768 },
        });

        return await imageBuffer;
    } catch (e) {
        console.error(`Unable to fetch screenshots from headless chromeo ${e}`);
        return e;
    } finally {
        if (browser) await browser.close();
    }
};

const unfurl = (event: any, client: any) => {
    const unfurls = event.links.reduce(async (acc: any, l: any) => {
        const { url } = l;

        try {
            const screenshot = await fetchDashboardScreenshot(url);
            // client.files.upload()
            return {
                ...acc,
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
        } catch (e) {
            return acc;
        }
    }, {});

    client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error);
};

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

            app.event('link_shared', (message: any) => {
                const { event, client } = message;
                unfurl(event, client);
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
