import { subject } from '@casl/ability';
import {
    ApiGetAsyncQueryResults,
    assertUnreachable,
    AuthorizationError,
    ChartType,
    DashboardTileTypes,
    DownloadFileType,
    ForbiddenError,
    getErrorMessage,
    HealthState,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    LightdashMode,
    LightdashPage,
    LightdashRequestMethodHeader,
    NotFoundError,
    ParameterError,
    QueryHistoryStatus,
    RequestMethod,
    SCREENSHOT_SELECTORS,
    ScreenshotError,
    SessionStorageKeys,
    SessionUser,
    SlackInstallationNotFoundError,
    sleep,
    snakeCaseName,
    validateSelectedTabs,
    type DashboardFilterRule,
    type ParametersValuesMap,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    AllMiddlewareArgs,
    LinkSharedEvent,
    SlackEventMiddlewareArgs,
} from '@slack/bolt';
import { StringIndexed } from '@slack/bolt/dist/types/helpers';
import { WebClient } from '@slack/web-api';
import * as fsPromise from 'fs/promises';
import { uniq } from 'lodash';
import { nanoid as useNanoid } from 'nanoid';
import fetch from 'node-fetch';
import playwright, { type ElementHandle, type Page } from 'playwright';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import {
    getUnfurlBlocks,
    Unfurl,
} from '../../clients/Slack/SlackMessageBlocks';
import { LightdashConfig } from '../../config/parseConfig';
import { slackErrorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { ShareModel } from '../../models/ShareModel';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { SlackUnfurlImageModel } from '../../models/SlackUnfurlImageModel';
import { getAuthenticationToken } from '../../routers/headlessBrowser';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

const RESPONSE_TIMEOUT_MS = 180000;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidRegex = new RegExp(uuid, 'g');
const nanoid = '[\\w-]{21}';
const nanoidRegex = new RegExp(nanoid);
const createQueryEndpointRegex = /\/query/;
// Matches /query/{uuid} but NOT /query/{uuid}/results (SQL chart endpoint)
const paginatedQueryEndpointRegex = new RegExp(`/query/${uuid}(?!/results)`);

/**
 * Crop a PDF to a clip area using a PDF incremental update (PDF spec §7.5.6).
 * Appends a modified Page object with an updated MediaBox, leaving original
 * bytes untouched. This is the standard mechanism PDF editors use for
 * modifications without rewriting the entire file.
 */
function cropPdfToClipInternal(
    buffer: Buffer,
    clip: { x: number; y: number; width: number; height: number },
): Buffer {
    const PX_TO_PT = 72 / 96;
    const pdfStr = buffer.toString('binary');

    // Find startxref to get the previous xref offset
    const startxrefIdx = pdfStr.lastIndexOf('startxref');
    if (startxrefIdx === -1) return buffer;
    const newlineAfter = pdfStr.indexOf('\n', startxrefIdx + 10);
    const prevXrefOffset = parseInt(
        pdfStr.substring(startxrefIdx + 10, newlineAfter),
        10,
    );

    // Find the Page object ("/Type /Page" but not "/Type /Pages")
    let pageObjNum = -1;
    let pageObjContent = '';
    let searchPos = 0;
    while (searchPos < pdfStr.length) {
        const objIdx = pdfStr.indexOf(' 0 obj\n', searchPos);
        if (objIdx === -1) break;
        const lineStart = pdfStr.lastIndexOf('\n', objIdx - 1) + 1;
        const endObjIdx = pdfStr.indexOf('endobj', objIdx);
        if (endObjIdx === -1) {
            searchPos = objIdx + 7;
            // eslint-disable-next-line no-continue
            continue;
        }
        const content = pdfStr.substring(lineStart, endObjIdx + 6);
        const typeIdx = content.indexOf('/Type /Page');
        if (typeIdx !== -1) {
            const charAfter = content[typeIdx + 11];
            if (!charAfter || /[\n\r/>]/.test(charAfter)) {
                pageObjNum = parseInt(pdfStr.substring(lineStart, objIdx), 10);
                pageObjContent = content;
                break;
            }
        }
        searchPos = endObjIdx + 6;
    }
    if (pageObjNum === -1) return buffer;

    // Get page height from existing MediaBox
    const mediaBoxMatch = pageObjContent.match(
        /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/,
    );
    if (!mediaBoxMatch) return buffer;
    const pageHeightPt = parseFloat(mediaBoxMatch[4]);

    // New MediaBox (PDF coords: origin at bottom-left, Y up)
    const llx = clip.x * PX_TO_PT;
    const lly = pageHeightPt - (clip.y + clip.height) * PX_TO_PT;
    const urx = (clip.x + clip.width) * PX_TO_PT;
    const ury = pageHeightPt - clip.y * PX_TO_PT;
    const newMediaBox = `[${llx.toFixed(2)} ${lly.toFixed(2)} ${urx.toFixed(2)} ${ury.toFixed(2)}]`;

    // Replace MediaBox in Page object
    const bracketStart = pageObjContent.indexOf(
        '[',
        pageObjContent.indexOf('/MediaBox'),
    );
    const bracketEnd = pageObjContent.indexOf(']', bracketStart);
    if (bracketStart === -1 || bracketEnd === -1) return buffer;
    const newPageObj =
        pageObjContent.substring(0, bracketStart) +
        newMediaBox +
        pageObjContent.substring(bracketEnd + 1);

    // Parse trailer
    const trailerIdx = pdfStr.lastIndexOf('trailer');
    if (trailerIdx === -1) return buffer;
    const tStart = pdfStr.indexOf('<<', trailerIdx);
    const tEnd = pdfStr.indexOf('>>', tStart);
    if (tStart === -1 || tEnd === -1) return buffer;
    const tDict = pdfStr.substring(tStart + 2, tEnd);

    const sizeMatch = tDict.match(/\/Size\s+(\d+)/);
    const rootMatch = tDict.match(/\/Root\s+\d+\s+0\s+R/);
    const infoMatch = tDict.match(/\/Info\s+\d+\s+0\s+R/);
    if (!sizeMatch || !rootMatch) return buffer;

    // Build incremental update
    const newObjOffset = buffer.length + 1;
    let appendix = '\n';
    appendix += `${newPageObj}\n`;
    const newXrefOffset = buffer.length + appendix.length;
    appendix += `xref\n${pageObjNum} 1\n`;
    appendix += `${String(newObjOffset).padStart(10, '0')} 00000 n \n`;
    appendix += `trailer\n<</Size ${sizeMatch[1]} ${rootMatch[0]}`;
    if (infoMatch) appendix += ` ${infoMatch[0]}`;
    appendix += ` /Prev ${prevXrefOffset}>>\n`;
    appendix += `startxref\n${newXrefOffset}\n%%EOF\n`;

    return Buffer.from(pdfStr + appendix, 'binary');
}

function cropPdfToClip(
    buffer: Buffer,
    clip: { x: number; y: number; width: number; height: number },
): Buffer {
    try {
        return cropPdfToClipInternal(buffer, clip);
    } catch (e) {
        Logger.warn(
            `Failed to crop PDF, returning uncropped: ${e instanceof Error ? e.message : String(e)}`,
        );
        return buffer;
    }
}

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
    EXPORT_CHART = 'export_chart',
}

// Default values
// Can be overridden via:
// - HEADLESS_BROWSER_MAX_SCREENSHOT_RETRIES
// - HEADLESS_BROWSER_RETRY_BASE_DELAY_MS
const DEFAULT_SCREENSHOT_RETRIES = 5;
const DEFAULT_BACKOFF_BASE_DELAY_MS = 3000;

const getBackoffDelay = (retryCount: number, baseDelayMs: number): number => {
    const exponentialDelay = baseDelayMs * 2 ** retryCount;
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(exponentialDelay + jitter);
};

const isBrowserQueueFullError = (error: unknown): boolean => {
    const message = getErrorMessage(error);
    return (
        message.includes('429') ||
        message.includes('Too Many Requests') ||
        message.includes('queue is full')
    );
};

export type ParsedUrl = {
    isValid: boolean;
    lightdashPage?: LightdashPage;
    url: string;
    minimalUrl: string;
    dashboardUuid?: string;
    projectUuid?: string;
    chartUuid?: string;
    savedSqlUuid?: string;
    exploreModel?: string;
};

const notifySlackError = async (
    error: unknown,
    url: string,
    client: WebClient,
    event: LinkSharedEvent,
    { appProfilePhotoUrl }: { appProfilePhotoUrl?: string },
): Promise<void> => {
    /** Expected slack errors:
     * - cannot_parse_attachment: Means the image on the blocks is not accessible from slack, is the URL public ?
     */
    Logger.error(`Unable to unfurl slack URL ${url}: ${error} `);

    // Send message in thread
    await client.chat
        .postMessage({
            thread_ts: event.message_ts,
            channel: event.channel,
            ...(appProfilePhotoUrl ? { icon_url: appProfilePhotoUrl } : {}),
            text: `:fire: Unable to unfurl ${url}: ${error}`,
        })
        .catch((er: unknown) =>
            Logger.error(
                `Unable send slack error message: ${getErrorMessage(er)}`,
            ),
        );
};

type UnfurlServiceArguments = {
    lightdashConfig: LightdashConfig;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    shareModel: ShareModel;
    fileStorageClient: FileStorageClient;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    downloadFileModel: DownloadFileModel;
    slackUnfurlImageModel: SlackUnfurlImageModel;
    analytics: LightdashAnalytics;
    slackAuthenticationModel: SlackAuthenticationModel;
    spacePermissionService: SpacePermissionService;
};

export class UnfurlService extends BaseService {
    lightdashConfig: LightdashConfig;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    shareModel: ShareModel;

    fileStorageClient: FileStorageClient;

    slackClient: SlackClient;

    projectModel: ProjectModel;

    downloadFileModel: DownloadFileModel;

    slackUnfurlImageModel: SlackUnfurlImageModel;

    analytics: LightdashAnalytics;

    slackAuthenticationModel: SlackAuthenticationModel;

    spacePermissionService: SpacePermissionService;

    constructor({
        lightdashConfig,
        dashboardModel,
        savedChartModel,
        savedSqlModel,
        shareModel,
        fileStorageClient,
        projectModel,
        downloadFileModel,
        slackUnfurlImageModel,
        slackClient,
        analytics,
        slackAuthenticationModel,
        spacePermissionService,
    }: UnfurlServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.shareModel = shareModel;
        this.fileStorageClient = fileStorageClient;
        this.slackClient = slackClient;
        this.projectModel = projectModel;
        this.downloadFileModel = downloadFileModel;
        this.slackUnfurlImageModel = slackUnfurlImageModel;
        this.analytics = analytics;
        this.slackAuthenticationModel = slackAuthenticationModel;
        this.spacePermissionService = spacePermissionService;
    }

    async getPreviewSignedUrl(previewId: string): Promise<string> {
        const record = await this.slackUnfurlImageModel.get(previewId);

        const exists = await this.fileStorageClient.objectExists(record.s3_key);
        if (!exists) {
            this.logger.info(
                `Slack unfurl preview object missing from storage: ${previewId}`,
            );
            await this.slackUnfurlImageModel
                .delete(previewId)
                .catch((deleteError) => {
                    this.logger.warn(
                        `Failed to delete orphan slack_unfurl_images row ${previewId}: ${getErrorMessage(
                            deleteError,
                        )}`,
                    );
                });
            throw new NotFoundError('Slack unfurl image object missing');
        }

        return this.fileStorageClient.getFileUrl(record.s3_key, 300);
    }

    async getTitleAndDescription(
        parsedUrl: ParsedUrl,
        selectedTabs: string[] | null,
    ): Promise<
        Pick<
            Unfurl,
            'title' | 'description' | 'chartType' | 'organizationUuid'
        > & {
            resourceUuid?: string;
            chartTileUuids?: (string | null)[];
            sqlChartTileUuids?: (string | null)[];
            loomTileUuids?: (string | null)[];
        }
    > {
        switch (parsedUrl.lightdashPage) {
            case LightdashPage.DASHBOARD:
                if (!parsedUrl.dashboardUuid)
                    throw new ParameterError(
                        `Missing dashboardUuid when unfurling Dashboard URL ${parsedUrl.url}`,
                    );
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    parsedUrl.dashboardUuid,
                );

                validateSelectedTabs(selectedTabs, dashboard.tiles);

                // Filter tiles based on selected tabs if they exist
                const filteredTiles = selectedTabs
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
                    loomTileUuids: filteredTiles
                        .filter((t) => t.type === DashboardTileTypes.LOOM)
                        .map((t) => t.uuid),
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
            case LightdashPage.SQL_CHART:
                if (!parsedUrl.savedSqlUuid)
                    throw new ParameterError(
                        `Missing savedSqlUuid when unfurling SQL Runner URL ${parsedUrl.url}`,
                    );
                const sqlChart = await this.savedSqlModel.getByUuid(
                    parsedUrl.savedSqlUuid,
                );
                return {
                    title: sqlChart.name,
                    description: sqlChart.description ?? undefined,
                    organizationUuid: sqlChart.organization.organizationUuid,
                    resourceUuid: sqlChart.savedSqlUuid,
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
        selectedTabs: string[] | null,
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
            loomTileUuids: rest.loomTileUuids,
        };
    }

    private async uploadPdf(
        id: string,
        pdfBuffer: Buffer,
        title?: string,
    ): Promise<{ source: string; fileName: string }> {
        let source: string;
        let fileName: string;
        if (this.fileStorageClient.isEnabled()) {
            const uploadPdfReturn = await this.fileStorageClient.uploadPdf(
                pdfBuffer,
                id,
            );
            source = uploadPdfReturn.url;
            fileName = uploadPdfReturn.fileName ?? `${title ?? 'report'}.pdf`;
        } else {
            fileName = `${id}.pdf`;
            source = `/tmp/${fileName}`;
            await fsPromise.writeFile(source, pdfBuffer);
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
        outputFormat = 'image',
        selector = undefined,
        context,
        contextId,
        selectedTabs,
        sendNowSchedulerFilters,
        sendNowSchedulerParameters,
    }: {
        url: string;
        lightdashPage?: LightdashPage;
        imageId: string;
        authUserUuid: string;
        gridWidth?: number | undefined;
        withPdf?: boolean;
        outputFormat?: 'image' | 'pdf';
        selector?: string;
        context: ScreenshotContext;
        contextId?: unknown;
        selectedTabs: string[] | null;
        sendNowSchedulerFilters?: DashboardFilterRule[] | undefined;
        sendNowSchedulerParameters?: ParametersValuesMap | undefined;
    }): Promise<{
        imageUrl?: string;
        pdfFile?: { source: string; fileName: string };
    }> {
        const cookie = await this.getUserCookie(authUserUuid);
        const details = await this.unfurlDetails(url, selectedTabs);

        const screenshotParams = {
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
            loomTileUuids: details?.loomTileUuids,
            context,
            contextId,
            selectedTabs,
            sendNowSchedulerFilters,
            sendNowSchedulerParameters,
        };

        const result = await this.saveScreenshot({
            ...screenshotParams,
            outputFormat,
            withPdf: outputFormat === 'pdf' ? false : withPdf,
        });

        if (result === undefined) {
            return {};
        }

        const { imageBuffer, pdfBuffer } = result;

        let imageUrl;
        if (imageBuffer) {
            if (this.fileStorageClient.isEnabled()) {
                imageUrl = await this.fileStorageClient.uploadImage(
                    imageBuffer,
                    imageId,
                );

                if (details?.organizationUuid) {
                    const previewId = useNanoid();
                    await this.slackUnfurlImageModel.create({
                        nanoid: previewId,
                        s3Key: `${imageId}.png`,
                        organizationUuid: details.organizationUuid,
                    });
                    imageUrl = new URL(
                        `/api/v1/slack/preview/${previewId}`,
                        this.lightdashConfig.siteUrl,
                    ).href;
                }
            } else {
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

        let pdfFile;
        if (pdfBuffer) {
            pdfFile = await this.uploadPdf(imageId, pdfBuffer, details?.title);
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
        selectedTabs: string[] | null,
    ): Promise<string> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboard.spaceUuid,
            );

        validateSelectedTabs(selectedTabs, dashboard.tiles);

        // Create a new URLSearchParams object for query filters
        const selectedTabsParams = new URLSearchParams();
        const selectedTabsList =
            selectedTabs ??
            uniq(
                dashboard.tiles
                    .map((tile) => tile.tabUuid)
                    .filter((tabUuid) => !!tabUuid),
            );

        if (selectedTabsList.length > 0)
            selectedTabsParams.set(
                'selectedTabs',
                JSON.stringify(selectedTabsList),
            );

        const urlBase = `/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}`;

        // Normalize the query filters
        const suffix =
            queryFilters &&
            !(queryFilters.startsWith('?') || queryFilters.startsWith('&'))
                ? `?${queryFilters}`
                : (queryFilters ?? '');

        const url = new URL(
            urlBase + suffix,
            this.lightdashConfig.headlessBrowser.internalLightdashHost,
        );

        for (const [k, v] of selectedTabsParams.entries()) {
            url.searchParams.set(k, v);
        }

        const { organizationUuid, projectUuid, name, minimalUrl, pageType } = {
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            name: dashboard.name,
            minimalUrl: url.href,
            pageType: LightdashPage.DASHBOARD,
        };

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: name,
                    },
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
            }`,
        );

        const unfurlImage = await this.unfurlImage({
            url: minimalUrl,
            lightdashPage: pageType,
            imageId: `slack-image_${snakeCaseName(name)}_${useNanoid()}`,
            authUserUuid: user.userUuid,
            gridWidth,
            context: ScreenshotContext.EXPORT_DASHBOARD,
            selectedTabs,
        });
        if (unfurlImage.imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
        this.logger.info(`Dashboard "${name}" exported successfully`);
        return unfurlImage.imageUrl;
    }

    async exportChart(
        chartUuidOrSlug: string,
        user: SessionUser,
    ): Promise<string> {
        const chart = await this.savedChartModel.get(chartUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                chart.spaceUuid,
            );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: chart.organizationUuid,
                    projectUuid: chart.projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        savedChartUuid: chart.uuid,
                        savedChartName: chart.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const minimalUrl = new URL(
            `/minimal/projects/${chart.projectUuid}/saved/${chart.uuid}`,
            this.lightdashConfig.headlessBrowser.internalLightdashHost,
        ).href;

        this.logger.info(
            `Exporting chart "${chart.name}" with minimalUrl ${minimalUrl}`,
        );

        const unfurlImage = await this.unfurlImage({
            url: minimalUrl,
            lightdashPage: LightdashPage.CHART,
            imageId: `chart-image_${snakeCaseName(chart.name)}_${useNanoid()}`,
            authUserUuid: user.userUuid,
            context: ScreenshotContext.EXPORT_CHART,
            selectedTabs: null,
        });
        if (unfurlImage.imageUrl === undefined) {
            throw new Error('Unable to export chart image');
        }
        this.logger.info(`Chart "${chart.name}" exported successfully`);
        return unfurlImage.imageUrl;
    }

    /**
     * Reads the always-mounted #lightdash-screenshot-progress element and
     * logs which tile UUIDs are still unaccounted for, so that on
     * #lightdash-ready-indicator timeouts we can identify the specific
     * tile(s) blocking the screenshot.
     *
     * Best-effort: never throws. If the element is absent the page either
     * never mounted the React tree (e.g. JS module-init crash) or pre-dates
     * the progress indicator deploy, both of which are logged distinctly.
     */
    private async logUnreadyTilesOnTimeout(
        page: Page,
        url: string,
        unfurlId: string,
    ): Promise<void> {
        try {
            // Inline JSON parsing instead of a named inner helper — esbuild's
            // keep-names option (used by tsx in dev) wraps named consts with
            // __name(...), which fails in the browser context where __name
            // is undefined. Inline arrow function args don't get this wrapping.
            const progress = await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (!el) return null;
                const expected: string[] = [];
                const ready: string[] = [];
                const errored: string[] = [];
                try {
                    const v = el.getAttribute('data-tiles-expected');
                    if (v) expected.push(...(JSON.parse(v) as string[]));
                } catch {
                    /* ignore malformed attribute */
                }
                try {
                    const v = el.getAttribute('data-tiles-ready');
                    if (v) ready.push(...(JSON.parse(v) as string[]));
                } catch {
                    /* ignore malformed attribute */
                }
                try {
                    const v = el.getAttribute('data-tiles-errored');
                    if (v) errored.push(...(JSON.parse(v) as string[]));
                } catch {
                    /* ignore malformed attribute */
                }
                return { expected, ready, errored };
            }, SCREENSHOT_SELECTORS.PROGRESS_INDICATOR);

            if (!progress) {
                this.logger.error(
                    `Screenshot ready timeout: progress indicator not in DOM. The frontend likely never mounted (JS module-init failure or pre-deploy build) - unfurlId: ${unfurlId}, url: ${url}`,
                );
                return;
            }

            const accounted = new Set([...progress.ready, ...progress.errored]);
            const unready = progress.expected.filter(
                (tileUuid) => !accounted.has(tileUuid),
            );

            this.logger.error(
                `Screenshot ready timeout: ${unready.length}/${progress.expected.length} tiles never reported ready or errored - unfurlId: ${unfurlId}, url: ${url}, unreadyTileUuids: ${JSON.stringify(unready)}, expectedTileUuids: ${JSON.stringify(progress.expected)}, readyTileUuids: ${JSON.stringify(progress.ready)}, erroredTileUuids: ${JSON.stringify(progress.errored)}`,
            );
        } catch (probeError) {
            this.logger.warn(
                `Failed to probe screenshot progress indicator on timeout - unfurlId: ${unfurlId}, url: ${url}, error: ${getErrorMessage(
                    probeError,
                )}`,
            );
        }
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
        loomTileUuids = undefined,
        retries = this.lightdashConfig.headlessBrowser.maxScreenshotRetries ??
            DEFAULT_SCREENSHOT_RETRIES,
        context,
        contextId,
        selectedTabs,
        sendNowSchedulerFilters,
        sendNowSchedulerParameters,
        outputFormat = 'image',
        withPdf = false,
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
        loomTileUuids?: (string | null)[] | undefined;
        retries?: number;
        context: ScreenshotContext;
        contextId?: unknown;
        selectedTabs: string[] | null;
        sendNowSchedulerFilters?: DashboardFilterRule[] | undefined;
        sendNowSchedulerParameters?: ParametersValuesMap | undefined;
        outputFormat?: 'image' | 'pdf';
        withPdf?: boolean;
    }): Promise<{ imageBuffer?: Buffer; pdfBuffer?: Buffer } | undefined> {
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
                        // Allow self-signed / untrusted certs when the
                        // internal Lightdash host is reached through an
                        // HTTPS ingress whose cert isn't in the browserless
                        // trust store. Opt-in via env var because it
                        // disables TLS validation for the entire context.
                        ignoreHTTPSErrors:
                            this.lightdashConfig.headlessBrowser
                                .internalLightdashHostIgnoreHttpsErrors,
                    });

                    // Polyfill crypto.randomUUID (needed for Loom iframes)
                    await page.addInitScript(() => {
                        if (
                            typeof crypto !== 'undefined' &&
                            !crypto.randomUUID
                        ) {
                            /* eslint-disable no-bitwise */
                            crypto.randomUUID =
                                (): `${string}-${string}-${string}-${string}-${string}` =>
                                    '10000000-1000-4000-8000-100000000000'.replace(
                                        /[018]/g,
                                        (c: string) =>
                                            (
                                                Number(c) ^
                                                (crypto.getRandomValues(
                                                    new Uint8Array(1),
                                                )[0] &
                                                    (15 >> (Number(c) / 4)))
                                            ).toString(16),
                                    ) as `${string}-${string}-${string}-${string}-${string}`;
                            /* eslint-enable no-bitwise */
                        }
                    });

                    // Add sendNowSchedulerFilters and sendNowSchedulerParameters to the page session storage
                    await page.addInitScript(
                        (storage) => {
                            for (const [key, value] of Object.entries(
                                storage,
                            )) {
                                if (value) {
                                    window.sessionStorage.setItem(
                                        key,
                                        JSON.stringify(value),
                                    );
                                }
                            }
                        },
                        {
                            [SessionStorageKeys.SEND_NOW_SCHEDULER_FILTERS]:
                                sendNowSchedulerFilters,
                            [SessionStorageKeys.SEND_NOW_SCHEDULER_PARAMETERS]:
                                sendNowSchedulerParameters,
                        },
                    );

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
                            const location = msg.location();
                            const text = msg.text();
                            // Match across both the message text and the
                            // resource URL: Chrome puts the URL in
                            // location.url for resource-fetch failures
                            // ("Failed to load resource: net::ERR_FAILED")
                            // and in text for CORS rejections
                            // ("Access to font at '...' has been blocked").
                            const surface = `${location.url} ${text}`;
                            // Suppress known-benign noise (Google Fonts
                            // CORS/fetch failures, CSP report-only
                            // directives) so real JS errors dominate the
                            // error stream.
                            const isBenign =
                                /upgrade-insecure-requests.*report-only/i.test(
                                    surface,
                                ) ||
                                /Cross-Origin-Opener-Policy.*ignored/i.test(
                                    surface,
                                ) ||
                                /fonts\.gstatic\.com/i.test(surface);

                            if (isBenign) {
                                this.logger.debug(
                                    `Headless browser console error (benign) - file: ${location.url}, text: ${text}`,
                                );
                            } else {
                                this.logger.error(
                                    `Headless browser console error - unfurlId: ${imageId}, pageUrl: ${url}, file: ${location.url}:${location.lineNumber}:${location.columnNumber}, text: ${text}`,
                                );
                            }
                        }
                    });

                    // Log all query results errors
                    page.on('response', async (response) => {
                        const responseUrl = response.url();

                        // Skip /query/{uuid}/results - uses chunked encoding, handled separately
                        const isSqlResultsEndpoint =
                            /\/query\/[0-9a-f-]+\/results/.test(responseUrl);
                        if (isSqlResultsEndpoint) {
                            return; // Skip logging for SQL chart results (chunked response)
                        }

                        const resultsEndpointRegexes = [
                            createQueryEndpointRegex, // create query
                            paginatedQueryEndpointRegex, // get paginated results
                        ];
                        const isResultsEndpointMatch =
                            resultsEndpointRegexes.some((regex) =>
                                regex.test(responseUrl),
                            );

                        const isHealthEndpointMatch =
                            responseUrl.includes('api/v1/health');

                        if (isHealthEndpointMatch) {
                            response.body().then(
                                (buffer) => {
                                    const status = response.status();
                                    if (status >= 400) {
                                        this.logger.error(
                                            `Headless browser response error - url: ${responseUrl}, code: ${response.status()}, text: ${buffer}`,
                                        );
                                    } else {
                                        try {
                                            const json = JSON.parse(
                                                buffer.toString(),
                                            ) as {
                                                status: 'ok';
                                                results: HealthState;
                                            };
                                            if (
                                                json.results.isAuthenticated ===
                                                false
                                            ) {
                                                this.logger.error(
                                                    `Headless browser health check failed: user is not authenticated - url: ${responseUrl}`,
                                                );
                                            }
                                        } catch (parseError) {
                                            this.logger.warn(
                                                `Failed to parse health response - url: ${responseUrl}, error: ${getErrorMessage(
                                                    parseError,
                                                )}`,
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
                                        try {
                                            const json = JSON.parse(
                                                buffer.toString(),
                                            ) as Partial<{
                                                status: 'ok';
                                                results: ApiGetAsyncQueryResults;
                                            }>;
                                            if (
                                                json.results?.status ===
                                                QueryHistoryStatus.ERROR
                                            ) {
                                                this.logger.error(
                                                    `Headless browser response error while fetching paginated results - url: ${responseUrl}, text: ${json.results.error}`,
                                                );
                                            }
                                        } catch (parseError) {
                                            this.logger.warn(
                                                `Failed to parse paginated query response - url: ${responseUrl}, error: ${getErrorMessage(
                                                    parseError,
                                                )}`,
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

                            // Create separate arrays for each type of SQL response
                            let sqlInitialLoadPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;
                            let sqlResultsJobPromises:
                                | (Promise<playwright.Response> | undefined)[]
                                | undefined;
                            let sqlResultsPromises:
                                | (Promise<void> | undefined)[]
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

                            let loomTileResultsPromises:
                                | (Promise<ElementHandle | null> | undefined)[]
                                | undefined;

                            if (loomTileUuids && loomTileUuids.length > 0) {
                                this.logger.info(
                                    `Dashboard screenshot: Waiting for ${loomTileUuids.length} Loom tile(s) to load`,
                                );
                                loomTileResultsPromises = loomTileUuids.map(
                                    (id) =>
                                        page?.waitForSelector(
                                            `#loom-loaded-${id}`,
                                            {
                                                state: 'attached',
                                                timeout: RESPONSE_TIMEOUT_MS,
                                            },
                                        ),
                                );
                            }

                            chartResultsPromises = [
                                exploreChartResultsPromise,
                                ...(loomTileResultsPromises || []),
                                ...(sqlInitialLoadPromises || []),
                                ...(sqlResultsJobPromises || []),
                                ...(sqlResultsPromises || []),
                                ...(sqlPivotPromises || []),
                            ];
                        }

                        await page.goto(url, {
                            timeout: 150000,
                        });

                        const blockingElementChecks = [
                            {
                                selector: SCREENSHOT_SELECTORS.ERROR_BOUNDARY,
                                getError: async (
                                    el: playwright.ElementHandle,
                                ) => {
                                    const errorMessage =
                                        await el.getAttribute(
                                            'data-error-message',
                                        );
                                    const sentryEventId = await el.getAttribute(
                                        'data-sentry-event-id',
                                    );
                                    const details = `message: ${errorMessage}, sentryEventId: ${sentryEventId}, url: ${url}`;
                                    return {
                                        logMessage: `Error boundary detected on page - ${details}`,
                                        message: `Frontend error boundary detected: ${
                                            errorMessage || 'Unknown error'
                                        }`,
                                        originalError: `ErrorBoundary rendered - ${details}`,
                                    };
                                },
                            },
                            {
                                selector: SCREENSHOT_SELECTORS.LOGIN_PAGE,
                                getError: async () => ({
                                    logMessage: `Login page detected - authentication failed for screenshot request, url: ${url}`,
                                    message:
                                        'Authentication failed: redirected to login page instead of requested content',
                                    originalError:
                                        'PrivateRoute redirected to login page - session may be invalid or expired',
                                }),
                            },
                        ];

                        const blockingResults = await Promise.all(
                            blockingElementChecks.map(async (check) => ({
                                check,
                                element: await page!
                                    .locator(check.selector)
                                    .first()
                                    .elementHandle({ timeout: 1000 })
                                    .catch(() => null),
                            })),
                        );

                        const blocking = blockingResults.find(
                            (r) => r.element !== null,
                        );
                        if (blocking && blocking.element) {
                            const errorInfo = await blocking.check.getError(
                                blocking.element,
                            );
                            this.logger.error(errorInfo.logMessage);
                            throw new ScreenshotError(errorInfo.message, {
                                url,
                                lightdashPage,
                                context,
                                originalError: errorInfo.originalError,
                            });
                        }

                        if (chartResultsPromises) {
                            await Promise.allSettled(chartResultsPromises);
                        }
                    } catch (e) {
                        // Re-throw ScreenshotError (e.g., from error boundary detection)
                        if (e instanceof ScreenshotError) {
                            throw e;
                        }
                        this.logger.warn(
                            `Got a timeout when waiting for the page to load, returning current content`,
                        );
                    }

                    this.logger.info(
                        `Waiting for screenshot ready indicator - unfurlId: ${imageId}`,
                    );
                    try {
                        await page.waitForSelector(
                            SCREENSHOT_SELECTORS.READY_INDICATOR,
                            {
                                state: 'attached',
                                timeout: RESPONSE_TIMEOUT_MS,
                            },
                        );
                        this.logger.info(
                            `Screenshot ready indicator found - page is ready - unfurlId: ${imageId}`,
                        );
                    } catch (waitError) {
                        // Probe the always-mounted progress indicator to find
                        // out which tiles never reported ready/errored. Logged
                        // before re-throwing so callers (and retries) can see
                        // exactly which tile is blocking the indicator.
                        await this.logUnreadyTilesOnTimeout(page, url, imageId);
                        throw waitError;
                    }

                    // Auto-detect CJK language from page content and set
                    // <html lang="..."> so CSS :lang() rules select the
                    // correct Noto Sans CJK font variant for screenshots.
                    const detectedLang = await page.evaluate(() => {
                        const text = document.body.innerText;
                        if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text))
                            return 'ja';
                        if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text))
                            return 'ko';
                        if (/[\u4E00-\u9FFF]/.test(text)) {
                            // Distinguish Simplified vs Traditional Chinese
                            // by checking for script-specific character variants
                            const simplified = (
                                text.match(
                                    /[\u4EEC\u56FD\u5B66\u5BF9\u8FD9\u8BA9\u8BF4\u4E1C\u7ECF\u5F00]/g,
                                ) ?? []
                            ).length;
                            const traditional = (
                                text.match(
                                    /[\u5011\u570B\u5B78\u5C0D\u9019\u8B93\u8AAA\u6771\u7D93\u958B]/g,
                                ) ?? []
                            ).length;
                            return traditional > simplified ? 'zh-TW' : 'zh-CN';
                        }
                        return null;
                    });
                    if (detectedLang) {
                        await page.evaluate(
                            (lang) =>
                                document.documentElement.setAttribute(
                                    'lang',
                                    lang,
                                ),
                            detectedLang,
                        );
                        this.logger.info(
                            `Auto-detected CJK language: ${detectedLang}`,
                        );
                    }

                    const path = `/tmp/${imageId}.png`;

                    let finalSelector = selector;

                    if (lightdashPage === LightdashPage.EXPLORE) {
                        finalSelector = `[data-testid="visualization"]`;
                    } else if (lightdashPage === LightdashPage.DASHBOARD) {
                        finalSelector = SCREENSHOT_SELECTORS.DASHBOARD_GRID;
                    }

                    const fullPage = await page.locator(finalSelector);
                    const fullPageSize = await fullPage?.boundingBox({
                        timeout: RESPONSE_TIMEOUT_MS,
                    });

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

                    // Helper: generate PDF from the current page state
                    const generatePdf = async () => {
                        const pdfWidth = gridWidth ?? viewport.width;
                        // Measure the actual content area: use the element's
                        // bounding box bottom (accounts for position on page)
                        // but also check children in case the container has
                        // extra CSS height beyond its content
                        const contentBottom = await page!.evaluate(
                            (sel: string) => {
                                const container = document.querySelector(sel);
                                if (!container) return 800;
                                let maxBottom = 0;
                                for (const child of Array.from(
                                    container.children,
                                )) {
                                    const rect = child.getBoundingClientRect();
                                    if (
                                        rect.height > 0 &&
                                        rect.bottom > maxBottom
                                    )
                                        maxBottom = rect.bottom;
                                }
                                // Fall back to container's own bottom if no
                                // children found
                                if (maxBottom === 0) {
                                    maxBottom =
                                        container.getBoundingClientRect()
                                            .bottom;
                                }
                                return Math.ceil(maxBottom);
                            },
                            finalSelector,
                        );
                        const clip = {
                            x: 0,
                            y: 0,
                            width: pdfWidth,
                            height: contentBottom,
                        };
                        const pdfBytes = await page!.pdf({
                            width: `${clip.width}px`,
                            height: `${clip.height}px`,
                            printBackground: true,
                            pageRanges: '1',
                            margin: {
                                top: 0,
                                right: 0,
                                bottom: 0,
                                left: 0,
                            },
                        });
                        return cropPdfToClip(Buffer.from(pdfBytes), clip);
                    };

                    // PDF-only output
                    // Take a screenshot first to force the browser to fully
                    // paint all canvas elements (e.g. ECharts).  page.pdf()
                    // alone unreliably captures canvas content.  This matches
                    // the IMAGE+withPdf path where screenshot precedes PDF.
                    if (outputFormat === 'pdf') {
                        if (
                            lightdashPage === LightdashPage.DASHBOARD ||
                            lightdashPage === LightdashPage.EXPLORE
                        ) {
                            await page.locator(finalSelector).screenshot({
                                animations: 'disabled',
                                timeout: RESPONSE_TIMEOUT_MS,
                            });
                        } else {
                            await page.screenshot({
                                fullPage: true,
                                animations: 'disabled',
                            });
                        }
                        const pdfBuffer = await generatePdf();
                        return { pdfBuffer };
                    }

                    // Take screenshot
                    let imageBuffer: Buffer;
                    if (
                        lightdashPage === LightdashPage.DASHBOARD ||
                        lightdashPage === LightdashPage.EXPLORE
                    ) {
                        imageBuffer = await page
                            .locator(finalSelector)
                            .screenshot({
                                path,
                                animations: 'disabled',
                                timeout: RESPONSE_TIMEOUT_MS,
                            });
                    } else {
                        // Full page screenshot for charts
                        imageBuffer = await page.screenshot({
                            path,
                            fullPage: true,
                            animations: 'disabled',
                        });
                    }

                    // Also generate PDF in the same browser session
                    const pdfBuffer = withPdf ? await generatePdf() : undefined;

                    return { imageBuffer, pdfBuffer };
                } catch (e) {
                    const errorMessage = getErrorMessage(e);
                    const isQueueFullError = isBrowserQueueFullError(e);
                    const isRetryableError =
                        e instanceof playwright.errors.TimeoutError ||
                        // Following error messages were taken from the Playwright source code
                        errorMessage.includes('Protocol error') ||
                        errorMessage.includes('ECONNREFUSED') ||
                        errorMessage.includes('Target crashed') ||
                        errorMessage.includes(
                            'Target page, context or browser has been closed',
                        ) ||
                        errorMessage.includes('not attached to the DOM') ||
                        isQueueFullError;

                    if (isRetryableError && retries) {
                        const maxRetries =
                            this.lightdashConfig.headlessBrowser
                                .maxScreenshotRetries ??
                            DEFAULT_SCREENSHOT_RETRIES;
                        const baseDelayMs =
                            this.lightdashConfig.headlessBrowser
                                .retryBaseDelayMs ??
                            DEFAULT_BACKOFF_BASE_DELAY_MS;

                        const retryCount = maxRetries - retries - 1;
                        const delay = getBackoffDelay(retryCount, baseDelayMs);

                        this.logger.info(
                            `Retrying screenshot (attempt ${retryCount + 2}/${
                                maxRetries + 1
                            }) after ${delay}ms for url ${url}, type: ${lightdashPage}, unfurlId: ${imageId}. Error: ${getErrorMessage(
                                e,
                            )}`,
                        );

                        span.setAttributes({
                            is_retrying: true,
                        });

                        // Clean up resources and wait before retry
                        if (page) await page.close().catch(() => {});
                        if (browser) await browser.close().catch(() => {});
                        await sleep(delay);

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
                            loomTileUuids,
                            retries,
                            context,
                            contextId,
                            selectedTabs,
                            sendNowSchedulerFilters,
                            sendNowSchedulerParameters,
                            outputFormat,
                            withPdf,
                        });
                    }

                    hasError = true;

                    this.logger.error(
                        `Unable to fetch screenshots for scheduler with url ${url}, of type: ${lightdashPage}, unfurlId: ${imageId}. Message: ${getErrorMessage(
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

                    // All of these errors are related to connection issues and usually
                    // arise because the headless browser either crashed while handling the request
                    // or crash before and can't be reached. We are grouping them togther here
                    // for a user-friendly error message, but we keep the original error message in the logs.
                    const isConnectionError =
                        errorMessage.includes('ECONNREFUSED') ||
                        errorMessage.includes('ENOTFOUND') ||
                        errorMessage.includes('ECONNRESET');

                    throw new ScreenshotError(
                        `Screenshot ${errorType}: ${
                            isConnectionError
                                ? 'There was a connection error while capturing the screenshot. This often indicates a heavy load on the screenshot service and the delivery cannot be completed at this time.'
                                : errorMessage
                        }`,
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
                        `UnfurlService saveScreenshot took ${executionTime} ms - unfurlId: ${imageId}`,
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

    async parseUrl(linkUrl: string): Promise<ParsedUrl> {
        const shareUrl = new RegExp(`/share/${nanoid}`);
        const url = linkUrl.match(shareUrl)
            ? await this.getSharedUrl(linkUrl)
            : linkUrl;

        const dashboardUrl = new RegExp(`/projects/${uuid}/dashboards/${uuid}`);
        const chartUrl = new RegExp(`/projects/${uuid}/saved/${uuid}`);
        const exploreUrl = new RegExp(`/projects/${uuid}/tables/`);
        const sqlChartUrl = new RegExp(
            `/projects/(${uuid})/sql-runner/([^/?#]+)`,
        );

        if (url.match(dashboardUrl) !== null) {
            const [projectUuid, dashboardUuid] = url.match(uuidRegex) || [];

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
            const [projectUuid, chartUuid] = url.match(uuidRegex) || [];
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
            const [projectUuid] = url.match(uuidRegex) || [];

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
        const sqlChartMatch = url.match(sqlChartUrl);
        if (sqlChartMatch !== null) {
            const [, projectUuid, slug] = sqlChartMatch;
            try {
                const sqlChart = await this.savedSqlModel.getBySlug(
                    projectUuid,
                    slug,
                );
                return {
                    isValid: true,
                    lightdashPage: LightdashPage.SQL_CHART,
                    url,
                    minimalUrl: new URL(
                        `/minimal/projects/${projectUuid}/sql-runner/${sqlChart.savedSqlUuid}`,
                        this.lightdashConfig.headlessBrowser
                            .internalLightdashHost,
                    ).href,
                    projectUuid,
                    savedSqlUuid: sqlChart.savedSqlUuid,
                };
            } catch (e) {
                this.logger.debug(
                    `SQL chart slug ${slug} did not resolve in project ${projectUuid}: ${getErrorMessage(
                        e,
                    )}`,
                );
                // fall through to isValid: false
            }
        }

        this.logger.debug(`URL to unfurl ${url} is not valid`);
        return {
            isValid: false,
            url,
            minimalUrl: url,
        };
    }

    private async getUserCookie(userUuid: string): Promise<string> {
        this.logger.debug(`Getting cookie for user ${userUuid}`);
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
            const loginBody = (await response.json()) as Partial<{
                status: string;
                results: SessionUser;
            }>;
            throw new AuthorizationError(
                `Cannot sign in user before taking screenshot:\n${
                    loginBody.results?.userUuid ?? ''
                }`,
            );
        }
        this.logger.debug(`Successfully got cookie for user ${userUuid}`);
        return header;
    }

    private async sendUnfurl(
        event: LinkSharedEvent,
        originalUrl: string,
        unfurl: Unfurl,
        client: WebClient,
    ) {
        const unfurlBlocks = getUnfurlBlocks(originalUrl, unfurl);
        await client.chat
            .unfurl({
                ts: event.message_ts,
                channel: event.channel,
                unfurls: unfurlBlocks,
            })
            .catch((e: unknown) => {
                this.analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: event.user,
                    properties: {
                        error: `${getErrorMessage(e)}`,
                    },
                });
                Logger.error(
                    `Unable to unfurl on slack ${JSON.stringify(
                        unfurlBlocks,
                    )}: ${JSON.stringify(e)}`,
                );
            });
    }

    public async unfurlSlackUrls(
        message: SlackEventMiddlewareArgs<'link_shared'> &
            AllMiddlewareArgs<StringIndexed>,
    ) {
        const { event, client, context } = message;
        let appProfilePhotoUrl: string | undefined;

        if (event.channel === 'COMPOSER') return; // Do not unfurl urls when typing, only when message is sent

        Logger.debug(`Got link_shared slack event ${event.message_ts}`);

        const { teamId } = context;
        if (!teamId) {
            Logger.warn(
                `Slack unfurl skipped: no teamId on link_shared event ${event.message_ts}`,
            );
            return;
        }

        const unfurlsEnabled =
            await this.slackAuthenticationModel.getUnfurlsEnabled(teamId);
        if (!unfurlsEnabled) {
            Logger.info(
                `Slack unfurl skipped for team ${teamId}: link unfurls disabled in integration settings`,
            );
            return;
        }

        void event.links.map(async (l) => {
            const eventUserId = context.botUserId;

            try {
                const details = await this.unfurlDetails(l.url, null);

                if (details) {
                    this.analytics.track({
                        event: 'share_slack.unfurl',
                        userId: eventUserId,
                        properties: {
                            organizationId: details?.organizationUuid,
                        },
                    });

                    Logger.debug(
                        `Unfurling ${details.pageType} with URL ${details.minimalUrl}`,
                    );

                    await this.sendUnfurl(event, l.url, details, client);

                    // Skip image generation if link preview images are disabled
                    if (
                        !this.lightdashConfig.slack
                            ?.linkShareImagePreviewEnabled
                    ) {
                        return;
                    }

                    const imageId = `slack-image-${useNanoid()}`;
                    const authUserUuid =
                        await this.slackAuthenticationModel.getUserUuid(teamId);

                    const installation =
                        await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                            details?.organizationUuid,
                        );

                    if (!installation) {
                        throw new SlackInstallationNotFoundError();
                    }

                    appProfilePhotoUrl = installation.appProfilePhotoUrl;

                    const { imageUrl } = await this.unfurlImage({
                        url: details.minimalUrl,
                        lightdashPage: details.pageType,
                        imageId,
                        authUserUuid,
                        context: ScreenshotContext.SLACK,
                        selectedTabs: null,
                    });

                    if (imageUrl) {
                        await this.sendUnfurl(
                            event,
                            l.url,
                            { ...details, imageUrl },
                            client,
                        );

                        this.analytics.track({
                            event: 'share_slack.unfurl_completed',
                            userId: eventUserId,
                            properties: {
                                pageType: details.pageType,
                                organizationId: details?.organizationUuid,
                            },
                        });
                    }
                }
            } catch (e) {
                if (this.lightdashConfig.mode === LightdashMode.PR) {
                    void notifySlackError(e, l.url, client, event, {
                        appProfilePhotoUrl,
                    });
                }
                if (!(e instanceof ScreenshotError)) {
                    slackErrorHandler(e, 'Unable to unfurl slack URL');
                }

                this.analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: eventUserId,

                    properties: {
                        error: `${e}`,
                    },
                });
            }
        });
    }
}
