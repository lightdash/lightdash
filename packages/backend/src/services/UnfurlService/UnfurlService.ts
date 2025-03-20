import { subject } from '@casl/ability';
import {
    ApiGetAsyncQueryResults,
    assertUnreachable,
    AuthorizationError,
    ChartType,
    DownloadFileType,
    ForbiddenError,
    getErrorMessage,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    LightdashPage,
    LightdashRequestMethodHeader,
    QueryHistoryStatus,
    RequestMethod,
    ScreenshotError,
    SessionUser,
    snakeCaseName,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import * as fsPromise from 'fs/promises';
import { nanoid as useNanoid } from 'nanoid';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import playwright from 'playwright';
import { S3Client } from '../../clients/Aws/S3Client';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { ShareModel } from '../../models/ShareModel';
import { SpaceModel } from '../../models/SpaceModel';
import { getAuthenticationToken } from '../../routers/headlessBrowser';
import { BaseService } from '../BaseService';

const RESPONSE_TIMEOUT_MS = 90000;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');
const nanoid = '[\\w-]{21}';
const nanoidRegex = new RegExp(nanoid);
const legacyMetricQueryEndpointRegex = /\/runQuery/;
const createQueryEndpointRegex = /\/query/;
const paginatedQueryEndpointRegex = new RegExp(`/query/${uuid}`);
const legacyChartAndResultsEndpointRegex =
    /\/saved\/[a-f0-9-]+\/chart-and-results/;
const legacyChartResultsEndpointRegex = /\/saved\/[a-f0-9-]+\/results/;

const viewport = {
    width: 1400,
    height: 768,
};

const bigNumberViewport = {
    width: 768,
    height: 500,
};

export enum ScreenshotContext {
    SCHEDULED_DELIVERY = 'scheduled_delivery',
    SLACK = 'slack',
    EXPORT_DASHBOARD = 'export_dashboard',
}

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
    sqlChartTileUuids?: (string | null)[];
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

    static async waitForAllPaginatedResultsResponse(
        page: playwright.Page,
        expectedResponses: number,
        timeout: number,
    ) {
        let responseCount = 0;

        const responsePromise = new Promise<void>((resolve, reject) => {
            const responseHandler = async (response: playwright.Response) => {
                if (response.url().match(paginatedQueryEndpointRegex)) {
                    const body = await response.body();
                    const json = JSON.parse(body.toString()) as {
                        status: 'ok';
                        results: ApiGetAsyncQueryResults;
                    };
                    // Check if is last page (aka has no next page)
                    if (
                        json.results.status === QueryHistoryStatus.READY &&
                        !json.results.nextPage
                    ) {
                        responseCount += 1;
                        if (responseCount === expectedResponses) {
                            page.off('response', responseHandler); // Clean up the listener
                            resolve();
                        }
                    }
                }
            };
            page.on('response', responseHandler);
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(
                    new Error(
                        `Timeout after ${timeout}ms. Expected ${expectedResponses} but only received ${responseCount} responses.`,
                    ),
                );
            }, timeout);
        });

        return Promise.race([responsePromise, timeoutPromise]);
    }

    static async waitForPaginatedResultsResponse(page: playwright.Page) {
        return UnfurlService.waitForAllPaginatedResultsResponse(
            page,
            1,
            RESPONSE_TIMEOUT_MS,
        );
    }

    async getTitleAndDescription(parsedUrl: ParsedUrl): Promise<
        Pick<
            Unfurl,
            'title' | 'description' | 'chartType' | 'organizationUuid'
        > & {
            resourceUuid?: string;
            chartTileUuids?: (string | null)[];
            sqlChartTileUuids?: (string | null)[];
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
                    sqlChartTileUuids: dashboard.tiles
                        .filter(isDashboardSqlChartTile)
                        .map((t) => t.properties.savedSqlUuid),
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
            sqlChartTileUuids: rest.sqlChartTileUuids,
        };
    }

    private async createImagePdf(id: string, buffer: Buffer): Promise<string> {
        // Converts an image to PDF format,
        // The PDF has the size of the image, not DIN A4
        const pdfDoc = await PDFDocument.create();
        const pngImage = await pdfDoc.embedPng(buffer);
        const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
        page.drawImage(pngImage);
        const pdfBytes = await pdfDoc.save();

        let path: string;
        if (this.s3Client.isEnabled()) {
            path = await this.s3Client.uploadPdf(Buffer.from(pdfBytes), id);
        } else {
            path = `/tmp/${id}.pdf`;
            await fsPromise.writeFile(path, pdfBytes);
        }
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
        context,
        contextId,
    }: {
        url: string;
        lightdashPage?: LightdashPage;
        imageId: string;
        authUserUuid: string;
        gridWidth?: number | undefined;
        withPdf?: boolean;
        selector?: string;
        context: ScreenshotContext;
        contextId?: unknown;
    }): Promise<{ imageUrl?: string; pdfPath?: string }> {
        const cookie = await this.getUserCookie(authUserUuid);
        const details = await this.unfurlDetails(url);

        const buffer = await this.saveScreenshot({
            authUserUuid,
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
            sqlChartTileUuids: details?.sqlChartTileUuids,
            context,
            contextId,
        });

        let imageUrl;
        let pdfPath;
        if (buffer !== undefined) {
            if (withPdf) {
                pdfPath = await this.createImagePdf(imageId, buffer);
            }

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
                this.lightdashConfig.headlessBrowser.internalLightdashHost,
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
            context: ScreenshotContext.EXPORT_DASHBOARD,
        });
        if (unfurlImage.imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
        return unfurlImage.imageUrl;
    }

    private async saveScreenshot({
        imageId,
        cookie,
        url,
        lightdashPage,
        chartType,
        organizationUuid,
        authUserUuid,
        gridWidth = undefined,
        resourceUuid = undefined,
        resourceName = undefined,
        selector = 'body',
        chartTileUuids = undefined,
        sqlChartTileUuids = undefined,
        retries = SCREENSHOT_RETRIES,
        context,
        contextId,
    }: {
        imageId: string;
        cookie: string;
        url: string;
        lightdashPage?: LightdashPage;
        chartType?: string;
        organizationUuid?: string;
        authUserUuid: string;
        gridWidth?: number | undefined;
        resourceUuid?: string;
        resourceName?: string;
        selector?: string;
        chartTileUuids?: (string | null)[] | undefined;
        sqlChartTileUuids?: (string | null)[] | undefined;
        retries?: number;
        context: ScreenshotContext;
        contextId?: unknown;
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

        return Sentry.startSpan(
            {
                name: 'UnfurlService.saveScreenshot',
                op: 'saveScreenshot',
            },
            async (span) => {
                Sentry.setTags({
                    'page.type': lightdashPage ?? 'undefined',
                    'page.context': context ?? 'undefined',
                    'page.minimalUrl': url ?? 'undefined',
                    'page.resourceUuid': resourceUuid ?? 'undefined',
                    'page.resourceName': resourceName ?? 'undefined',
                    'page.chartType': chartType ?? 'undefined',
                    'page.organizationUuid': organizationUuid ?? 'undefined',
                    'page.userUuid': authUserUuid ?? 'undefined',
                });
                let browser: playwright.Browser | undefined;
                let page: playwright.Page | undefined;

                try {
                    const browserWSEndpoint = `ws://${
                        this.lightdashConfig.headlessBrowser?.host
                    }:${this.lightdashConfig.headlessBrowser?.port || 3001}`;

                    browser = await playwright.chromium.connectOverCDP(
                        browserWSEndpoint,
                        {
                            timeout: 1000 * 60 * 30, // 30 minutes
                            logger: {
                                isEnabled() {
                                    return true;
                                },
                                log: (name, severity, message, args): void => {
                                    const logMessage = `[${name}] ${message} ${JSON.stringify(
                                        args,
                                    )}`;
                                    switch (severity) {
                                        case 'warning':
                                            this.logger.warn(logMessage);
                                            break;
                                        case 'error':
                                            this.logger.error(logMessage);
                                            break;
                                        default:
                                            this.logger.debug(logMessage);
                                            break;
                                    }
                                },
                            },
                        },
                    );

                    page = await browser.newPage({
                        extraHTTPHeaders: {
                            [LightdashRequestMethodHeader]:
                                RequestMethod.HEADLESS_BROWSER,
                            'Lightdash-Headless-Browser-Context': context,
                            'Lightdash-Headless-Browser-Context-Id': contextId
                                ? contextId.toString()
                                : 'undefined',
                        },
                    });
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

                    // Log all query results errors
                    page.on('response', async (response) => {
                        const responseUrl = response.url();
                        const resultsEndpointRegexes = [
                            legacyMetricQueryEndpointRegex, // legacy endpoint for explorer page
                            legacyChartResultsEndpointRegex, // legacy endpoint for chart view page
                            legacyChartAndResultsEndpointRegex, // legacy endpoint for dashboard page
                            createQueryEndpointRegex, // create query
                            paginatedQueryEndpointRegex, // get paginated results
                        ];
                        const isResultsEndpointMatch =
                            resultsEndpointRegexes.some((regex) =>
                                regex.test(responseUrl),
                            );

                        if (isResultsEndpointMatch) {
                            response.body().then(
                                (buffer) => {
                                    const status = response.status();
                                    if (status >= 400) {
                                        this.logger.error(
                                            `Headless browser response error - url: ${responseUrl}, code: ${response.status()}, text: ${buffer}`,
                                        );
                                    } else if (
                                        paginatedQueryEndpointRegex.test(
                                            responseUrl,
                                        )
                                    ) {
                                        const json = JSON.parse(
                                            buffer.toString(),
                                        ) as {
                                            status: 'ok';
                                            results: ApiGetAsyncQueryResults;
                                        };
                                        if (
                                            json.results.status ===
                                            QueryHistoryStatus.ERROR
                                        ) {
                                            this.logger.error(
                                                `Headless browser response error while fetching paginated results - url: ${responseUrl}, text: ${json.results.error}`,
                                            );
                                        }
                                    }
                                },
                                (error) => {
                                    this.logger.error(
                                        `Headless browser response buffer error: ${getErrorMessage(
                                            error,
                                        )}`,
                                    );
                                },
                            );
                        }
                    });

                    try {
                        let chartResultsPromises:
                            | (Promise<unknown> | undefined)[]
                            | undefined;

                        if (lightdashPage === LightdashPage.DASHBOARD) {
                            // Wait for the all charts to load if we are in a dashboard
                            let exploreChartResultsPromise:
                                | Promise<unknown>
                                | undefined;
                            if (chartTileUuids) {
                                const legacyExploreChartResultsPromises =
                                    chartTileUuids.map((id) => {
                                        if (page) {
                                            const responsePattern = new RegExp(
                                                `${id}/chart-and-results`,
                                            );

                                            return page?.waitForResponse(
                                                responsePattern,
                                                {
                                                    timeout:
                                                        RESPONSE_TIMEOUT_MS,
                                                },
                                            ); // NOTE: No await here
                                        }
                                        return undefined;
                                    });
                                const expectedPaginatedResponses =
                                    chartTileUuids.length;
                                const paginatedQueryPromise =
                                    UnfurlService.waitForAllPaginatedResultsResponse(
                                        page,
                                        expectedPaginatedResponses,
                                        expectedPaginatedResponses *
                                            RESPONSE_TIMEOUT_MS,
                                    ); // NOTE: No await here

                                exploreChartResultsPromise = Promise.race([
                                    Promise.allSettled(
                                        legacyExploreChartResultsPromises,
                                    ),
                                    paginatedQueryPromise,
                                ]);
                            }

                            // Create separate arrays for each type of SQL response
                            let sqlInitialLoadPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;
                            let sqlResultsJobPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;
                            let sqlResultsPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;
                            let sqlPivotPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;

                            const filteredSqlChartTileUuids =
                                sqlChartTileUuids?.filter(
                                    (id): id is string => !!id,
                                );

                            const hasSqlCharts =
                                filteredSqlChartTileUuids &&
                                filteredSqlChartTileUuids.length > 0;
                            if (hasSqlCharts && page) {
                                sqlInitialLoadPromises =
                                    filteredSqlChartTileUuids.map((id) => {
                                        const responsePattern = new RegExp(
                                            `/sqlRunner/saved/${id}`,
                                        );
                                        return page?.waitForResponse(
                                            responsePattern,
                                            { timeout: RESPONSE_TIMEOUT_MS },
                                        );
                                    });

                                sqlResultsJobPromises =
                                    filteredSqlChartTileUuids.map(
                                        (id) =>
                                            page?.waitForResponse(
                                                new RegExp(
                                                    `/sqlRunner/saved/${id}/results-job`,
                                                ),
                                                {
                                                    timeout:
                                                        RESPONSE_TIMEOUT_MS,
                                                },
                                            ), // NOTE: No await here
                                    );

                                // These are shared responses for all SQL charts
                                sqlResultsPromises = [
                                    page?.waitForResponse(
                                        /\/sqlRunner\/results/,
                                        { timeout: RESPONSE_TIMEOUT_MS },
                                    ), // NOTE: No await here
                                ];

                                sqlPivotPromises = [
                                    page?.waitForResponse(
                                        /\/sqlRunner\/runPivotQuery/,
                                        { timeout: RESPONSE_TIMEOUT_MS },
                                    ), // NOTE: No await here
                                ];
                            }

                            chartResultsPromises = [
                                exploreChartResultsPromise,
                                ...(sqlInitialLoadPromises || []),
                                ...(sqlResultsJobPromises || []),
                                ...(sqlResultsPromises || []),
                                ...(sqlPivotPromises || []),
                            ];
                        } else if (lightdashPage === LightdashPage.CHART) {
                            // Wait for the visualization to load if we are in an saved explore page
                            const responsePattern = new RegExp(
                                `${resourceUuid}/results`,
                            );
                            // Wait for the visualization to load if we are in an unsaved explore page
                            const legacyQueryPromise = page?.waitForResponse(
                                responsePattern,
                                {
                                    timeout: RESPONSE_TIMEOUT_MS,
                                },
                            ); // NOTE: No await here
                            const paginatedQueryPromise =
                                UnfurlService.waitForPaginatedResultsResponse(
                                    page,
                                ); // NOTE: No await here

                            chartResultsPromises = [
                                Promise.race([
                                    legacyQueryPromise,
                                    paginatedQueryPromise,
                                ]),
                            ];
                        } else if (lightdashPage === LightdashPage.EXPLORE) {
                            // Wait for the visualization to load if we are in an unsaved explore page
                            const legacyQueryPromise = page?.waitForResponse(
                                legacyMetricQueryEndpointRegex,
                                {
                                    timeout: RESPONSE_TIMEOUT_MS,
                                },
                            ); // NOTE: No await here
                            const paginatedQueryPromise =
                                UnfurlService.waitForPaginatedResultsResponse(
                                    page,
                                ); // NOTE: No await here

                            chartResultsPromises = [
                                Promise.race([
                                    legacyQueryPromise,
                                    paginatedQueryPromise,
                                ]),
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
                        this.logger.warn(
                            `Got a timeout when waiting for the page to load, returning current content`,
                        );
                    }

                    if (lightdashPage === LightdashPage.DASHBOARD) {
                        // Wait for markdown tiles specifically
                        const markdownTiles = await page
                            .locator('.markdown-tile')
                            .all();
                        await Promise.all(
                            markdownTiles.map((tile) =>
                                tile.waitFor({ state: 'attached' }),
                            ),
                        );
                        const loadingChartOverlays = await page
                            .locator('.loading_chart_overlay')
                            .all();
                        await Promise.all(
                            loadingChartOverlays.map((loadingChartOverlay) =>
                                loadingChartOverlay.waitFor({
                                    state: 'hidden',
                                    timeout: RESPONSE_TIMEOUT_MS,
                                }),
                            ),
                        );
                    }

                    // If some charts are still loading even though their API requests have finished(or past the timeout), we wait for them to finish
                    // Reference: https://playwright.dev/docs/api/class-locator#locator-all
                    const loadingCharts = await page
                        .locator('.loading_chart')
                        .all();
                    await Promise.all(
                        loadingCharts.map((loadingChart) =>
                            loadingChart.waitFor({
                                state: 'hidden',
                                timeout: RESPONSE_TIMEOUT_MS,
                            }),
                        ),
                    );

                    const path = `/tmp/${imageId}.png`;

                    let finalSelector = selector;

                    if (lightdashPage === LightdashPage.EXPLORE) {
                        finalSelector = `[data-testid="visualization"]`;
                    } else if (lightdashPage === LightdashPage.DASHBOARD) {
                        finalSelector = '.react-grid-layout';
                    }

                    const fullPage = await page.locator(finalSelector);

                    if (chartType === ChartType.BIG_NUMBER) {
                        await page.setViewportSize(bigNumberViewport);
                    } else {
                        const fullPageSize = await fullPage?.boundingBox();

                        await page.setViewportSize({
                            width: gridWidth ?? viewport.width,
                            height: fullPageSize?.height
                                ? Math.round(fullPageSize.height)
                                : viewport.height,
                        });
                    }

                    if (
                        lightdashPage === LightdashPage.DASHBOARD ||
                        lightdashPage === LightdashPage.EXPLORE
                    ) {
                        const imageBuffer = await page
                            .locator(finalSelector)
                            .screenshot({
                                path,
                                animations: 'disabled',
                                timeout: RESPONSE_TIMEOUT_MS,
                            });

                        return imageBuffer;
                    }

                    // Full page screenshot for charts
                    const imageBuffer = await page.screenshot({
                        path,
                        fullPage: true,
                        animations: 'disabled',
                    });

                    return imageBuffer;
                } catch (e) {
                    const errorMessage = getErrorMessage(e);
                    const isRetryableError =
                        e instanceof playwright.errors.TimeoutError ||
                        // Following error messages were taken from the Playwright source code
                        errorMessage.includes('Protocol error') ||
                        errorMessage.includes('Target crashed') ||
                        errorMessage.includes(
                            'Target page, context or browser has been closed',
                        );

                    if (isRetryableError && retries) {
                        this.logger.info(
                            `Retrying: unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${getErrorMessage(
                                e,
                            )}`,
                        );

                        span.setAttributes({
                            is_retrying: true,
                        });
                        return await this.saveScreenshot({
                            authUserUuid,
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
                            sqlChartTileUuids,
                            retries,
                            context,
                            contextId,
                        });
                    }

                    hasError = true;

                    this.logger.error(
                        `Unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}. Message: ${getErrorMessage(
                            e,
                        )}`,
                    );

                    const errorType =
                        e instanceof playwright.errors.TimeoutError
                            ? 'timeout'
                            : 'failed';
                    span.setStatus({
                        code: 2, // Error
                    });

                    throw new ScreenshotError(
                        `Screenshot ${errorType}: ${errorMessage}`,
                        {
                            url,
                            lightdashPage,
                            context,
                            originalError: errorMessage,
                        },
                    );
                } finally {
                    if (page) await page.close();
                    if (browser) await browser.close(); // clears all created contexts belonging to this browser and disconnects from the browser server.

                    span.end();

                    const executionTime = Date.now() - startTime;
                    this.logger.info(
                        `UnfurlService saveScreenshot took ${executionTime} ms`,
                    );
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
                    this.lightdashConfig.headlessBrowser.internalLightdashHost
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
                    this.lightdashConfig.headlessBrowser.internalLightdashHost,
                ).href,
                projectUuid,
                chartUuid,
            };
        }
        if (url.match(exploreUrl) !== null) {
            const [projectUuid] = (await url.match(uuidRegex)) || [];

            const urlWithoutParams = url.split('?')[0];
            const exploreModel = urlWithoutParams.split('/tables/')[1];
            const internalUrl = url.replace(
                this.lightdashConfig.siteUrl,
                this.lightdashConfig.headlessBrowser.internalLightdashHost,
            );
            return {
                isValid: true,
                lightdashPage: LightdashPage.EXPLORE,
                url,
                minimalUrl: internalUrl,
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
        // Use internal URL for the request (could be the same as the site URL)
        const internalUrl = new URL(
            `/api/v1/headless-browser/login/${userUuid}`,
            this.lightdashConfig.headlessBrowser.internalLightdashHost,
        );

        const response = await fetch(internalUrl.href, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
        });
        if (response.status !== 200) {
            throw new AuthorizationError(
                `Unable to get cookie for user ${userUuid}: ${await response.text()}`,
            );
        }
        const header = response.headers.get('set-cookie');
        if (header === null) {
            const loginBody = (await response.json()) as {
                status: string;
                results: SessionUser;
            };
            throw new AuthorizationError(
                `Cannot sign in user before taking screenshot:\n${
                    'results' in loginBody ? loginBody.results?.userUuid : ''
                }`,
            );
        }
        return header;
    }
}
