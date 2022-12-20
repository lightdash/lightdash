import { assertUnreachable, AuthorizationError } from '@lightdash/common';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import { S3Service } from '../../clients/Aws/s3';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ShareModel } from '../../models/ShareModel';
import { SpaceModel } from '../../models/SpaceModel';
import { getAuthenticationToken } from '../../routers/headlessBrowser';
import { EncryptionService } from '../EncryptionService/EncryptionService';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');
const nanoid = '[\\w-]{21}';
const nanoidRegex = new RegExp(nanoid);

const viewport = {
    width: 1400,
    height: 768,
};

const blockedUrls = [
    'headwayapp.co',
    'rudderlabs.com',
    'analytics.lightdash.com',
    'cohere.so',
    'intercom.io',
];

export enum LightdashPage {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
    EXPLORE = 'explore',
}

export type Unfurl = {
    title: string;
    description?: string;
    imageUrl: string | undefined;
    pageType: LightdashPage;
};

export type ParsedUrl = {
    isValid: boolean;
    lightdashPage?: LightdashPage;
    url: string;
    dashboardUuid?: string;
    projectUuid?: string;
    chartUuid?: string;
    exploreModel?: string;
};

type UnfurlServiceDependencies = {
    lightdashConfig: LightdashConfig;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    shareModel: ShareModel;
    encryptionService: EncryptionService;
    s3Service: S3Service;
};

export class UnfurlService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    shareModel: ShareModel;

    encryptionService: EncryptionService;

    s3Service: S3Service;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        spaceModel,
        shareModel,
        encryptionService,
        s3Service,
    }: UnfurlServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.shareModel = shareModel;
        this.encryptionService = encryptionService;
        this.s3Service = s3Service;
    }

    private async saveScreenshot(
        imageId: string,
        cookie: string,
        parsedUrl: ParsedUrl,
    ): Promise<Buffer | undefined> {
        let browser;

        try {
            const browserWSEndpoint = `ws://${this.lightdashConfig.headlessBrowser.host}:${this.lightdashConfig.headlessBrowser.port}`;
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();

            await page.setExtraHTTPHeaders({ cookie });

            await page.setViewport(viewport);

            await page.setRequestInterception(true);
            page.on('request', (request: any) => {
                const requestUrl = request.url();
                if (blockedUrls.includes(requestUrl)) {
                    request.abort();
                    return;
                }

                request.continue();
            });
            await page.goto(parsedUrl.url, {
                timeout: 180000,
                waitUntil: 'networkidle0',
            });
            const path = `/tmp/${imageId}.png`;

            const selector =
                parsedUrl.lightdashPage === LightdashPage.DASHBOARD
                    ? '.react-grid-layout'
                    : `.echarts-for-react, [data-testid="visualization"]`; // Get .echarts-for-react, otherwise fallsback to data-testid (tables and bignumbers)
            let element;
            try {
                await page.waitForSelector(selector, { timeout: 30000 });
                element = await page.$(selector);
            } catch (e) {
                Logger.info(
                    `Can't find element ${selector} on page ${e}, returning body`,
                );
                element = await page.$('body');
            }

            if (parsedUrl.lightdashPage === LightdashPage.DASHBOARD) {
                // Remove navbar from screenshot
                await page.evaluate((sel: any) => {
                    // @ts-ignore
                    const elements = document.querySelectorAll(sel);
                    elements.forEach((el) => el.parentNode.removeChild(el));
                }, '.bp4-navbar');
            }

            if (!element) {
                Logger.warn(`Can't find element on page`);
                return undefined;
            }
            const imageBuffer = (await element.screenshot({
                path,
            })) as Buffer;

            return imageBuffer;
        } catch (e) {
            Logger.error(
                `Unable to fetch screenshots from headless chrome ${e.message}`,
            );
            return undefined;
        } finally {
            if (browser) await browser.close();
        }
    }

    private async getSharedUrl(linkUrl: string): Promise<string> {
        const [shareId] = linkUrl.match(nanoidRegex) || [];
        if (!shareId) return linkUrl;

        const shareUrl = await this.shareModel.getSharedUrl(shareId);

        const fullUrl = `${this.lightdashConfig.siteUrl}${shareUrl.path}${shareUrl.params}`;
        Logger.debug(`Shared url ${shareId}: ${fullUrl}`);

        return fullUrl;
    }

    private async parseUrl(linkUrl: string): Promise<ParsedUrl> {
        if (!linkUrl.startsWith(this.lightdashConfig.siteUrl)) {
            Logger.debug(
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
            const [projectUuid, dashboardUuid] =
                (await url.match(uuidRegex)) || [];

            return {
                isValid: true,
                lightdashPage: LightdashPage.DASHBOARD,
                url,
                projectUuid,
                dashboardUuid,
            };
        }
        if (url.match(chartUrl) !== null) {
            const [projectUuid, chartUuid] = (await url.match(uuidRegex)) || [];

            return {
                isValid: true,
                lightdashPage: LightdashPage.CHART,
                url,
                projectUuid,
                chartUuid,
            };
        }
        if (url.match(exploreUrl) !== null) {
            const [projectUuid] = (await url.match(uuidRegex)) || [];

            const urlWithoutParams = url.split('?')[0];
            const exploreModel = urlWithoutParams.split('/tables/')[1];

            return {
                isValid: true,
                lightdashPage: LightdashPage.EXPLORE,
                url,
                projectUuid,
                exploreModel,
            };
        }

        Logger.debug(`URL to unfurl ${url} is not valid`);
        return {
            isValid: false,
            url,
        };
    }

    async getTitleAndDescription(
        parsedUrl: ParsedUrl,
    ): Promise<{ title: string; description?: string }> {
        switch (parsedUrl.lightdashPage) {
            case LightdashPage.DASHBOARD:
                if (!parsedUrl.dashboardUuid)
                    throw new Error(
                        `Missing dashboardUuid when unfurling Dashboard URL ${parsedUrl.url}`,
                    );
                const dashboard = await this.dashboardModel.getById(
                    parsedUrl.dashboardUuid,
                );
                return {
                    title: dashboard.name,
                    description: dashboard.description,
                };
            case LightdashPage.CHART:
                if (!parsedUrl.chartUuid)
                    throw new Error(
                        `Missing chartUuid when unfurling Dashboard URL ${parsedUrl.url}`,
                    );
                const chart = await this.savedChartModel.get(
                    parsedUrl.chartUuid,
                );
                return { title: chart.name, description: chart.description };
            case LightdashPage.EXPLORE:
                const exploreName = parsedUrl.exploreModel
                    ? `Exploring ${parsedUrl.exploreModel}`
                    : 'Explore';
                return { title: exploreName };
            case undefined:
                throw new Error(`Unrecognized page for URL ${parsedUrl.url}`);
            default:
                return assertUnreachable(
                    parsedUrl.lightdashPage,
                    `No lightdash page Slack unfurl implemented`,
                );
        }
    }

    private async getUserCookie(userUuid: string): Promise<string> {
        const token = getAuthenticationToken(userUuid);

        const response = await fetch(
            `${this.lightdashConfig.siteUrl}/api/v1/headless-browser/login/${userUuid}`,
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
    }

    async unfurl(
        originUrl: string,
        imageId: string,
        authUserUuid: string,
    ): Promise<Unfurl | undefined> {
        const parsedUrl = await this.parseUrl(originUrl);

        if (
            !parsedUrl.isValid ||
            parsedUrl.lightdashPage === undefined ||
            parsedUrl.url === undefined
        ) {
            return undefined;
        }
        Logger.debug(`Unfurling URL ${parsedUrl.url}`);

        const cookie = await this.getUserCookie(authUserUuid);

        const { title, description } = await this.getTitleAndDescription(
            parsedUrl,
        );

        const buffer = await this.saveScreenshot(imageId, cookie, parsedUrl);

        let imageUrl;
        if (buffer !== undefined) {
            if (this.s3Service.isEnabled() !== undefined) {
                imageUrl = await this.s3Service.uploadImage(buffer, imageId);
            } else {
                // We will share the image saved by puppetteer on our lightdash enpdoint
                imageUrl = `${this.lightdashConfig.siteUrl}/api/v1/slack/image/${imageId}.png`;
            }
        }

        return {
            title,
            description,
            pageType: parsedUrl.lightdashPage,
            imageUrl,
        };
    }
}
