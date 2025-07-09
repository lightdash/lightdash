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
import { PDFDocument, StandardFonts } from 'pdf-lib';
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

const RESPONSE_TIMEOUT_MS = 180000;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');
const nanoid = '[\\w-]{21}';
const nanoidRegex = new RegExp(nanoid);
const createQueryEndpointRegex = /\/query/;
const paginatedQueryEndpointRegex = new RegExp(`/query/${uuid}`);

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

    private async waitForAllPaginatedResultsResponse(
        page: playwright.Page,
        expectedResponses: number,
        timeout: number,
    ) {
        if (expectedResponses === 0) {
            return undefined;
        }

        let responseCount = 0;

        this.logger.info(
            `Waiting for ${expectedResponses} paginated responses with timeout ${timeout}ms`,
        );

        const responsePromise = new Promise<void>((resolve, reject) => {
            const responseHandler = async (response: playwright.Response) => {
                if (response.url().match(paginatedQueryEndpointRegex)) {
                    this.logger.debug(
                        `Received paginated response: ${response.url()}`,
                    );
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
                        this.logger.info(
                            `Paginated response is complete. Count: ${responseCount}/${expectedResponses}`,
                        );
                        if (responseCount === expectedResponses) {
                            this.logger.info(
                                `All ${expectedResponses} paginated responses received, resolving promise`,
                            );
                            page.off('response', responseHandler); // Clean up the listener
                            resolve();
                        }
                    } else {
                        this.logger.debug(
                            `Paginated response is not complete. Status: ${
                                json.results.status
                            }, hasNextPage: ${
                                'nextPage' in json.results
                                    ? !!json.results.nextPage
                                    : 'N/A'
                            }`,
                        );
                    }
                }
            };
            page.on('response', responseHandler);
        });

        // This is needed because tables are lazy loaded so we have no way of knowing when the chart is displayed
        async function waitForAllLoaded() {
            // Wait for all the loading overlays to be in the DOM
            await page.waitForSelector('.loading_chart_overlay', {
                state: 'attached',
            });

            // Wait for the loading overlay to be hidden (loading is complete)
            await page.waitForSelector('.loading_chart_overlay', {
                state: 'hidden',
            });
        }

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(
                    new Error(
                        `Timeout after ${timeout}ms. Expected ${expectedResponses} but only received ${responseCount} responses.`,
                    ),
                );
            }, timeout);
        });

        return Promise.race([
            responsePromise,
            waitForAllLoaded(),
            timeoutPromise,
        ]);
    }

    private async waitForPaginatedResultsResponse(page: playwright.Page) {
        return this.waitForAllPaginatedResultsResponse(
            page,
            1,
            RESPONSE_TIMEOUT_MS,
        );
    }

    async getTitleAndDescription(
        parsedUrl: ParsedUrl,
        selectedTabs?: string[],
    ): Promise<
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

                // Filter tiles based on selected tabs if they exist
                const filteredTiles =
                    selectedTabs && selectedTabs.length > 0
                        ? dashboard.tiles.filter((tile) =>
                              selectedTabs.includes(tile.tabUuid || ''),
                          )
                        : dashboard.tiles;

                return {
                    title: dashboard.name,
                    description: dashboard.description,
                    organizationUuid: dashboard.organizationUuid,
                    resourceUuid: dashboard.uuid,
                    chartTileUuids: filteredTiles
                        .filter(isDashboardChartTileType)
                        .map((t) => t.properties.savedChartUuid),
                    sqlChartTileUuids: filteredTiles
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

    async unfurlDetails(
        originUrl: string,
        selectedTabs: string[] = [],
    ): Promise<Unfurl | undefined> {
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
        } = await this.getTitleAndDescription(parsedUrl, selectedTabs);

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

    private async createImagePdf(
        id: string,
        buffer: Buffer,
    ): Promise<{ source: string; fileName: string }>;
    private async createImagePdf(
        id: string,
        buffers: Buffer[],
        tabNames?: string[],
    ): Promise<{ source: string; fileName: string }>;
    private async createImagePdf(
        id: string,
        bufferOrBuffers: Buffer | Buffer[],
        tabNames?: string[],
    ): Promise<{ source: string; fileName: string }> {
        // Converts image(s) to PDF format
        const pdfDoc = await PDFDocument.create();
        const buffers = Array.isArray(bufferOrBuffers)
            ? bufferOrBuffers
            : [bufferOrBuffers];

        // Pre-embed font to avoid await in loop
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        for (let i = 0; i < buffers.length; i += 1) {
            const buffer = buffers[i];
            const pngImage = await pdfDoc.embedPng(buffer); // eslint-disable-line no-await-in-loop
            const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
            page.drawImage(pngImage);

            // Add tab name as header if provided
            if (tabNames && tabNames[i]) {
                page.drawText(tabNames[i], {
                    x: 20,
                    y: pngImage.height - 30,
                    size: 16,
                    font,
                });
            }
        }

        const pdfBytes = await pdfDoc.save();

        let source: string;
        let fileName: string;
        if (this.s3Client.isEnabled()) {
            const uploadPdfReturn = await this.s3Client.uploadPdf(
                Buffer.from(pdfBytes),
                id,
            );
            source = uploadPdfReturn.url;
            fileName = uploadPdfReturn.fileName;
        } else {
            fileName = `${id}.pdf`;
            source = `/tmp/${fileName}`;
            await fsPromise.writeFile(source, pdfBytes);
        }

        return { source, fileName };
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
        selectedTabs,
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
        selectedTabs?: string[];
    }): Promise<{
        imageUrl?: string;
        pdfFile?: { source: string; fileName: string };
    }> {
        const cookie = await this.getUserCookie(authUserUuid);
        const details = await this.unfurlDetails(url, selectedTabs);

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
            selectedTabs,
        });

        let imageUrl;
        let pdfFile;

        if (buffer !== undefined) {
            if (withPdf) {
                // Check if we should create a multi-page PDF for dashboard tabs
                if (lightdashPage === LightdashPage.DASHBOARD) {
                    try {
                        // Extract selectedTabs from URL if they exist
                        const urlSelectedTabs =
                            this.extractSelectedTabsFromUrl(url);

                        this.logger.info(
                            `PDF generation for dashboard: url=${url}, selectedTabs=${JSON.stringify(
                                urlSelectedTabs,
                            )}`,
                        );

                        if (urlSelectedTabs && urlSelectedTabs.length > 1) {
                            // Use per-tab PDF export for multiple tabs
                            const userCookie = await this.getUserCookie(
                                authUserUuid,
                            );
                            const baseUrl = url.replace(
                                /[?&]selectedTabs=[^&]*/,
                                '',
                            );

                            // Extract dashboard UUID from URL path
                            const dashboardUuid =
                                this.extractDashboardUuidFromUrl(url);
                            if (dashboardUuid) {
                                const { buffers, tabNames } =
                                    await this.saveScreenshotPerTab({
                                        dashboardUuid,
                                        selectedTabs: urlSelectedTabs,
                                        cookie: userCookie,
                                        baseUrl,
                                        authUserUuid,
                                        gridWidth,
                                        context,
                                        contextId,
                                    });

                                if (buffers.length > 0) {
                                    pdfFile = await this.createImagePdf(
                                        imageId,
                                        buffers,
                                        tabNames,
                                    );
                                } else {
                                    // Fallback to single page if no tabs captured
                                    pdfFile = await this.createImagePdf(
                                        imageId,
                                        buffer,
                                    );
                                }
                            } else {
                                pdfFile = await this.createImagePdf(
                                    imageId,
                                    buffer,
                                );
                            }
                        } else {
                            pdfFile = await this.createImagePdf(
                                imageId,
                                buffer,
                            );
                        }
                    } catch (error) {
                        this.logger.warn(
                            `Failed to create per-tab PDF, falling back to single page: ${error}`,
                        );
                        pdfFile = await this.createImagePdf(imageId, buffer);
                    }
                } else {
                    pdfFile = await this.createImagePdf(imageId, buffer);
                }
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

        return {
            imageUrl,
            pdfFile,
        };
    }

    async exportDashboard(
        dashboardUuid: string,
        queryFilters: string,
        gridWidth: number | undefined,
        user: SessionUser,
        selectedTabs?: string[],
        separateTabPages?: boolean,
    ): Promise<string> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const { isPrivate } = await this.spaceModel.get(dashboard.spaceUuid);
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboard.spaceUuid,
        );

        // Create a new URLSearchParams object for query filters
        const selectedTabsParams = new URLSearchParams();
        const selectedTabsList =
            selectedTabs ??
            dashboard.tiles
                .map((tile) => tile.tabUuid)
                .filter((tabUuid) => !!tabUuid);

        if (selectedTabsList.length > 0)
            selectedTabsParams.set(
                'selectedTabs',
                JSON.stringify(selectedTabsList),
            );

        const { organizationUuid, projectUuid, name, minimalUrl, pageType } = {
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            name: dashboard.name,
            minimalUrl: new URL(
                `/minimal/projects/${
                    dashboard.projectUuid
                }/dashboards/${dashboardUuid}${queryFilters}${
                    selectedTabsParams.toString()
                        ? `${selectedTabsParams.toString()}`
                        : ''
                }`,
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

        this.logger.info(
            `Exporting dashboard ${name} with minimalUrl ${minimalUrl}${
                selectedTabs
                    ? ` and selected tabs: ${selectedTabs.join(', ')}`
                    : ''
            }${separateTabPages ? ' (separate tab pages)' : ''}`,
        );

        const unfurlImage = await this.unfurlImage({
            url: minimalUrl,
            lightdashPage: pageType,
            imageId: `slack-image_${snakeCaseName(name)}_${useNanoid()}`,
            authUserUuid: user.userUuid,
            gridWidth,
            context: ScreenshotContext.EXPORT_DASHBOARD,
            selectedTabs,
            withPdf: true,
        });
        if (unfurlImage.pdfFile) {
            return unfurlImage.pdfFile.source;
        }
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
        selectedTabs,
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
        selectedTabs?: string[];
    }): Promise<Buffer | undefined> {
        this.logger.info(
            `with tiles ${JSON.stringify(chartTileUuids)} and ${JSON.stringify(
                sqlChartTileUuids,
            )}`,
        );
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
                    const { browserEndpoint } =
                        this.lightdashConfig.headlessBrowser;

                    browser = await playwright.chromium.connectOverCDP(
                        browserEndpoint,
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
                        viewport:
                            chartType === ChartType.BIG_NUMBER
                                ? bigNumberViewport
                                : {
                                      ...viewport,
                                      width: gridWidth ?? viewport.width,
                                  },
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
                                this.logger.info(
                                    `Dashboard screenshot: Found ${
                                        chartTileUuids.length
                                    } chart tiles, with values: ${JSON.stringify(
                                        chartTileUuids,
                                    )}`,
                                );

                                const nonNullChartTileUuids =
                                    chartTileUuids.filter((id) => id !== null);
                                this.logger.info(
                                    `Dashboard screenshot: ${nonNullChartTileUuids.length} non-null chart tiles out of ${chartTileUuids.length} total tiles`,
                                );

                                const expectedPaginatedResponses =
                                    nonNullChartTileUuids.length;
                                this.logger.info(
                                    `Dashboard screenshot: Expecting ${expectedPaginatedResponses} paginated responses`,
                                );

                                exploreChartResultsPromise =
                                    this.waitForAllPaginatedResultsResponse(
                                        page,
                                        expectedPaginatedResponses,
                                        expectedPaginatedResponses *
                                            RESPONSE_TIMEOUT_MS,
                                    ); // NOTE: No await here
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

                            this.logger.info(
                                `Dashboard screenshot: SQL chart tiles - original count: ${
                                    sqlChartTileUuids?.length || 0
                                }, filtered count: ${
                                    filteredSqlChartTileUuids?.length || 0
                                }`,
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
                        } else if (
                            lightdashPage === LightdashPage.CHART ||
                            lightdashPage === LightdashPage.EXPLORE
                        ) {
                            chartResultsPromises = [
                                this.waitForPaginatedResultsResponse(page),
                            ]; // NOTE: No await here
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
                    const fullPageSize = await fullPage?.boundingBox();

                    if (
                        chartType !== ChartType.BIG_NUMBER &&
                        fullPageSize?.height
                    ) {
                        await page.setViewportSize({
                            width: gridWidth ?? viewport.width,
                            height: Math.round(fullPageSize.height),
                        });
                        // Viewport changes can trigger layout shifts - wait for things to settle
                        // before taking the shot 📸
                        await page.waitForTimeout(100);
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
                            selectedTabs,
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

    private async saveScreenshotPerTab({
        dashboardUuid,
        selectedTabs,
        cookie,
        baseUrl,
        authUserUuid,
        gridWidth,
        context,
        contextId,
        retries = 3,
    }: {
        dashboardUuid: string;
        selectedTabs: string[];
        cookie: string;
        baseUrl: string;
        authUserUuid: string;
        gridWidth?: number;
        context: ScreenshotContext;
        contextId?: unknown;
        retries?: number;
    }): Promise<{ buffers: Buffer[]; tabNames: string[] }> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const buffers: Buffer[] = [];
        const tabNames: string[] = [];

        // Get tab details for names
        const tabsMap = new Map(
            dashboard.tabs.map((tab) => [tab.uuid, tab.name]),
        );

        const tabPromises = selectedTabs.map(async (tabUuid) => {
            const tabName = tabsMap.get(tabUuid) || 'Untitled Tab';

            // Create URL for specific tab
            const tabUrl = `${baseUrl}&selectedTabs=${encodeURIComponent(
                JSON.stringify([tabUuid]),
            )}`;

            // Get tiles for this tab
            const tabTiles = dashboard.tiles.filter(
                (tile) => tile.tabUuid === tabUuid,
            );

            // Skip empty tabs
            if (tabTiles.length === 0) {
                this.logger.info(`Skipping empty tab: ${tabName}`);
                return null;
            }

            const chartTileUuids = tabTiles
                .filter(isDashboardChartTileType)
                .map((t) => t.properties.savedChartUuid);

            const sqlChartTileUuids = tabTiles
                .filter(isDashboardSqlChartTile)
                .map((t) => t.properties.savedSqlUuid);

            try {
                const buffer = await this.saveScreenshot({
                    imageId: `tab-${tabUuid}`,
                    cookie,
                    url: tabUrl,
                    lightdashPage: LightdashPage.DASHBOARD,
                    authUserUuid,
                    gridWidth,
                    chartTileUuids,
                    sqlChartTileUuids,
                    retries,
                    context,
                    contextId,
                    selectedTabs: [tabUuid],
                });

                return buffer ? { buffer, tabName } : null;
            } catch (error) {
                this.logger.error(
                    `Failed to capture screenshot for tab ${tabName}:`,
                    error,
                );
                return null;
            }
        });

        const results = await Promise.all(tabPromises);
        results.forEach((result) => {
            if (result) {
                buffers.push(result.buffer);
                tabNames.push(result.tabName);
            }
        });

        return { buffers, tabNames };
    }

    private extractSelectedTabsFromUrl(url: string): string[] | undefined {
        try {
            const urlObj = new URL(url);
            const selectedTabsParam = urlObj.searchParams.get('selectedTabs');
            if (selectedTabsParam) {
                return JSON.parse(selectedTabsParam) as string[];
            }
        } catch (error) {
            this.logger.warn(
                `Failed to extract selectedTabs from URL: ${error}`,
            );
        }
        return undefined;
    }

    private extractDashboardUuidFromUrl(url: string): string | undefined {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/');
            // Look for pattern: /minimal/projects/{projectUuid}/dashboards/{dashboardUuid}
            const dashboardIndex = pathParts.indexOf('dashboards');
            if (
                dashboardIndex !== -1 &&
                dashboardIndex + 1 < pathParts.length
            ) {
                return pathParts[dashboardIndex + 1];
            }
        } catch (error) {
            this.logger.warn(
                `Failed to extract dashboard UUID from URL: ${error}`,
            );
        }
        return undefined;
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

    async parseUrl(linkUrl: string): Promise<ParsedUrl> {
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
