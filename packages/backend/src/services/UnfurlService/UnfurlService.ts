import { subject } from '@casl/ability';
import {
    assertUnreachable,
    AuthorizationError,
    ChartType,
    DownloadFileType,
    ForbiddenError,
    isDashboardChartTileType,
    LightdashPage,
    SessionUser,
    snakeCaseName,
} from '@lightdash/common';
import opentelemetry, { SpanStatusCode, ValueType } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import * as fsPromise from 'fs/promises';
import { nanoid as useNanoid } from 'nanoid';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import playwright from 'playwright';
import puppeteer, {
    ProtocolError,
    TimeoutError,
    type Browser,
    type Page,
} from 'puppeteer';
import { S3Client } from '../../clients/Aws/s3';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ShareModel } from '../../models/ShareModel';
import { SpaceModel } from '../../models/SpaceModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { getAuthenticationToken } from '../../routers/headlessBrowser';
import { VERSION } from '../../version';
import { BaseService } from '../BaseService';

const meter = opentelemetry.metrics.getMeter('lightdash-worker', VERSION);
const tracer = opentelemetry.trace.getTracer('lightdash-worker', VERSION);
const taskDurationHistogram = meter.createHistogram<{
    error: boolean;
}>('screenshot.duration_ms', {
    description: 'Duration of taking screenshot in milliseconds',
    unit: 'milliseconds',
});

const chartCounter = meter.createObservableUpDownCounter<{
    errors: number;
    timeout: boolean;
    organization_uuid: string;
}>('screenshot.chart.count', {
    description: 'Total number of chart requests on an unfurl job',
    valueType: ValueType.INT,
});

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

const SCREENSHOT_RETRIES = 3;

export type Unfurl = {
    title: string;
    description?: string;
    chartType?: string;
    imageUrl: string | undefined;
    pageType: LightdashPage;
    minimalUrl: string;
    organizationUuid: string;
    resourceUuid: string | undefined;
    chartTileUuids?: (string | null)[];
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

type UnfurlServiceArguments = {
    lightdashConfig: LightdashConfig;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
    shareModel: ShareModel;
    s3Client: S3Client;
    projectModel: ProjectModel;
    downloadFileModel: DownloadFileModel;
};

export class UnfurlService extends BaseService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    shareModel: ShareModel;

    s3Client: S3Client;

    projectModel: ProjectModel;

    downloadFileModel: DownloadFileModel;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        spaceModel,
        shareModel,
        s3Client,
        projectModel,
        downloadFileModel,
    }: UnfurlServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.shareModel = shareModel;
        this.s3Client = s3Client;
        this.projectModel = projectModel;
        this.downloadFileModel = downloadFileModel;
    }

    async getTitleAndDescription(parsedUrl: ParsedUrl): Promise<
        Pick<
            Unfurl,
            'title' | 'description' | 'chartType' | 'organizationUuid'
        > & {
            resourceUuid?: string;
            chartTileUuids?: (string | null)[];
        }
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
                    resourceUuid: dashboard.uuid,
                    chartTileUuids: dashboard.tiles
                        .filter(isDashboardChartTileType)
                        .map((t) => t.properties.savedChartUuid),
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
                    resourceUuid: chart.uuid,
                };
            case LightdashPage.EXPLORE:
                const project = await this.projectModel.getSummary(
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

        const {
            title,
            description,
            organizationUuid,
            chartType,
            resourceUuid,
            ...rest
        } = await this.getTitleAndDescription(parsedUrl);

        return {
            title,
            description,
            pageType: parsedUrl.lightdashPage,
            imageUrl: undefined,
            minimalUrl: parsedUrl.minimalUrl,
            organizationUuid,
            chartType,
            resourceUuid,
            chartTileUuids: rest.chartTileUuids,
        };
    }

    static async createImagePdf(
        imageId: string,
        buffer: Buffer,
    ): Promise<string> {
        // Converts an image to PDF format,
        // The PDF has the size of the image, not DIN A4
        const pdfDoc = await PDFDocument.create();
        const pngImage = await pdfDoc.embedPng(buffer);
        const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
        page.drawImage(pngImage);
        const path = `/tmp/${imageId}.pdf`;
        const pdfBytes = await pdfDoc.save();
        await fsPromise.writeFile(path, pdfBytes);
        return path;
    }

    async unfurlImage({
        url,
        lightdashPage,
        imageId,
        authUserUuid,
        gridWidth,
        withPdf = false,
        selector = undefined,
    }: {
        url: string;
        lightdashPage?: LightdashPage;
        imageId: string;
        authUserUuid: string;
        gridWidth?: number | undefined;
        withPdf?: boolean;
        selector?: string;
    }): Promise<{ imageUrl?: string; pdfPath?: string }> {
        const cookie = await this.getUserCookie(authUserUuid);
        const details = await this.unfurlDetails(url);

        const usePlaywrightSaveScreenshot =
            this.lightdashConfig.scheduler.screenshotWithPlaywright;

        if (usePlaywrightSaveScreenshot) {
            this.logger.info(
                `Using Playwright to take screenshots for ${url} with details ${details?.minimalUrl} + ${details?.organizationUuid} + ${details?.resourceUuid} + ${details?.title}`,
            );
        }

        const buffer = usePlaywrightSaveScreenshot
            ? await this.saveScreenshotWithPlaywright({
                  imageId,
                  cookie,
                  url,
                  lightdashPage,
                  chartType: details?.chartType,
                  organizationUuid: details?.organizationUuid,
                  gridWidth,
                  resourceUuid: details?.resourceUuid,
                  resourceName: details?.title,
                  selector,
                  chartTileUuids: details?.chartTileUuids,
              })
            : await this.saveScreenshot({
                  imageId,
                  cookie,
                  url,
                  lightdashPage,
                  chartType: details?.chartType,
                  organizationUuid: details?.organizationUuid,
                  gridWidth,
                  resourceUuid: details?.resourceUuid,
                  resourceName: details?.title,
                  selector,
              });

        let imageUrl;
        let pdfPath;
        if (buffer !== undefined) {
            if (withPdf)
                pdfPath = await UnfurlService.createImagePdf(imageId, buffer);

            if (this.s3Client.isEnabled()) {
                imageUrl = await this.s3Client.uploadImage(buffer, imageId);
            } else {
                // We will share the image saved by puppetteer on our lightdash enpdoint
                const filePath = `/tmp/${imageId}.png`;
                const downloadFileId = useNanoid();
                await this.downloadFileModel.createDownloadFile(
                    downloadFileId,
                    filePath,
                    DownloadFileType.IMAGE,
                );

                imageUrl = new URL(
                    `/api/v1/slack/image/${downloadFileId}`,
                    this.lightdashConfig.siteUrl,
                ).href;
            }
        }

        return { imageUrl, pdfPath };
    }

    async exportDashboard(
        dashboardUuid: string,
        queryFilters: string,
        gridWidth: number | undefined,
        user: SessionUser,
    ): Promise<string> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const { isPrivate } = await this.spaceModel.get(dashboard.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboard.spaceUuid,
        );
        const { organizationUuid, projectUuid, name, minimalUrl, pageType } = {
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            name: dashboard.name,
            minimalUrl: new URL(
                `/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}${queryFilters}`,
                this.lightdashConfig.siteUrl,
            ).href,
            pageType: LightdashPage.DASHBOARD,
        };

        if (
            user.ability.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid,
                    projectUuid,
                    isPrivate,
                    access,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const unfurlImage = await this.unfurlImage({
            url: minimalUrl,
            lightdashPage: pageType,
            imageId: `slack-image_${snakeCaseName(name)}_${useNanoid()}`,
            authUserUuid: user.userUuid,
            gridWidth,
        });
        if (unfurlImage.imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
        return unfurlImage.imageUrl;
    }

    private async saveScreenshotWithPlaywright({
        imageId,
        cookie,
        url,
        lightdashPage,
        chartType,
        organizationUuid,
        gridWidth = undefined,
        resourceUuid = undefined,
        resourceName = undefined,
        selector = 'body',
        chartTileUuids = undefined,
        retries = SCREENSHOT_RETRIES,
    }: {
        imageId: string;
        cookie: string;
        url: string;
        lightdashPage?: LightdashPage;
        chartType?: string;
        organizationUuid?: string;
        gridWidth?: number | undefined;
        resourceUuid?: string;
        resourceName?: string;
        selector?: string;
        chartTileUuids?: (string | null)[] | undefined;
        retries?: number;
    }): Promise<Buffer | undefined> {
        if (this.lightdashConfig.headlessBrowser?.host === undefined) {
            this.logger.error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
            throw new Error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
        }
        const startTime = Date.now();
        let hasError = false;

        // eslint-disable-next-line no-param-reassign
        retries -= 1;

        return tracer.startActiveSpan(
            'UnfurlService.saveScreenshot',
            async (span) => {
                let browser: playwright.Browser | undefined;
                let page: playwright.Page | undefined;

                try {
                    const browserWSEndpoint = `ws://${
                        this.lightdashConfig.headlessBrowser?.host
                    }:${this.lightdashConfig.headlessBrowser?.port || 3001}`;

                    browser = await playwright.chromium.connectOverCDP(
                        browserWSEndpoint,
                    );

                    page = await browser.newPage();
                    const parsedUrl = new URL(url);

                    const cookieMatch = cookie.match(/connect\.sid=([^;]+)/); // Extract cookie value
                    if (!cookieMatch)
                        throw new Error('Invalid cookie provided');
                    const cookieValue = cookieMatch[1];
                    await page.context().addCookies([
                        {
                            name: 'connect.sid',
                            value: cookieValue,
                            domain: parsedUrl.hostname,
                            path: '/',
                            sameSite: 'Strict',
                        },
                    ]);

                    if (chartType === ChartType.BIG_NUMBER) {
                        await page.setViewportSize(bigNumberViewport);
                    } else {
                        await page.setViewportSize({
                            ...viewport,
                            width: gridWidth ?? viewport.width,
                        });
                    }

                    page.on('requestfailed', (request) => {
                        this.logger.warn(
                            `Headless browser request error - method: ${request.method()}, url: ${request.url()}, text: ${
                                request.failure()?.errorText
                            }`,
                        );
                    });

                    page.on('console', (msg) => {
                        const type = msg.type();
                        if (type === 'error') {
                            this.logger.warn(
                                `Headless browser console error - file: ${
                                    msg.location().url
                                }, text ${msg.text()}`,
                            );
                        }
                    });

                    let chartRequests = 0;
                    let chartRequestErrors = 0;

                    page.on('response', async (response) => {
                        const responseUrl = response.url();
                        const regexUrlToMatch =
                            lightdashPage === LightdashPage.EXPLORE ||
                            lightdashPage === LightdashPage.CHART
                                ? /\/saved\/[a-f0-9-]+\/results/
                                : /\/saved\/[a-f0-9-]+\/chart-and-results/; // NOTE: Chart endpoint in Dashboards is different
                        if (responseUrl.match(regexUrlToMatch)) {
                            chartRequests += 1;
                            response.body().then(
                                (buffer) => {
                                    const status = response.status();
                                    if (status >= 400) {
                                        this.logger.error(
                                            `Headless browser response error - url: ${responseUrl}, code: ${response.status()}, text: ${buffer}`,
                                        );
                                        chartRequestErrors += 1;
                                    }
                                },
                                (error) => {
                                    this.logger.error(
                                        `Headless browser response buffer error: ${error.message}`,
                                    );
                                    chartRequestErrors += 1;
                                },
                            );
                        }
                    });
                    let timeout = false;
                    try {
                        let chartResultsPromises:
                            | (Promise<playwright.Response> | undefined)[]
                            | undefined;

                        if (lightdashPage === LightdashPage.DASHBOARD) {
                            // Wait for the all charts to load if we are in a dashboard
                            chartResultsPromises = chartTileUuids?.map((id) => {
                                const responsePattern = new RegExp(
                                    `${id}/chart-and-results`,
                                );

                                return page?.waitForResponse(responsePattern); // NOTE: No await here
                            });
                        } else if (
                            lightdashPage === LightdashPage.CHART ||
                            lightdashPage === LightdashPage.EXPLORE
                        ) {
                            // Wait for the visualization to load if we are in an explore page
                            const responsePattern = new RegExp(
                                `${resourceUuid}/results`,
                            );

                            chartResultsPromises = [
                                page?.waitForResponse(responsePattern),
                            ];
                        }

                        await page.goto(url, {
                            timeout: 150000,
                        });

                        if (chartResultsPromises) {
                            // We wait after navigating to the page
                            await Promise.allSettled(chartResultsPromises);
                        }
                    } catch (e) {
                        timeout = true;
                        this.logger.warn(
                            `Got a timeout when waiting for the page to load, returning current content`,
                        );
                    }

                    const path = `/tmp/${imageId}.png`;

                    let finalSelector = selector;

                    if (lightdashPage === LightdashPage.EXPLORE) {
                        finalSelector = `[data-testid="visualization"]`;
                    } else if (lightdashPage === LightdashPage.DASHBOARD) {
                        finalSelector = '.react-grid-layout';
                    }

                    if (lightdashPage === LightdashPage.DASHBOARD) {
                        const fullPage = await page.$('.react-grid-layout');
                        const fullPageSize = await fullPage?.boundingBox();
                        await page.setViewportSize({
                            width: gridWidth ?? viewport.width,
                            height: fullPageSize?.height
                                ? Math.round(fullPageSize.height)
                                : viewport.height,
                        });
                    }

                    chartCounter.addCallback(async (result) => {
                        result.observe(chartRequests, {
                            errors: chartRequestErrors,
                            timeout,
                            organization_uuid: organizationUuid || 'undefined',
                        });
                    });

                    span.setAttributes({
                        'chart.requests.total': chartRequests,
                        'chart.requests.error': chartRequestErrors,
                        'page.type': lightdashPage,
                        url,
                        chartType: chartType || 'undefined',
                        organization_uuid: organizationUuid || 'undefined',
                    });

                    const imageBuffer = await page
                        .locator(finalSelector)
                        .screenshot({
                            path,
                            ...(lightdashPage === LightdashPage.DASHBOARD
                                ? { animations: 'disabled' }
                                : {}),
                        });
                    return imageBuffer;
                } catch (e) {
                    const isRetryableError =
                        e instanceof playwright.errors.TimeoutError ||
                        // Following error messages were taken from the Playwright source code
                        e.message.includes('Protocol error') ||
                        e.message.includes('Target crashed') ||
                        e.message.includes(
                            'Target page, context or browser has been closed',
                        );

                    if (isRetryableError && retries) {
                        this.logger.info(
                            `Retrying: unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${e.message}`,
                        );
                        span.recordException(e);
                        span.setAttributes({
                            'page.type': lightdashPage,
                            url,
                            chartType: chartType || 'undefined',
                            organization_uuid: organizationUuid || 'undefined',
                            uuid: resourceUuid ?? 'undefined',
                            title: resourceName ?? 'undefined',
                            is_retrying: true,
                            custom_width: `${gridWidth}`,
                        });
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                        });

                        return await this.saveScreenshotWithPlaywright({
                            imageId,
                            cookie,
                            url,
                            lightdashPage,
                            chartType,
                            organizationUuid,
                            gridWidth,
                            resourceUuid,
                            resourceName,
                            selector,
                            chartTileUuids,
                            retries,
                        });
                    }

                    Sentry.captureException(e);
                    hasError = true;
                    span.recordException(e);
                    span.setAttributes({
                        'page.type': lightdashPage,
                        url,
                        chartType: chartType || 'undefined',
                        organization_uuid: organizationUuid || 'undefined',
                        uuid: resourceUuid ?? 'undefined',
                        title: resourceName ?? 'undefined',
                        custom_width: `${gridWidth}`,
                    });
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                    });

                    this.logger.error(
                        `Unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${e.message}`,
                    );
                    throw e;
                } finally {
                    if (page) await page.close();
                    if (browser) await browser.close(); // clears all created contexts belonging to this browser and disconnects from the browser server.

                    span.end();

                    const executionTime = Date.now() - startTime;
                    this.logger.info(
                        `UnfurlService saveScreenshot took ${executionTime} ms`,
                    );
                    taskDurationHistogram.record(executionTime, {
                        error: hasError,
                    });
                }
            },
        );
    }

    private async saveScreenshot({
        imageId,
        cookie,
        url,
        lightdashPage,
        chartType,
        organizationUuid,
        gridWidth = undefined,
        resourceUuid = undefined,
        resourceName = undefined,
        selector = 'body',
        retries = SCREENSHOT_RETRIES,
    }: {
        imageId: string;
        cookie: string;
        url: string;
        lightdashPage?: LightdashPage;
        chartType?: string;
        organizationUuid?: string;
        gridWidth?: number | undefined;
        resourceUuid?: string;
        resourceName?: string;
        selector?: string;
        retries?: number;
    }): Promise<Buffer | undefined> {
        if (this.lightdashConfig.headlessBrowser?.host === undefined) {
            this.logger.error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
            throw new Error(
                `Can't get screenshot if HEADLESS_BROWSER_HOST env variable is not defined`,
            );
        }
        const startTime = Date.now();
        let hasError = false;

        // eslint-disable-next-line no-param-reassign
        retries -= 1;

        return tracer.startActiveSpan(
            'UnfurlService.saveScreenshot',
            async (span) => {
                let browser: Browser | undefined;
                let page: Page | undefined;

                try {
                    const browserWSEndpoint = `ws://${
                        this.lightdashConfig.headlessBrowser?.host
                    }:${this.lightdashConfig.headlessBrowser?.port || 3001}`;
                    browser = await puppeteer.connect({
                        browserWSEndpoint,
                    });

                    page = await browser.newPage();
                    const parsedUrl = new URL(url);

                    const cookieMatch = cookie.match(/connect\.sid=([^;]+)/); // Extract cookie value
                    if (!cookieMatch)
                        throw new Error('Invalid cookie provided');
                    const cookieValue = cookieMatch[1];
                    // Set cookie using `setCookie` instead of `setExtraHTTPHeaders` , otherwise this cookie will be leaked into other domains
                    await page.setCookie({
                        name: 'connect.sid',
                        value: cookieValue,
                        domain: parsedUrl.hostname, // Don't use ports here, cookies do not provide isolation by port
                        sameSite: 'Strict',
                    });

                    if (chartType === ChartType.BIG_NUMBER) {
                        await page.setViewport(bigNumberViewport);
                    } else {
                        await page.setViewport({
                            ...viewport,
                            width: gridWidth ?? viewport.width,
                        });
                    }
                    page.on('requestfailed', (request) => {
                        this.logger.warn(
                            `Headless browser request error - method: ${request.method()}, url: ${request.url()}, text: ${
                                request.failure()?.errorText
                            }`,
                        );
                    });
                    page.on('console', (msg) => {
                        const type = msg.type();
                        if (type === 'error') {
                            this.logger.warn(
                                `Headless browser console error - file: ${
                                    msg.location().url
                                }, text ${msg.text()} `,
                            );
                        }
                    });
                    /*
                    // This code can be used to block requests to external domains
                    // We disabled this so people can use images on markdown
                    await page.setRequestInterception(true);
                    await page.on('request', (request: HTTPRequest) => {
                        const requestUrl = request.url();
                        const cookie = request.headers()['cookie']
                        const parsedUrl = new URL(url);
                        // Only allow request to the same host
                        if (!requestUrl.includes(parsedUrl.origin)) {
                            request.abort();
                            return;
                        }
                        request.continue();
                    });
                    */
                    let chartRequests = 0;
                    let chartRequestErrors = 0;

                    page.on('response', (response) => {
                        const responseUrl = response.url();
                        const regexUrlToMatch =
                            lightdashPage === LightdashPage.EXPLORE
                                ? /\/saved\/[a-f0-9-]+\/results/
                                : /\/saved\/[a-f0-9-]+\/chart-and-results/; // NOTE: Chart endpoint in Dashboards is different
                        if (responseUrl.match(regexUrlToMatch)) {
                            chartRequests += 1;
                            response.buffer().then(
                                (buffer) => {
                                    const status = response.status();
                                    if (status >= 400) {
                                        this.logger.error(
                                            `Headless browser response error - url: ${responseUrl}, code: ${response.status()}, text: ${buffer}`,
                                        );
                                        chartRequestErrors += 1;
                                    }
                                },
                                (error) => {
                                    this.logger.error(
                                        `Headless browser response buffer error: ${error.message}`,
                                    );
                                    chartRequestErrors += 1;
                                },
                            );
                        }
                    });
                    let timeout = false;
                    try {
                        await page.goto(url, {
                            timeout: 150000, // Wait 2.5 mins for the page to load
                            waitUntil: 'networkidle0',
                        });
                    } catch (e) {
                        timeout = true;
                        this.logger.warn(
                            `Got a timeout when waiting for the page to load, returning current content`,
                        );
                    }
                    // Wait until the page is fully loaded
                    await page
                        .waitForSelector('.loading_chart', {
                            hidden: true,
                            timeout: 30000,
                        })
                        .catch(() => {
                            timeout = true;
                            this.logger.warn(
                                `Got a timeout when waiting for all charts to be loaded, returning current content`,
                            );
                        });

                    const path = `/tmp/${imageId}.png`;

                    let finalSelector = selector;

                    if (lightdashPage === LightdashPage.EXPLORE) {
                        finalSelector = `[data-testid="visualization"]`;
                    } else if (lightdashPage === LightdashPage.DASHBOARD) {
                        finalSelector = '.react-grid-layout';
                    }

                    const element = await page.waitForSelector(finalSelector, {
                        timeout: 60000,
                    });

                    if (lightdashPage === LightdashPage.DASHBOARD) {
                        const fullPage = await page.$('.react-grid-layout');
                        const fullPageSize = await fullPage?.boundingBox();
                        await page.setViewport({
                            width: gridWidth ?? viewport.width,
                            height: fullPageSize?.height
                                ? parseInt(fullPageSize.height.toString(), 10)
                                : viewport.height,
                        });
                    }

                    if (!element) {
                        this.logger.warn(`Can't find element on page`);
                        return undefined;
                    }

                    const box = await element.boundingBox();
                    const pageMetrics = await page.metrics();

                    chartCounter.addCallback(async (result) => {
                        result.observe(chartRequests, {
                            errors: chartRequestErrors,
                            timeout,
                            organization_uuid: organizationUuid || 'undefined',
                        });
                    });

                    span.setAttributes({
                        'page.width': box?.width,
                        'page.height': box?.height,
                        'chart.requests.total': chartRequests,
                        'chart.requests.error': chartRequestErrors,
                        'page.metrics.task_duration': pageMetrics.TaskDuration,
                        'page.metrics.heap_size': pageMetrics.JSHeapUsedSize,
                        'page.metrics.total_size': pageMetrics.JSHeapTotalSize,
                        'page.type': lightdashPage,
                        url,
                        chartType: chartType || 'undefined',
                        organization_uuid: organizationUuid || 'undefined',
                        'page.metrics.event_listeners':
                            pageMetrics.JSEventListeners,
                        timeout,
                    });

                    if (this.lightdashConfig.scheduler.screenshotTimeout) {
                        await new Promise((resolve) => {
                            setTimeout(
                                resolve,
                                this.lightdashConfig.scheduler
                                    .screenshotTimeout,
                            );
                        });
                    }
                    const imageBuffer = await element.screenshot({
                        path,
                        ...(lightdashPage === LightdashPage.DASHBOARD
                            ? {
                                  scrollIntoView: true,
                              }
                            : {}),
                    });
                    return imageBuffer;
                } catch (e) {
                    /**
                     * An error can be retried if it is a TimeoutError or a ProtocolError
                     * - TimeoutError: when the page is not loaded in time or the element is not found
                     * - ProtocolError: when the page is closed before the screenshot is taken
                     * - That include the message "Target closed" or "Protocol error" - e.g: Protocol error (Page.captureScreenshot): Target closed or Protocol error (DOM.describeNode): Target closed"
                     */
                    const isRetryableError =
                        e instanceof TimeoutError ||
                        e instanceof ProtocolError ||
                        e.message.includes('Protocol error') ||
                        e.message.includes('Target closed');

                    if (isRetryableError && retries) {
                        this.logger.info(
                            `Retrying: unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${e.message}`,
                        );
                        span.recordException(e);
                        span.setAttributes({
                            'page.type': lightdashPage,
                            url,
                            chartType: chartType || 'undefined',
                            organization_uuid: organizationUuid || 'undefined',
                            uuid: resourceUuid ?? 'undefined',
                            title: resourceName ?? 'undefined',
                            is_retrying: true,
                            custom_width: `${gridWidth}`,
                        });
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                        });

                        return await this.saveScreenshot({
                            imageId,
                            cookie,
                            url,
                            lightdashPage,
                            chartType,
                            organizationUuid,
                            gridWidth,
                            resourceUuid,
                            resourceName,
                            selector,
                            retries,
                        });
                    }

                    Sentry.captureException(e);
                    hasError = true;
                    span.recordException(e);
                    span.setAttributes({
                        'page.type': lightdashPage,
                        url,
                        chartType: chartType || 'undefined',
                        organization_uuid: organizationUuid || 'undefined',
                        uuid: resourceUuid ?? 'undefined',
                        title: resourceName ?? 'undefined',
                        custom_width: `${gridWidth}`,
                    });
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                    });

                    this.logger.error(
                        `Unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${e.message}`,
                    );
                    throw e;
                } finally {
                    if (page) await page.close();
                    if (browser) await browser.disconnect();

                    span.end();

                    const executionTime = Date.now() - startTime;
                    this.logger.info(
                        `UnfurlService saveScreenshot took ${executionTime} ms`,
                    );
                    taskDurationHistogram.record(executionTime, {
                        error: hasError,
                    });
                }
            },
        );
    }

    private async getSharedUrl(linkUrl: string): Promise<string> {
        const [shareId] = linkUrl.match(nanoidRegex) || [];
        if (!shareId) return linkUrl;

        const shareUrl = await this.shareModel.getSharedUrl(shareId);

        const fullUrl = new URL(
            `${shareUrl.path}${shareUrl.params}`,
            this.lightdashConfig.siteUrl,
        ).href;
        this.logger.debug(`Shared url ${shareId}: ${fullUrl}`);

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
                minimalUrl: new URL(
                    `/minimal/projects/${projectUuid}/saved/${chartUuid}`,
                    this.lightdashConfig.siteUrl,
                ).href,
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

        this.logger.debug(`URL to unfurl ${url} is not valid`);
        return {
            isValid: false,
            url,
            minimalUrl: url,
        };
    }

    private async getUserCookie(userUuid: string): Promise<string> {
        const token = getAuthenticationToken(userUuid);

        const response = await fetch(
            new URL(
                `/api/v1/headless-browser/login/${userUuid}`,
                this.lightdashConfig.siteUrl,
            ).href,
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
