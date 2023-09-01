import { subject } from '@casl/ability';
import {
    assertUnreachable,
    AuthorizationError,
    ChartType,
    ForbiddenError,
    LightdashPage,
    SessionUser,
    snakeCaseName,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { nanoid as useNanoid } from 'nanoid';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';
import { S3Service } from '../../clients/Aws/s3';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
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

const bigNumberViewport = {
    width: 768,
    height: 500,
};

export type Unfurl = {
    title: string;
    description?: string;
    chartType?: string;
    imageUrl: string | undefined;
    pageType: LightdashPage;
    minimalUrl: string;
    organizationUuid: string;
};

export type ParsedUrl = {
    isValid: boolean;
    lightdashPage?: LightdashPage;
    url: string;
    minimalUrl: string;
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
    projectModel: ProjectModel;
};

export class UnfurlService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    shareModel: ShareModel;

    encryptionService: EncryptionService;

    s3Service: S3Service;

    projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        spaceModel,
        shareModel,
        encryptionService,
        s3Service,
        projectModel,
    }: UnfurlServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.shareModel = shareModel;
        this.encryptionService = encryptionService;
        this.s3Service = s3Service;
        this.projectModel = projectModel;
    }

    async getTitleAndDescription(
        parsedUrl: ParsedUrl,
    ): Promise<
        Pick<Unfurl, 'title' | 'description' | 'chartType' | 'organizationUuid'>
    > {
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
                    organizationUuid: dashboard.organizationUuid,
                };
            case LightdashPage.CHART:
                if (!parsedUrl.chartUuid)
                    throw new Error(
                        `Missing chartUuid when unfurling Dashboard URL ${parsedUrl.url}`,
                    );
                const chart = await this.savedChartModel.getSummary(
                    parsedUrl.chartUuid,
                );
                return {
                    title: chart.name,
                    description: chart.description,
                    organizationUuid: chart.organizationUuid,
                    chartType: chart.chartType,
                };
            case LightdashPage.EXPLORE:
                const project = await this.projectModel.get(
                    parsedUrl.projectUuid!,
                );

                const exploreName = parsedUrl.exploreModel
                    ? `Exploring ${parsedUrl.exploreModel}`
                    : 'Explore';
                return {
                    title: exploreName,
                    organizationUuid: project.organizationUuid,
                };
            case undefined:
                throw new Error(`Unrecognized page for URL ${parsedUrl.url}`);
            default:
                return assertUnreachable(
                    parsedUrl.lightdashPage,
                    `No lightdash page Slack unfurl implemented`,
                );
        }
    }

    async unfurlDetails(originUrl: string): Promise<Unfurl | undefined> {
        const parsedUrl = await this.parseUrl(originUrl);

        if (
            !parsedUrl.isValid ||
            parsedUrl.lightdashPage === undefined ||
            parsedUrl.url === undefined
        ) {
            return undefined;
        }

        const { title, description, organizationUuid, chartType } =
            await this.getTitleAndDescription(parsedUrl);

        return {
            title,
            description,
            pageType: parsedUrl.lightdashPage,
            imageUrl: undefined,
            minimalUrl: parsedUrl.minimalUrl,
            organizationUuid,
            chartType,
        };
    }

    async unfurlImage(
        url: string,
        lightdashPage: LightdashPage,
        imageId: string,
        authUserUuid: string,
    ): Promise<string | undefined> {
        const cookie = await this.getUserCookie(authUserUuid);
        const details = await this.unfurlDetails(url);
        const buffer = await this.saveScreenshot(
            imageId,
            cookie,
            url,
            lightdashPage,
            details?.chartType,
        );

        let imageUrl;
        if (buffer !== undefined) {
            if (this.s3Service.isEnabled()) {
                imageUrl = await this.s3Service.uploadImage(buffer, imageId);
            } else {
                // We will share the image saved by puppetteer on our lightdash enpdoint
                imageUrl = `${this.lightdashConfig.siteUrl}/api/v1/slack/image/${imageId}.png`;
            }
        }

        return imageUrl;
    }

    async exportDashboard(
        dashboardUuid: string,
        filters: string,
        user: SessionUser,
    ): Promise<string> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const { organizationUuid, projectUuid, name, minimalUrl, pageType } = {
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            name: dashboard.name,
            minimalUrl: `${this.lightdashConfig.siteUrl}/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}${filters}`,
            pageType: LightdashPage.DASHBOARD,
        };
        if (
            user.ability.cannot(
                'view',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const imageUrl = await this.unfurlImage(
            minimalUrl,
            pageType,
            `slack-image_${snakeCaseName(name)}_${useNanoid()}`, // In order to use local images from slackRouter, image needs to start with slack-image
            user.userUuid,
        );
        if (imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
        return imageUrl;
    }

    private async saveScreenshot(
        imageId: string,
        cookie: string,
        url: string,
        lightdashPage: LightdashPage,
        chartType?: string,
    ): Promise<Buffer | undefined> {
        let browser;

        if (this.lightdashConfig.headlessBrowser?.host === undefined) {
            Logger.error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
            throw new Error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
        }

        try {
            const browserWSEndpoint = `ws://${
                this.lightdashConfig.headlessBrowser?.host
            }:${this.lightdashConfig.headlessBrowser?.port || 3001}`;
            browser = await puppeteer.connect({
                browserWSEndpoint,
            });

            const page = await browser.newPage();

            await page.setExtraHTTPHeaders({ cookie });

            if (chartType === ChartType.BIG_NUMBER) {
                await page.setViewport(bigNumberViewport);
            } else {
                await page.setViewport(viewport);
            }

            await page.setRequestInterception(true);
            page.on('request', (request: any) => {
                const requestUrl = request.url();
                const parsedUrl = new URL(url);
                // Only allow request to the same host
                if (!requestUrl.includes(parsedUrl.hostname)) {
                    request.abort();
                    return;
                }
                request.continue();
            });
            try {
                await page.goto(url, {
                    timeout: 150000, // Wait 2.5 mins for the page to load
                    waitUntil: 'networkidle0',
                });
            } catch (e) {
                Logger.warn(
                    `Got a timeout when waiting for the page to load, returning current content`,
                );
            }

            const path = `/tmp/${imageId}.png`;
            const selector =
                lightdashPage === LightdashPage.EXPLORE
                    ? `.echarts-for-react, [data-testid="visualization"]`
                    : 'body';

            const element = await page.waitForSelector(selector, {
                timeout: 30000,
            });

            if (!element) {
                Logger.warn(`Can't find element on page`);
                return undefined;
            }
            const imageBuffer = (await element.screenshot({
                path,
            })) as Buffer;

            return imageBuffer;
        } catch (e) {
            Sentry.captureException(e);

            Logger.error(
                `Unable to fetch screenshots from headless chrome ${e.message}`,
            );
            throw e;
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

            const { searchParams } = new URL(url);
            return {
                isValid: true,
                lightdashPage: LightdashPage.DASHBOARD,
                url,
                minimalUrl: `${
                    this.lightdashConfig.siteUrl
                }/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}?${searchParams.toString()}`,
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
                minimalUrl: `${this.lightdashConfig.siteUrl}/minimal/projects/${projectUuid}/saved/${chartUuid}`,
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
                minimalUrl: url,
                projectUuid,
                exploreModel,
            };
        }

        Logger.debug(`URL to unfurl ${url} is not valid`);
        return {
            isValid: false,
            url,
            minimalUrl: url,
        };
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
}
