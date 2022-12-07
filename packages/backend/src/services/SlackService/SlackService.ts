import { assertUnreachable, AuthorizationError } from '@lightdash/common';
import fetch from 'node-fetch';
import { analytics } from '../../analytics/client';
import { getSlackUserId, getUserUuid } from '../../clients/Slack/SlackStorage';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ShareModel } from '../../models/ShareModel';
import { SpaceModel } from '../../models/SpaceModel';
import { getAuthenticationToken } from '../../routers/headlessBrowser';
import { EncryptionService } from '../EncryptionService/EncryptionService';

const puppeteer = require('puppeteer');

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');
const nanoid = '[\\w-]{21}';
const nanoidRegex = new RegExp(nanoid);

export enum LightdashPage {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    EXPLORE = 'explore',
}

type SlackServiceDependencies = {
    lightdashConfig: LightdashConfig;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    shareModel: ShareModel;
    encryptionService: EncryptionService;
};

const notifySlackError = async (
    error: unknown,
    url: string,
    client: any,
    event: any,
): Promise<void> => {
    console.error(`Unable to unfurl url ${JSON.stringify(error)}`);

    const unfurls = {
        [url]: {
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Unable to unfurl URL ${url}: ${error} `,
                    },
                },
            ],
        },
    };
    await client.chat
        .unfurl({
            ts: event.message_ts,
            channel: event.channel,
            unfurls,
        })
        .catch((er: any) =>
            console.error(`Unable to unfurl url ${JSON.stringify(er)}`),
        );
};

const uploadImage = async (
    screenshot: Buffer,
    client: any,
    event: any,
    context: any,
): Promise<string> => {
    const imageId = event.message_ts;

    // channel: event.channel and thread_ts:event.message_ts
    // uploads the image to the same thread, however, unfurl is called while the user is typing, not when the message is sent
    // so it is possible that the thread doesn't exist yet. Plus it is noisy (you get a notification when the image is uploaded)
    // Instead we upload the image to the user personal channel (@user), always there, not noisy.
    const slackUserId = await getSlackUserId(context);
    const fileUpload = await client.files.upload({
        channels: slackUserId, // event.channel
        token: context.userToken,
        file: screenshot,
        filename: `dashboard-screenshot-${imageId}.png`,
        // thread_ts: event.message_ts, // Upload on thread
    });
    const publicImage = await client.files.sharedPublicURL({
        file: fileUpload.file.id,
        token: context.userToken,
    });

    const permalink = publicImage?.file?.permalink_public;
    const permalinkParts = permalink.split('-');
    const pubSecret = permalinkParts[permalinkParts.length - 1];
    const imageUrl = `${publicImage?.file.url_private}?pub_secret=${pubSecret}`;
    return imageUrl;
};

const saveScreenshot = async (
    imageId: string,
    url: string,
    cookie: string,
    lightdashPage: LightdashPage,
): Promise<Buffer> => {
    let browser;

    try {
        const browserWSEndpoint = `ws://${process.env.HEADLESS_BROWSER_HOST}:${process.env.HEADLESS_BROWSER_PORT}`;
        browser = await puppeteer.connect({
            browserWSEndpoint,
        });

        const page = await browser.newPage();

        await page.setExtraHTTPHeaders({ cookie });

        await page.setViewport({
            width: 1400,
            height: 768, // hardcoded
        });

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
        await page.goto(url, {
            timeout: 100000,
            waitUntil: 'networkidle0',
        });
        const path = `/tmp/${imageId}.png`;

        const selector =
            lightdashPage === LightdashPage.DASHBOARD
                ? '.react-grid-layout'
                : `.echarts-for-react, [data-testid="visualization"]`; // Get .echarts-for-react, otherwise fallsback to data-testid (tables and bignumbers)
        await page.waitForSelector(selector);
        const element = await page.$(selector);

        if (lightdashPage === LightdashPage.DASHBOARD) {
            // Remove navbar from screenshot
            await page.evaluate((sel: any) => {
                // @ts-ignore
                const elements = document.querySelectorAll(sel);
                elements.forEach((el) => el.parentNode.removeChild(el));
            }, '.bp4-navbar');
        }

        const imageBuffer = await element.screenshot({
            path,
        });

        return imageBuffer;

        // return path
    } catch (e) {
        console.error(`Unable to fetch screenshots from headless chromeo ${e}`);
        return e;
    } finally {
        if (browser) await browser.close();
    }
};

const getUserCookie = async (userUuid: string): Promise<string> => {
    const token = getAuthenticationToken(userUuid);

    const response = await fetch(
        `${process.env.SITE_URL}/api/v1/headless-browser/login/${userUuid}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
        },
    );
    if (response.status !== 200) {
        throw new Error(
            `Unable to get cookie for user ${userUuid}: ${await response.text()}`,
        );
    }
    const header = response.headers.get('set-cookie');
    if (header === null) {
        const loginBody = await response.json();
        throw new AuthorizationError(
            `Cannot sign in:\n${JSON.stringify(loginBody)}`,
        );
    }
    return header;
};

const unfurlExplore = async (url: string, imageUrl: string) => {
    const urlWithoutParams = url.split('?')[0];
    const model = urlWithoutParams.split('/tables/')[1];
    const unfurls = {
        [url]: {
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: model ? `Exploring ${model}` : `Explore`,
                    },
                    accessory: {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Open in Lightdash',
                            emoji: true,
                        },
                        url,
                        action_id: 'button-action',
                    },
                },
                {
                    type: 'image',
                    image_url: imageUrl,
                    alt_text: 'Explore screenshot',
                },
            ],
        },
    };
    return unfurls;
};

export class SlackService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    shareModel: ShareModel;

    encryptionService: EncryptionService;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        spaceModel,
        shareModel,
        encryptionService,
    }: SlackServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.shareModel = shareModel;
        this.encryptionService = encryptionService;
    }

    private async unfurlChart(url: string, imageUrl: string): Promise<any> {
        const [projectUuid, chartUuid] = (await url.match(uuidRegex)) || [];

        const chart = await this.savedChartModel.get(chartUuid);
        return {
            [url]: {
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: chart.name,
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${chart.description || '-'}`,
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Open in Lightdash',
                                emoji: true,
                            },
                            url,
                            action_id: 'button-action',
                        },
                    },
                    {
                        type: 'image',
                        image_url: imageUrl,
                        alt_text: chart.name,
                    },
                ],
            },
        };
    }

    private async unfurlDashboard(url: string, imageUrl: string): Promise<any> {
        const [projectUuid, dashboardUuid] = (await url.match(uuidRegex)) || [];

        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        // https://api.slack.com/reference/block-kit/blocks
        // https://app.slack.com/block-kit-builder/T0163M87MB9#%7B%22blocks%22:%5B%5D%7D
        const unfurls = {
            [url]: {
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: dashboard.name,
                        },
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${dashboard.description || '-'}`,
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Open in Lightdash',
                                emoji: true,
                            },
                            url,
                            action_id: 'button-action',
                        },
                    },
                    {
                        type: 'image',
                        image_url: imageUrl,
                        alt_text: dashboard.name,
                    },
                ],
            },
        };
        return unfurls;
    }

    private async getSharedUrl(linkUrl: string): Promise<string> {
        const [shareId] = linkUrl.match(nanoidRegex) || [];
        const shareUrl = await this.shareModel.getSharedUrl(shareId);

        return (
            `http://local.lightdash.cloud${shareUrl.path}${shareUrl.params}` ||
            ''
        );
    }

    private async parseUrl(linkUrl: string): Promise<{
        isValid: boolean;
        lightdashPage?: LightdashPage;
        url: string;
    }> {
        if (
            process.env.NODE_ENV !== 'development' &&
            !linkUrl.startsWith(this.lightdashConfig.siteUrl)
        ) {
            console.debug(
                `URL to unfurl ${linkUrl} does not belong to this siteUrl ${this.lightdashConfig.siteUrl}, ignoring.`,
            );
            return {
                isValid: false,
                url: linkUrl,
            };
        }

        const shareUrl = new RegExp(`/share/${nanoid}`);
        const url = linkUrl.match(shareUrl)
            ? await this.getSharedUrl(linkUrl)
            : linkUrl;

        const dashboardUrl = new RegExp(`/projects/${uuid}/dashboards/${uuid}`);
        const chartUrl = new RegExp(`/projects/${uuid}/saved/${uuid}`);
        const exploreUrl = new RegExp(`/projects/${uuid}/tables/`);

        if (url.match(dashboardUrl) !== null) {
            return {
                isValid: true,
                lightdashPage: LightdashPage.DASHBOARD,
                url: linkUrl,
            };
        }
        if (url.match(chartUrl) !== null) {
            return {
                isValid: true,
                lightdashPage: LightdashPage.CHART,
                url: linkUrl,
            };
        }
        if (url.match(exploreUrl) !== null) {
            return {
                isValid: true,
                lightdashPage: LightdashPage.EXPLORE,
                url: linkUrl,
            };
        }

        console.debug(`URL to unfurl ${url} is not valid`);
        return {
            isValid: false,
            url,
        };
    }

    async unfurlPage(
        url: string,
        lightdashPage: LightdashPage,
        imageUrl: string,
    ) {
        switch (lightdashPage) {
            case LightdashPage.DASHBOARD:
                return this.unfurlDashboard(url, imageUrl);
            case LightdashPage.CHART:
                return this.unfurlChart(url, imageUrl);
            case LightdashPage.EXPLORE:
                return unfurlExplore(url, imageUrl);
            default:
                return assertUnreachable(
                    lightdashPage,
                    `No lightdash page Slack unfurl implemented`,
                );
        }
    }

    async unfurl(event: any, client: any, context: any): Promise<void> {
        event.links.map(async (l: any) => {
            const { isValid, lightdashPage, url } = await this.parseUrl(l.url);

            if (!isValid || lightdashPage === undefined || url === undefined) {
                return;
            }
            try {
                const userUuid = await getUserUuid(context);
                const cookie = await getUserCookie(userUuid);
                analytics.track({
                    event: 'share_slack.unfurl',
                    userId: event.user,
                    properties: {
                        pageType: lightdashPage,
                    },
                });

                const imageId = `slack-image-${context.teamId}-${event.unfurl_id}`;
                saveScreenshot(
                    imageId,
                    url.replace('local.lightdash.cloud', 'lightdash-dev:3000'),
                    cookie,
                    lightdashPage,
                );

                /* const imageUrl = await uploadImage(
                    screenshot,
                    client,
                    event,
                    context,
                ); */
                const imageUrl = `${this.lightdashConfig.siteUrl}/api/v1/slack/image/${imageId}.png`;
                console.warn('imageUrl', imageUrl);
                const unfurls = await this.unfurlPage(
                    l.url,
                    lightdashPage,
                    imageUrl,
                );
                console.warn('unfurls', JSON.stringify(unfurls));

                client.chat
                    .unfurl({
                        ts: event.message_ts,
                        channel: event.channel,
                        unfurls,
                    })
                    .catch((e: any) => {
                        analytics.track({
                            event: 'share_slack.unfurl_error',
                            userId: event.user,
                            properties: {
                                error: `${e}`,
                            },
                        });
                        console.error(
                            `Unable to unfurl url ${url}: ${JSON.stringify(e)}`,
                        );
                    });
            } catch (e) {
                analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: event.user,

                    properties: {
                        error: `${e}`,
                    },
                });

                notifySlackError(e, url, client, event);
            }
        });
    }
}
