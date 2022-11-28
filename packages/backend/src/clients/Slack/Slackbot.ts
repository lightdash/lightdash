import { ParameterError } from '@lightdash/common';
import * as fs from 'fs/promises';
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

apiV1Router.get('/slack/screenshot/', async (req, res, next) => {
    try {
        const screenshot = '/usr/app/packages/backend/screenshot.png';
        const imageBuffer = await fs.readFile(screenshot);
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': imageBuffer.length,
        });
        res.end(imageBuffer);
    } catch (error) {
        next(error);
    }
});

const fetchDashboardScreenshot = async (url: string): Promise<string> => {
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

        // const testUrl = `http://${hostname}:${process.env.PORT || 3000}/login`;
        console.debug(`Fetching headless chrome URL: ${url}`);
        await page.goto(url, {
            timeout: 100000,
            waitUntil: 'networkidle0',
        });
        console.debug(`Taking screenshot`);

        const path = `/tmp/${encodeURIComponent(url)}.png`;
        console.debug('saving image in path', path);
        const imageBuffer = await page.screenshot({
            path,
            clip: { x: 0, y: 0, width: 1024, height: 768 },
        });
        console.debug(`imageBuffer`, imageBuffer);

        return imageBuffer;
        // return path
    } catch (e) {
        console.error(`Unable to fetch screenshots from headless chromeo ${e}`);
        return e;
    } finally {
        if (browser) await browser.close();
    }
};

const unfurl = async (event: any, client: any, context: any, payload: any) => {
    // const unfurlPromises = await event.links.reduce(async (acc: any, l: any) => {

    event.links.map(async (l: any) => {
        const { url } = l;

        const uuid =
            '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
        const uuidRegex = new RegExp(uuid, 'g');
        // const uuidRegex = /[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/
        const dashboardUrl = new RegExp(`/projects/${uuid}/dashboards/${uuid}`);
        const chartdUrl = new RegExp(`/projects/${uuid}/saved/${uuid}`);

        if (url.match(dashboardUrl)) {
            const [projectUuid, dashboardUuid] =
                (await url.match(uuidRegex)) || [];
            console.debug('project uuid', projectUuid, dashboardUuid);
        } else if (['/projects/', '/saved/'].includes(url)) {
            console.warn('Chart unfurl not implemented');
            return;
        } else {
            console.warn('URL to unfurl does not match dashboards or charts');
            return;
        }

        return;
        try {
            const imageId = event.message_ts;
            const screenshot = '/usr/app/screenshot.png';
            // const screenshot = await fetchDashboardScreenshot(url);
            console.debug(`uploading image to slack `, screenshot);
            console.debug(
                `event.channel `,
                event.channel,
                typeof event.channel,
            );
            console.debug(`event `, event);
            console.debug(`userToken `, context.userToken);

            console.debug('context', context);
            // const userToken = await getInstallation(event)
            // console.debug(`userToken `,userToken);

            // https://github.com/slackapi/node-slack-sdk/blob/60879af0a2d12290c7df3419c9537c9934f3e35a/packages/web-api/src/methods.ts
            // https://github.com/slackapi/node-slack-sdk/issues/1561
            // https:est//github.com/slackapi/node-slack-sdk/issues/1557
            // https://github.com/slackapi/node-slack-sdk/blob/60879af0a2d12290c7df3419c9537c9934f3e35a/packages/web-api/src/methods.ts
            const fileUpload = await client.files.upload({
                // channels: payload.user,
                channels: event.channel,
                // token: context.userToken,
                file: screenshot,
                // file: await fs.readFile(screenshot),
                filename: `dashboard-screenshot-${imageId}.png`,
                thread_ts: event.message_ts, // Upload on thread
            });
            console.debug('fileupload fileUpload', fileUpload);

            const publicImage = await client.files.sharedPublicURL({
                file: fileUpload.file.id,
            });
            console.debug('fileupload fileUpload', publicImage);

            const permalink = publicImage?.file?.permalink_public;
            const permalinkParts = permalink.split('-');
            const pubSecret = permalinkParts[permalinkParts.length - 1];
            const imageUrl = `${publicImage?.file.url_private}?pub_secret=${pubSecret}`;

            const unfurls = {
                [url]: {
                    blocks: [
                        /* {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: 'Lightdash URL unfurls are not yet available',
                            },
                        }, */
                        /*
                         {
                        type: 'image',
                        title: {
                            type: 'plain_text',
                            text: 'Public dashboard',
                        },
                        block_id: 'image4',
                        image_url: imageUrl,
                        alt_text: 'A public dashboard screenshot.',
                    }, */
                        {
                            type: 'image',
                            title: {
                                type: 'plain_text',
                                text: 'Please enjoy this photo of a kitten',
                            },
                            block_id: 'image4',
                            image_url: imageUrl,
                            // image_url: "http://localhost:3000/api/v1/slack/screenshot",
                            // image_url: 'https://uploads-ssl.webflow.com/62a9ae93cf7542032ae55b9c/62b90e1c5539fa2d40166acb_Group%2017%20(1)-p-2000.png',
                            alt_text: 'An incredibly cute kitten.',
                        },
                        /* {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `<${url}|${'Dashboard'}> `,
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
            console.debug('unfurls', JSON.stringify(unfurls));
            client.chat
                .unfurl({
                    ts: event.message_ts,
                    channel: event.channel,
                    unfurls,
                })
                .catch((e: any) =>
                    console.error(`Unable to unfurl url ${JSON.stringify(e)}`),
                );
        } catch (e) {
            console.error(`Unable to unfurl url ${JSON.stringify(e)}`);

            const unfurls = {
                [url]: {
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `Unable to unfurl URL ${url}: ${e} `,
                            },
                        },
                    ],
                },
            };
            console.debug('unfurls', JSON.stringify(unfurls));
            client.chat
                .unfurl({
                    ts: event.message_ts,
                    channel: event.channel,
                    unfurls,
                })
                .catch((er: any) =>
                    console.error(`Unable to unfurl url ${JSON.stringify(er)}`),
                );
        }
    });

    /* const unfurls = Promise.all(unfurlPromises)
    console.debug('Unfurling url', unfurls)
    client.chat
        .unfurl({ ts: event.message_ts, channel: event.channel, unfurls })
        .catch(console.error); */
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

            app.event('link_shared', async (message: any) => {
                console.debug('link shared', message);
                const { event, client, context, payload } = message;
                await unfurl(event, client, context, payload);
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
