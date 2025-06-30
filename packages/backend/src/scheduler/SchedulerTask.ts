import {
    AnyType,
    CompileProjectPayload,
    CreateProject,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    CreateSchedulerTarget,
    DownloadCsvPayload,
    DownloadFileType,
    EmailNotificationPayload,
    ExportCsvDashboardPayload,
    FeatureFlags,
    FieldReferenceError,
    ForbiddenError,
    GsheetsNotificationPayload,
    LightdashPage,
    MAX_SAFE_INTEGER,
    MissingConfigError,
    type MsTeamsNotificationPayload,
    NotEnoughResults,
    NotificationFrequency,
    NotificationPayloadBase,
    QueryExecutionContext,
    ReadFileError,
    RenameResourcesPayload,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    ReplaceableCustomFields,
    type RunQueryTags,
    SCHEDULER_TASKS,
    SavedChartDAO,
    ScheduledDeliveryPayload,
    SchedulerAndTargets,
    SchedulerCreateProjectWithCompilePayload,
    SchedulerFilterRule,
    SchedulerFormat,
    type SchedulerIndexCatalogJobPayload,
    SchedulerJobStatus,
    SchedulerLog,
    SessionUser,
    SlackInstallationNotFoundError,
    SlackNotificationPayload,
    SqlChart,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    ThresholdOperator,
    ThresholdOptions,
    UnexpectedGoogleSheetsError,
    UnexpectedServerError,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
    VizColumn,
    applyDimensionOverrides,
    assertUnreachable,
    convertReplaceableFieldMatchMapToReplaceCustomFields,
    formatRows,
    friendlyName,
    getColumnOrderFromVizTableConfig,
    getCustomLabelsFromTableConfig,
    getCustomLabelsFromVizTableConfig,
    getErrorMessage,
    getFulfilledValues,
    getHiddenFieldsFromVizTableConfig,
    getHiddenTableFields,
    getHumanReadableCronExpression,
    getItemMap,
    getPivotConfig,
    getRequestMethod,
    getSchedulerUuid,
    isChartValidationError,
    isCreateScheduler,
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardSqlChartTile,
    isDashboardValidationError,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isTableChartConfig,
    isVizTableConfig,
    operatorActionValue,
    pivotResultsAsCsv,
    setUuidParam,
} from '@lightdash/common';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import slackifyMarkdown from 'slackify-markdown';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
} from '../analytics/LightdashAnalytics';
import { S3Client } from '../clients/Aws/S3Client';
import EmailClient from '../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../clients/Google/GoogleDriveClient';
import { MicrosoftTeamsClient } from '../clients/MicrosoftTeams/MicrosoftTeamsClient';
import { SlackClient } from '../clients/Slack/SlackClient';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getChartThresholdAlertBlocks,
    getDashboardCsvResultsBlocks,
    getNotificationChannelErrorBlocks,
} from '../clients/Slack/SlackMessageBlocks';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { isFeatureFlagEnabled } from '../postHog';
import { AsyncQueryService } from '../services/AsyncQueryService/AsyncQueryService';
import type { CatalogService } from '../services/CatalogService/CatalogService';
import {
    CsvService,
    getSchedulerCsvLimit,
} from '../services/CsvService/CsvService';
import { DashboardService } from '../services/DashboardService/DashboardService';
import { ExcelService } from '../services/ExcelService/ExcelService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { RenameService } from '../services/RenameService/RenameService';
import { SchedulerService } from '../services/SchedulerService/SchedulerService';
import {
    ScreenshotContext,
    UnfurlService,
} from '../services/UnfurlService/UnfurlService';
import { UserService } from '../services/UserService';
import { ValidationService } from '../services/ValidationService/ValidationService';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { SchedulerClient } from './SchedulerClient';

export type SchedulerTaskArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    csvService: CsvService;
    dashboardService: DashboardService;
    projectService: ProjectService;
    schedulerService: SchedulerService;
    unfurlService: UnfurlService;
    userService: UserService;
    validationService: ValidationService;
    emailClient: EmailClient;
    googleDriveClient: GoogleDriveClient;
    s3Client: S3Client;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    catalogService: CatalogService;
    encryptionUtil: EncryptionUtil;
    msTeamsClient: MicrosoftTeamsClient;
    renameService: RenameService;
    asyncQueryService: AsyncQueryService;
};

export default class SchedulerTask {
    protected readonly lightdashConfig: LightdashConfig;

    protected readonly analytics: LightdashAnalytics;

    protected readonly csvService: CsvService;

    protected readonly dashboardService: DashboardService;

    protected readonly projectService: ProjectService;

    protected readonly schedulerService: SchedulerService;

    protected readonly unfurlService: UnfurlService;

    protected readonly userService: UserService;

    protected readonly validationService: ValidationService;

    protected readonly emailClient: EmailClient;

    protected readonly googleDriveClient: GoogleDriveClient;

    protected readonly s3Client: S3Client;

    protected readonly schedulerClient: SchedulerClient;

    protected readonly slackClient: SlackClient;

    private readonly catalogService: CatalogService;

    private readonly encryptionUtil: EncryptionUtil;

    protected readonly msTeamsClient: MicrosoftTeamsClient;

    private readonly renameService: RenameService;

    private readonly asyncQueryService: AsyncQueryService;

    constructor(args: SchedulerTaskArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.csvService = args.csvService;
        this.dashboardService = args.dashboardService;
        this.projectService = args.projectService;
        this.schedulerService = args.schedulerService;
        this.unfurlService = args.unfurlService;
        this.userService = args.userService;
        this.validationService = args.validationService;
        this.emailClient = args.emailClient;
        this.googleDriveClient = args.googleDriveClient;
        this.s3Client = args.s3Client;
        this.schedulerClient = args.schedulerClient;
        this.slackClient = args.slackClient;
        this.catalogService = args.catalogService;
        this.encryptionUtil = args.encryptionUtil;
        this.msTeamsClient = args.msTeamsClient;
        this.renameService = args.renameService;
        this.asyncQueryService = args.asyncQueryService;
    }

    protected async getChartOrDashboard(
        chartUuid: string | null,
        dashboardUuid: string | null,
        schedulerUuid: string | undefined,
        sendNowSchedulerFilters: SchedulerFilterRule[] | undefined,
        context: DownloadCsv['properties']['context'],
        selectedTabs: string[] | undefined,
    ) {
        if (chartUuid) {
            const chart =
                await this.schedulerService.savedChartModel.getSummary(
                    chartUuid,
                );
            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
                minimalUrl: `${this.lightdashConfig.headlessBrowser.internalLightdashHost}/minimal/projects/${chart.projectUuid}/saved/${chartUuid}?context=${context}`,
                details: {
                    name: chart.name,
                    description: chart.description,
                },
                pageType: LightdashPage.CHART,
                organizationUuid: chart.organizationUuid,
                projectUuid: chart.projectUuid,
            };
        }

        if (dashboardUuid) {
            const dashboard =
                await this.schedulerService.dashboardModel.getById(
                    dashboardUuid,
                );

            const queryParams = new URLSearchParams();
            if (schedulerUuid) queryParams.set('schedulerUuid', schedulerUuid);
            if (sendNowSchedulerFilters)
                queryParams.set(
                    'sendNowSchedulerFilters',
                    JSON.stringify(sendNowSchedulerFilters),
                );
            if (selectedTabs)
                queryParams.set('selectedTabs', JSON.stringify(selectedTabs));
            if (context) queryParams.set('context', context);

            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view`,
                minimalUrl: `${
                    this.lightdashConfig.headlessBrowser.internalLightdashHost
                }/minimal/projects/${
                    dashboard.projectUuid
                }/dashboards/${dashboardUuid}${
                    queryParams.toString() ? `?${queryParams.toString()}` : ''
                }`,
                details: {
                    name: dashboard.name,
                    description: dashboard.description,
                },
                pageType: LightdashPage.DASHBOARD,
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            };
        }

        throw new Error("Chart or dashboard can't be both undefined");
    }

    protected async getNotificationPageData(
        scheduler: CreateSchedulerAndTargets,
        jobId: string,
    ): Promise<NotificationPayloadBase['page']> {
        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            format,
            options,
        } = scheduler;

        let imageUrl;
        let csvUrl;
        let csvUrls;
        let pdfFile;

        const schedulerUuid =
            'schedulerUuid' in scheduler &&
            typeof scheduler.schedulerUuid === 'string'
                ? scheduler.schedulerUuid
                : undefined;

        const sendNowSchedulerFilters =
            !schedulerUuid && isDashboardScheduler(scheduler)
                ? scheduler.filters
                : undefined;

        const selectedTabs = isDashboardScheduler(scheduler)
            ? scheduler.selectedTabs
            : undefined;

        const context =
            scheduler.thresholds === undefined ||
            scheduler.thresholds.length === 0
                ? QueryExecutionContext.SCHEDULED_DELIVERY
                : QueryExecutionContext.ALERT;

        const {
            url,
            minimalUrl,
            pageType,
            details,
            organizationUuid,
            projectUuid,
        } = await this.getChartOrDashboard(
            savedChartUuid,
            dashboardUuid,
            schedulerUuid,
            sendNowSchedulerFilters,
            context,
            selectedTabs,
        );

        const schedulerUuidParam = setUuidParam(
            'scheduler_uuid',
            schedulerUuid,
        );
        const deliveryUrl = savedChartUuid
            ? `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}`
            : `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}`;
        switch (format) {
            case SchedulerFormat.IMAGE:
                try {
                    const imageId = `slack-image-notification-${nanoid()}`;
                    const imageOptions = isSchedulerImageOptions(
                        scheduler.options,
                    )
                        ? scheduler.options
                        : undefined;
                    const unfurlImage = await this.unfurlService.unfurlImage({
                        url: minimalUrl,
                        lightdashPage: pageType,
                        imageId,
                        authUserUuid: userUuid,
                        withPdf: imageOptions?.withPdf,
                        gridWidth:
                            isDashboardScheduler(scheduler) &&
                            scheduler.customViewportWidth
                                ? scheduler.customViewportWidth
                                : undefined,
                        context: ScreenshotContext.SCHEDULED_DELIVERY,
                        contextId: jobId,
                    });
                    if (unfurlImage.imageUrl === undefined) {
                        throw new Error('Unable to unfurl image');
                    }
                    pdfFile = unfurlImage.pdfFile;
                    imageUrl = unfurlImage.imageUrl;
                } catch (error) {
                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    error,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    throw error;
                }
                break;
            case SchedulerFormat.GSHEETS:
                // We don't generate CSV files for Google sheets on handleNotification task,
                // instead we directly upload the data from the row results in the uploadGsheets task
                throw new Error("Don't fetch csv for gsheets");
            case SchedulerFormat.XLSX: {
                const user = await this.userService.getSessionByUserUuid(
                    userUuid,
                );
                const csvOptions = isSchedulerCsvOptions(options)
                    ? options
                    : undefined;
                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: user.organizationUuid,
                    projectId: projectUuid,
                    fileType: SchedulerFormat.XLSX,
                    values: csvOptions?.formatted ? 'formatted' : 'raw',
                    limit: parseAnalyticsLimit(csvOptions?.limit),
                    storage: this.s3Client.isEnabled() ? 's3' : 'local',
                    context,
                };

                try {
                    if (savedChartUuid) {
                        this.analytics.track({
                            event: 'download_results.started',
                            userId: user.userUuid,
                            properties: baseAnalyticsProperties,
                        });
                        const query =
                            await this.asyncQueryService.executeAsyncSavedChartQuery(
                                {
                                    user,
                                    projectUuid,
                                    chartUuid: savedChartUuid,
                                    invalidateCache: true,
                                    context:
                                        QueryExecutionContext.SCHEDULED_DELIVERY,
                                    limit: getSchedulerCsvLimit(csvOptions),
                                },
                            );

                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                savedChartUuid,
                            );
                        const downloadResult =
                            await this.asyncQueryService.downloadSyncQueryResults(
                                {
                                    user,
                                    projectUuid,
                                    queryUuid: query.queryUuid,
                                    type: DownloadFileType.XLSX,
                                    onlyRaw: csvOptions?.formatted === false,
                                    customLabels:
                                        getCustomLabelsFromTableConfig(
                                            chart.chartConfig.config,
                                        ),
                                    hiddenFields: getHiddenTableFields(
                                        chart.chartConfig,
                                    ),
                                    pivotConfig: getPivotConfig(chart),
                                    columnOrder: chart.tableConfig.columnOrder,
                                },
                            );
                        csvUrl = {
                            filename: ExcelService.generateFileId(chart.name),
                            path: downloadResult.fileUrl,
                            localPath: downloadResult.fileUrl,
                            truncated: false,
                        };
                        this.analytics.track({
                            event: 'download_results.completed',
                            userId: userUuid,
                            properties: baseAnalyticsProperties,
                        });
                    } else if (dashboardUuid) {
                        this.analytics.track({
                            event: 'download_results.started',
                            userId: userUuid,
                            properties: baseAnalyticsProperties,
                        });
                        const dashboard =
                            await this.schedulerService.dashboardModel.getById(
                                dashboardUuid,
                            );

                        const dashboardFilters = dashboard.filters;
                        const schedulerFilters = isDashboardScheduler(scheduler)
                            ? scheduler.filters
                            : undefined;

                        if (schedulerFilters) {
                            // Scheduler filters can only override existing filters from the dashboard
                            dashboardFilters.dimensions =
                                applyDimensionOverrides(
                                    dashboard.filters,
                                    schedulerFilters,
                                );
                        }

                        const chartTileUuidsWithChartUuids = dashboard.tiles
                            .filter(isDashboardChartTileType)
                            .filter((tile) => tile.properties.savedChartUuid)
                            .filter(
                                (tile) =>
                                    !selectedTabs ||
                                    selectedTabs.includes(tile.tabUuid || ''),
                            )
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedChartUuid!,
                            }));
                        const sqlChartTileUuids = dashboard.tiles
                            .filter(isDashboardSqlChartTile)
                            .filter((tile) => !!tile.properties.savedSqlUuid)
                            .map((tile) => ({
                                tileUuid: tile.uuid,
                                chartUuid: tile.properties.savedSqlUuid!,
                            }));
                        const csvForChartPromises =
                            chartTileUuidsWithChartUuids.map(
                                async ({ chartUuid }) => {
                                    const chartLimit =
                                        getSchedulerCsvLimit(csvOptions);
                                    const query =
                                        await this.asyncQueryService.executeAsyncDashboardChartQuery(
                                            {
                                                user,
                                                projectUuid,
                                                chartUuid,
                                                invalidateCache: true,
                                                context:
                                                    QueryExecutionContext.SCHEDULED_DELIVERY,
                                                dashboardUuid,
                                                dashboardFilters,
                                                dashboardSorts: [],
                                                limit: chartLimit,
                                            },
                                        );
                                    const chart =
                                        await this.schedulerService.savedChartModel.get(
                                            chartUuid,
                                        );
                                    const downloadResult =
                                        await this.asyncQueryService.downloadSyncQueryResults(
                                            {
                                                user,
                                                projectUuid,
                                                queryUuid: query.queryUuid,
                                                type: DownloadFileType.XLSX,
                                                onlyRaw:
                                                    csvOptions?.formatted ===
                                                    false,
                                                customLabels:
                                                    getCustomLabelsFromTableConfig(
                                                        chart.chartConfig
                                                            .config,
                                                    ),
                                                hiddenFields:
                                                    getHiddenTableFields(
                                                        chart.chartConfig,
                                                    ),
                                                pivotConfig:
                                                    getPivotConfig(chart),
                                                columnOrder:
                                                    chart.tableConfig
                                                        .columnOrder,
                                            },
                                        );
                                    return {
                                        filename: chart.name,
                                        path: downloadResult.fileUrl,
                                        localPath: downloadResult.fileUrl,
                                        truncated: false,
                                    };
                                },
                            );
                        const csvForSqlChartPromises = sqlChartTileUuids.map(
                            async ({ chartUuid, tileUuid }) => {
                                const sqlLimit =
                                    getSchedulerCsvLimit(csvOptions);
                                const query =
                                    await this.asyncQueryService.executeAsyncDashboardSqlChartQuery(
                                        {
                                            user,
                                            projectUuid,
                                            savedSqlUuid: chartUuid,
                                            invalidateCache: true,
                                            context:
                                                QueryExecutionContext.SCHEDULED_DELIVERY,
                                            dashboardUuid,
                                            tileUuid,
                                            dashboardFilters,
                                            dashboardSorts: [],
                                            limit:
                                                sqlLimit === null
                                                    ? MAX_SAFE_INTEGER
                                                    : sqlLimit,
                                        },
                                    );
                                const chart =
                                    await this.asyncQueryService.savedSqlModel.getByUuid(
                                        chartUuid,
                                        {
                                            projectUuid,
                                        },
                                    );
                                const downloadResult =
                                    await this.asyncQueryService.downloadSyncQueryResults(
                                        {
                                            user,
                                            projectUuid,
                                            queryUuid: query.queryUuid,
                                            type: DownloadFileType.XLSX,
                                            onlyRaw:
                                                csvOptions?.formatted === false,
                                            customLabels:
                                                getCustomLabelsFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                            hiddenFields:
                                                getHiddenFieldsFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                            columnOrder:
                                                getColumnOrderFromVizTableConfig(
                                                    isVizTableConfig(
                                                        chart.config,
                                                    )
                                                        ? chart.config
                                                        : undefined,
                                                ),
                                        },
                                    );
                                return {
                                    filename: chart.name,
                                    path: downloadResult.fileUrl,
                                    localPath: downloadResult.fileUrl,
                                    truncated: false,
                                };
                            },
                        );

                        csvUrls = await Promise.allSettled([
                            ...csvForChartPromises,
                            ...csvForSqlChartPromises,
                        ]).then(getFulfilledValues);

                        this.analytics.track({
                            event: 'download_results.completed',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                numCharts: csvUrls.length,
                            },
                        });
                    } else {
                        throw new Error('Not implemented');
                    }
                } catch (e) {
                    Logger.error(
                        `Unable to download XLSX on scheduled task: ${e}`,
                    );

                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    e,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    this.analytics.track({
                        event: 'download_results.error',
                        userId: userUuid,
                        properties: {
                            ...baseAnalyticsProperties,
                            error: `${e}`,
                        },
                    });
                    throw e; // cascade error
                }
                break;
            }
            case SchedulerFormat.CSV:
                const user = await this.userService.getSessionByUserUuid(
                    userUuid,
                );
                const csvOptions = isSchedulerCsvOptions(options)
                    ? options
                    : undefined;
                const baseAnalyticsProperties: DownloadCsv['properties'] = {
                    jobId,
                    userId: userUuid,
                    organizationId: user.organizationUuid,
                    projectId: projectUuid,
                    fileType: SchedulerFormat.CSV,
                    values: csvOptions?.formatted ? 'formatted' : 'raw',
                    limit: parseAnalyticsLimit(csvOptions?.limit),
                    storage: this.s3Client.isEnabled() ? 's3' : 'local',
                };

                try {
                    if (savedChartUuid) {
                        csvUrl = await this.csvService.getCsvForChart(
                            user,
                            savedChartUuid,
                            csvOptions,
                            jobId,
                        );
                    } else if (dashboardUuid) {
                        this.analytics.track({
                            event: 'download_results.started',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                context,
                            },
                        });

                        csvUrls = await this.csvService.getCsvsForDashboard({
                            jobId,
                            user,
                            dashboardUuid,
                            options: csvOptions,
                            schedulerFilters: isDashboardScheduler(scheduler)
                                ? scheduler.filters
                                : undefined,
                            selectedTabs,
                        });

                        this.analytics.track({
                            event: 'download_results.completed',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                context,
                                numCharts: csvUrls.length,
                            },
                        });
                    } else {
                        throw new Error('Not implemented');
                    }
                } catch (e) {
                    Logger.error(
                        `Unable to download CSV on scheduled task: ${e}`,
                    );

                    if (this.slackClient.isEnabled) {
                        await this.slackClient.postMessageToNotificationChannel(
                            {
                                organizationUuid,
                                text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                                blocks: getNotificationChannelErrorBlocks(
                                    scheduler.name,
                                    e,
                                    deliveryUrl,
                                ),
                            },
                        );
                    }

                    this.analytics.track({
                        event: 'download_results.error',
                        userId: userUuid,
                        properties: {
                            ...baseAnalyticsProperties,
                            error: `${e}`,
                        },
                    });
                    throw e; // cascade error
                }
                break;
            default:
                return assertUnreachable(
                    format,
                    `Format ${format} is not supported for scheduled delivery`,
                );
        }

        return {
            url,
            pageType,
            details,
            organizationUuid,
            imageUrl,
            csvUrl,
            csvUrls,
            pdfFile,
        };
    }

    protected async sendSlackNotification(
        jobId: string,
        notification: SlackNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerSlackTargetUuid,
            channel,
            scheduledTime,
            scheduler,
        } = notification;
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                type: 'slack',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.slackClient.isEnabled) {
                throw new Error('Slack app is not configured');
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
            } = notificationPageData;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const showExpirationWarning = format !== SchedulerFormat.IMAGE;
            const schedulerFooter = includeLinks
                ? `<${url}?${setUuidParam(
                      'scheduler_uuid',
                      schedulerUuid,
                  )}|scheduled delivery>`
                : 'scheduled delivery';
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message:
                    scheduler.message && slackifyMarkdown(scheduler.message),
                ctaUrl: url,
                footerMarkdown: `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                    cron,
                    timezone || defaultSchedulerTimezone,
                )} from Lightdash.\n${
                    showExpirationWarning
                        ? this.s3Client.getExpirationWarning()?.slack || ''
                        : ''
                }`,
                includeLinks,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    const slackImageUrl =
                        await this.slackClient.tryUploadingImageToSlack(
                            organizationUuid,
                            imageUrl,
                            name,
                        );
                    const thresholdFooter = includeLinks
                        ? `<${url}?${setUuidParam(
                              'threshold_uuid',
                              schedulerUuid,
                          )}|data alert>`
                        : 'data alert';

                    const expiration = slackImageUrl.expiring
                        ? `For security reasons, delivered files expire after ${
                              this.s3Client.getExpirationWarning()?.days || 3
                          } days.`
                        : '';

                    const blocks = getChartThresholdAlertBlocks({
                        ...getBlocksArgs,
                        footerMarkdown: `This is a ${thresholdFooter} sent by Lightdash. ${expiration}`,
                        imageUrl: slackImageUrl.url,
                        thresholds,
                        includeLinks,
                    });
                    await this.slackClient.postMessage({
                        organizationUuid,
                        text: name,
                        channel,
                        blocks,
                    });
                } else {
                    throw new Error('Not implemented');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                const slackImageUrl =
                    await this.slackClient.tryUploadingImageToSlack(
                        organizationUuid,
                        imageUrl,
                        name,
                    );

                const expiration = slackImageUrl.expiring
                    ? `For security reasons, delivered files expire after ${
                          this.s3Client.getExpirationWarning()?.days || 3
                      } days.`
                    : '';
                const blocks = getChartAndDashboardBlocks({
                    ...getBlocksArgs,
                    footerMarkdown: `${getBlocksArgs.footerMarkdown} ${expiration}`,
                    imageUrl: slackImageUrl.url,
                });

                const message = await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });

                if (pdfFile && message.ts) {
                    try {
                        // Add the pdf to the thread
                        const pdfBuffer = this.s3Client.isEnabled()
                            ? await this.s3Client.getS3FileStream(
                                  pdfFile.fileName,
                              )
                            : await fs.readFile(pdfFile.source);

                        await this.slackClient.postFileToThread({
                            organizationUuid,
                            file: pdfBuffer,
                            title: name,
                            channelId: channel,
                            threadTs: message.ts,
                            filename: `${name}.pdf`,
                            fileType: 'pdf',
                        });
                    } catch (err) {
                        if (
                            err instanceof Error &&
                            'code' in err &&
                            err.code === 'ENOENT'
                        ) {
                            throw new ReadFileError(
                                `PDF file not found for ${name}`,
                                {
                                    filePath: pdfFile,
                                },
                            );
                        }
                        throw err;
                    }
                }
            } else {
                let blocks;
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new Error('Missing CSV URL');
                    }

                    blocks = getChartCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrl:
                            csvUrl.path !== '#no-results'
                                ? csvUrl.path
                                : undefined,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new Error('Missing CSV URLS');
                    }
                    blocks = getDashboardCsvResultsBlocks({
                        ...getBlocksArgs,
                        csvUrls,
                    });
                } else {
                    throw new Error('Not implemented');
                }
                await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    type: 'slack',
                    format,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: channel,
                targetType: 'slack',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerSlackTargetUuid,
                    type: 'slack',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            if (e instanceof SlackInstallationNotFoundError) {
                console.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async sendMsTeamsNotification(
        jobId: string,
        notification: MsTeamsNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerMsTeamsTargetUuid,
            webhook,
            scheduledTime,
            scheduler,
        } = notification;
        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerMsTeamsTargetUuid,
                type: 'msteams',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            if (!this.lightdashConfig.microsoftTeams.enabled) {
                throw new MissingConfigError(
                    'Microsoft teams is not configured',
                );
            }

            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                cron,
                timezone,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
            } = notificationPageData;

            const schedulerType =
                thresholds !== undefined && thresholds.length > 0
                    ? 'data alert'
                    : 'scheduled delivery';
            const schedulerFooter = includeLinks
                ? `[${schedulerType}](${url})`
                : schedulerType;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            const footer = `This is a ${schedulerFooter} ${getHumanReadableCronExpression(
                cron,
                timezone || defaultSchedulerTimezone,
            )} from Lightdash.`;
            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message: scheduler.message,
                ctaUrl: url,
                footer,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    if (imageUrl)
                        await this.msTeamsClient.postImageWithWebhook({
                            webhookUrl: webhook,
                            ...getBlocksArgs,
                            image: imageUrl,
                            thresholds,
                        });
                } else {
                    throw new Error('No chart found');
                }
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl)
                    await this.msTeamsClient.postImageWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        image: imageUrl,
                        pdfUrl: pdfFile?.source,
                    });
            } else if (format === SchedulerFormat.CSV) {
                if (savedChartUuid) {
                    if (csvUrl === undefined) {
                        throw new UnexpectedServerError('Missing CSV URL');
                    }
                    await this.msTeamsClient.postCsvWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrl,
                    });
                } else if (dashboardUuid) {
                    if (csvUrls === undefined) {
                        throw new UnexpectedServerError('Missing CSV URLS');
                    }
                    await this.msTeamsClient.postCsvsWithWebhook({
                        webhookUrl: webhook,
                        ...getBlocksArgs,
                        csvUrls,
                    });
                } else {
                    throw new UnexpectedServerError('Not implemented');
                }
            }
            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    type: 'msteams',
                    format,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: webhook,
                targetType: 'msteams',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerMsTeamsTargetUuid,
                    type: 'msteams',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'msteams',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async testAndCompileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.testAndCompileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    userUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    context: 'test_and_compile',
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });
            throw e;
        }
    }

    protected async createProjectWithCompile(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerCreateProjectWithCompilePayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
                jobId,
                scheduledTime,
            };

        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            let projectData: CreateProject;
            try {
                projectData = JSON.parse(
                    this.encryptionUtil.decrypt(
                        Buffer.from(payload.data, 'base64'),
                    ),
                ) as CreateProject;
            } catch {
                throw new UnexpectedServerError('Failed to load project data');
            }

            const projectCreationResult = await this.projectService._create(
                user,
                projectData,
                payload.jobUuid,
                getRequestMethod(payload.requestMethod),
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: projectCreationResult.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: undefined,
                    organizationUuid: payload.organizationUuid,
                    error: e,
                },
            });
            // Update legacy job
            await this.projectService._markJobAsFailed(payload.jobUuid);
            throw e;
        }
    }

    protected async compileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.COMPILE_PROJECT,
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            await this.projectService.compileProject(
                user,
                payload.projectUuid,
                getRequestMethod(payload.requestMethod),
                payload.jobUuid,
            );
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    projectUuid: payload.projectUuid,
                    context: 'dbt_refresh',
                    userUuid: payload.createdByUserUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
            const canReplaceCustomMetrics = await isFeatureFlagEnabled(
                FeatureFlags.ReplaceCustomMetricsOnCompile,
                {
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                },
                {
                    throwOnTimeout: false,
                },
            );
            if (canReplaceCustomMetrics) {
                // Don't wait for replaceCustomFields response
                void this.schedulerClient.replaceCustomFields({
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    userUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.createdByUserUuid,
                },
            });
            throw e;
        }
    }

    protected async validateProject(
        jobId: string,
        scheduledTime: Date,
        payload: ValidateProjectPayload,
    ) {
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.VALIDATE_PROJECT,
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
                createdByUserUuid: payload.userUuid,
            },
        });

        this.analytics.track({
            event: 'validation.run',
            userId: payload.userUuid,
            properties: {
                context: payload.context,
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
            },
        });
        try {
            const validationTargetsSet = new Set(payload.validationTargets);
            const errors = await this.validationService.generateValidation(
                payload.projectUuid,
                payload.explores,
                validationTargetsSet,
            );

            const contentIds = errors.map((validation) => {
                if (isChartValidationError(validation))
                    return validation.chartUuid;
                if (isDashboardValidationError(validation))
                    return validation.dashboardUuid;

                return validation.name;
            });

            await this.validationService.storeValidation(
                payload.projectUuid,
                errors,
                payload.explores ? jobId : undefined,
            );

            this.analytics.track({
                event: 'validation.completed',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    numContentAffected: new Set(contentIds).size,
                    numErrorsDetected: errors.length,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'validation.error',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    error: getErrorMessage(e),
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.VALIDATE_PROJECT,
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            });
            throw e;
        }
    }

    protected async downloadCsv(
        jobId: string,
        scheduledTime: Date,
        payload: DownloadCsvPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.DOWNLOAD_CSV,
                jobId,
                scheduledTime,
            };
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            const { fileUrl, truncated } = await this.csvService.downloadCsv(
                jobId,
                payload,
            );
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    fileUrl,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                    truncated,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    private async logWrapper<TRecordValues = string>(
        baseLog: Pick<
            SchedulerLog,
            'task' | 'jobId' | 'scheduledTime' | 'details'
        >,
        func: () => Promise<Record<string, TRecordValues> | undefined>, // Returns extra details for the log
    ) {
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.STARTED,
            });

            const details = await func();

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { ...baseLog.details, ...details },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    ...baseLog.details,
                    error: getErrorMessage(e),
                    ...(e instanceof Error && 'data' in e && e?.data
                        ? e.data
                        : {}),
                },
            });
            Logger.error(`Error in scheduler task: ${e}`);
            throw e;
        }
    }

    protected async sqlRunner(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPayload,
    ) {
        await this.logWrapper<string | VizColumn[]>(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { fileUrl, columns } =
                    await this.projectService.streamSqlQueryIntoFile(payload);
                return { fileUrl, columns };
            },
        );
    }

    protected async sqlRunnerPivotQuery(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPivotQueryPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => this.projectService.pivotQueryWorkerTask(payload),
        );
    }

    protected async uploadGsheetFromQuery(
        jobId: string,
        scheduledTime: Date,
        payload: UploadMetricGsheetPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                jobId,
                scheduledTime,
            };

        const analyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: payload.userUuid,
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
            fileType: SchedulerFormat.GSHEETS,
        };

        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new Error(
                    'Unable to upload Google Sheet from query, Google Drive is not enabled',
                );
            }
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.STARTED,
            });

            this.analytics.track({
                event: 'download_results.started',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });
            const user = await this.userService.getSessionByUserUuid(
                payload.userUuid,
            );
            const queryTags: RunQueryTags = {
                project_uuid: payload.projectUuid,
                user_uuid: payload.userUuid,
                organization_uuid: payload.organizationUuid,
                explore_name: payload.exploreId,
                query_context: QueryExecutionContext.GSHEETS,
            };

            const { rows } = await this.projectService.runMetricQuery({
                user,
                metricQuery: payload.metricQuery,
                projectUuid: payload.projectUuid,
                exploreName: payload.exploreId,
                csvLimit: undefined,
                context: QueryExecutionContext.GSHEETS,
                chartUuid: undefined,
                queryTags,
            });

            const refreshToken = await this.userService.getRefreshToken(
                payload.userUuid,
            );
            const { spreadsheetId, spreadsheetUrl } =
                await this.googleDriveClient.createNewSheet(
                    refreshToken,
                    payload.exploreId,
                );

            if (!spreadsheetId) {
                throw new Error('Unable to create new sheet');
            }

            const explore = await this.projectService.getExplore(
                user,
                payload.projectUuid,
                payload.exploreId,
            );
            const itemMap = getItemMap(
                explore,
                payload.metricQuery.additionalMetrics,
                payload.metricQuery.tableCalculations,
            );
            if (payload.pivotConfig) {
                // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                const formattedRows = formatRows(rows, itemMap);

                const pivotedResults = pivotResultsAsCsv({
                    pivotConfig: payload.pivotConfig,
                    rows: formattedRows,
                    itemMap,
                    metricQuery: payload.metricQuery,
                    customLabels: payload.customLabels,
                    onlyRaw: true,
                    maxColumnLimit:
                        this.lightdashConfig.pivotTable.maxColumnLimit,
                });

                await this.googleDriveClient.appendCsvToSheet(
                    refreshToken,
                    spreadsheetId,
                    pivotedResults,
                );
            } else {
                await this.googleDriveClient.appendToSheet(
                    refreshToken,
                    spreadsheetId,
                    rows,
                    itemMap,
                    payload.showTableNames,
                    undefined, // tabName
                    payload.columnOrder,
                    payload.customLabels,
                    payload.hiddenFields,
                );
            }

            const truncated = this.csvService.couldBeTruncated(rows);

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    fileUrl: spreadsheetUrl,
                    createdByUserUuid: payload.userUuid,
                    truncated,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
                status: SchedulerJobStatus.COMPLETED,
            });

            this.analytics.track({
                event: 'download_results.completed',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.userUuid,
                    error: getErrorMessage(e),
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            });

            this.analytics.track({
                event: 'download_results.error',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });

            throw e;
        }
    }

    protected async sendEmailNotification(
        jobId: string,
        notification: EmailNotificationPayload,
    ) {
        const {
            schedulerUuid,
            schedulerEmailTargetUuid,
            recipient,
            scheduledTime,
            scheduler,
        } = notification;

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerEmailTargetUuid,
                type: 'email',
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });

        try {
            const {
                format,
                savedChartUuid,
                dashboardUuid,
                name,
                thresholds,
                includeLinks,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.STARTED,
            });

            // Backwards compatibility for old scheduled deliveries
            const notificationPageData =
                notification.page ??
                (await this.getNotificationPageData(scheduler, jobId));

            const {
                url,
                details,
                pageType,
                imageUrl,
                csvUrl,
                csvUrls,
                pdfFile,
            } = notificationPageData;

            const schedulerUrl = `${url}?${setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            )}`;

            const defaultSchedulerTimezone =
                await this.schedulerService.getSchedulerDefaultTimezone(
                    schedulerUuid,
                );

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }
                if (scheduler.message) {
                    throw new Error(
                        'Message not supported on threshold alerts',
                    );
                }
                // Reuse message from imageNotification for threshold information
                const thresholdMessageList = thresholds.map(
                    (threshold) =>
                        `- **${friendlyName(
                            threshold.fieldId,
                        )}** ${operatorActionValue(
                            threshold.operator,
                            threshold.value,
                            '**',
                        )}`,
                );
                const thresholdMessage = `Your results for the chart **${
                    details.name
                }** triggered the following alerts:\n${thresholdMessageList.join(
                    '\n',
                )}`;
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    `Lightdash Data Alert`,
                    name,
                    details.description || '',
                    thresholdMessage,
                    new Date().toLocaleDateString('en-GB'),
                    `For security reasons, delivered files expire after ${
                        this.s3Client.getExpirationWarning()?.days || 3
                    } days`,
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    undefined, // expiration days
                    'This is a data alert sent by Lightdash',
                );
            } else if (format === SchedulerFormat.IMAGE) {
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }
                await this.emailClient.sendImageNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    imageUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    pdfFile?.source,
                    this.s3Client.getExpirationWarning()?.days,
                );
            } else if (savedChartUuid) {
                if (csvUrl === undefined) {
                    throw new Error('Missing CSV URL');
                }
                await this.emailClient.sendChartCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    csvUrl,
                    url,
                    schedulerUrl,
                    includeLinks,
                    this.s3Client.getExpirationWarning()?.days,
                );
            } else if (dashboardUuid) {
                if (csvUrls === undefined) {
                    throw new Error('Missing CSV URLS');
                }

                await this.emailClient.sendDashboardCsvNotificationEmail(
                    recipient,
                    name,
                    details.name,
                    details.description || '',
                    scheduler.message,
                    new Date().toLocaleDateString('en-GB'),
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    csvUrls,
                    url,
                    schedulerUrl,
                    includeLinks,
                    this.s3Client.getExpirationWarning()?.days,
                );
            } else {
                throw new Error('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    type: 'email',
                    format,
                    withPdf: pdfFile !== undefined,
                    resourceType:
                        pageType === LightdashPage.CHART
                            ? 'chart'
                            : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
                scheduledTime,
                target: recipient,
                targetType: 'email',
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: schedulerEmailTargetUuid,
                    type: 'email',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    static isPositiveThresholdAlert(
        thresholds: ThresholdOptions[],
        results: Record<string, AnyType>[],
    ): boolean {
        if (thresholds.length < 1 || results.length < 1) {
            return false;
        }

        const { fieldId, operator, value: thresholdValue } = thresholds[0];

        const getValue = (resultIdx: number) => {
            if (results.length === 0) {
                throw new NotEnoughResults(
                    `Threshold alert error: Query returned no rows.`,
                );
            }

            // If we are trying to access beyond available rows, throw a general error
            if (resultIdx >= results.length) {
                throw new NotEnoughResults(
                    `Threshold alert error: Expected at least ${resultIdx} rows, but only ${results.length} row(s) were returned.`,
                );
            }

            const result = results[resultIdx];

            if (!(fieldId in result)) {
                // This error will disable the scheduler
                throw new FieldReferenceError(
                    `Threshold alert error: Tried to reference field with unknown id: ${fieldId}`,
                );
            }
            return parseFloat(result[fieldId]);
        };

        const latestValue = getValue(0);
        switch (operator) {
            case ThresholdOperator.GREATER_THAN:
                return latestValue > thresholdValue;

            case ThresholdOperator.LESS_THAN:
                return latestValue < thresholdValue;

            case ThresholdOperator.INCREASED_BY:
            case ThresholdOperator.DECREASED_BY:
                // Ensure at least two rows exist for these operations
                if (results.length < 2) {
                    throw new NotEnoughResults(
                        `Threshold alert error: Increase/decrease comparison requires at least two rows, but only ${results.length} row(s) were returned.`,
                    );
                }
                const previousValue = getValue(1);
                if (operator === ThresholdOperator.INCREASED_BY) {
                    const percentageIncrease =
                        ((latestValue - previousValue) / previousValue) * 100;
                    return percentageIncrease > thresholdValue;
                }
                const percentageDecrease =
                    ((previousValue - latestValue) / previousValue) * 100;
                return percentageDecrease > thresholdValue;

            default:
                assertUnreachable(
                    operator,
                    `Unknown threshold alert operator: ${operator}`,
                );
        }

        return false;
    }

    protected async uploadGsheets(
        jobId: string,
        notification: GsheetsNotificationPayload,
    ) {
        const { schedulerUuid, scheduledTime } = notification;

        this.analytics.track({
            event: 'scheduler_notification_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: undefined,
                type: 'gsheets',
                sendNow: schedulerUuid === undefined,
            },
        });
        let user: SessionUser | undefined;
        let scheduler: SchedulerAndTargets | undefined;

        let deliveryUrl = this.lightdashConfig.siteUrl;
        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new MissingConfigError(
                    'Unable to upload Google Sheet from scheduler, Google Drive is not enabled',
                );
            }
            scheduler =
                await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                    schedulerUuid,
                );

            const { format, savedChartUuid, dashboardUuid, thresholds } =
                scheduler;

            const gdriveId = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.gdriveId
                : undefined;
            if (gdriveId === undefined) {
                throw new Error('Missing gdriveId');
            }

            const tabName = isSchedulerGsheetsOptions(scheduler.options)
                ? scheduler.options.tabName
                : undefined;

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.STARTED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
            user = await this.userService.getSessionByUserUuid(
                scheduler.createdBy,
            );

            const schedulerUuidParam = setUuidParam(
                'scheduler_uuid',
                schedulerUuid,
            );

            if (format !== SchedulerFormat.GSHEETS) {
                throw new UnexpectedServerError(
                    `Unable to process format ${format} on sendGdriveNotification`,
                );
            } else if (savedChartUuid) {
                const chart = await this.schedulerService.savedChartModel.get(
                    savedChartUuid,
                );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${savedChartUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const { rows } = await this.projectService.getResultsForChart(
                    user,
                    savedChartUuid,
                    QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                );

                if (thresholds !== undefined && thresholds.length > 0) {
                    throw new UnexpectedServerError(
                        'Thresholds not implemented for google sheets',
                    );
                }

                const explore = await this.projectService.getExplore(
                    user,
                    chart.projectUuid,
                    chart.tableName,
                );
                const itemMap = getItemMap(
                    explore,
                    chart.metricQuery.additionalMetrics,
                    chart.metricQuery.tableCalculations,
                );
                const showTableNames = isTableChartConfig(
                    chart.chartConfig.config,
                )
                    ? chart.chartConfig.config.showTableNames ?? false
                    : true;
                const customLabels = getCustomLabelsFromTableConfig(
                    chart.chartConfig.config,
                );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const reportUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view?${schedulerUuidParam}&isSync=true`;
                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone || defaultSchedulerTimezone,
                    ),
                    undefined,
                    reportUrl,
                );
                const pivotConfig = getPivotConfig(chart);
                if (
                    pivotConfig &&
                    isTableChartConfig(chart.chartConfig.config)
                ) {
                    // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                    // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                    const formattedRows = formatRows(rows, itemMap);

                    const pivotedResults = pivotResultsAsCsv({
                        pivotConfig,
                        rows: formattedRows,
                        itemMap,
                        metricQuery: chart.metricQuery,
                        customLabels,
                        onlyRaw: true,
                        maxColumnLimit:
                            this.lightdashConfig.pivotTable.maxColumnLimit,
                    });
                    await this.googleDriveClient.appendCsvToSheet(
                        refreshToken,
                        gdriveId,
                        pivotedResults,
                        tabName,
                    );
                } else {
                    await this.googleDriveClient.appendToSheet(
                        refreshToken,
                        gdriveId,
                        rows,
                        itemMap,
                        showTableNames,
                        tabName,
                        chart.tableConfig.columnOrder,
                        customLabels,
                        getHiddenTableFields(chart.chartConfig),
                    );
                }
            } else if (dashboardUuid) {
                const dashboard = await this.dashboardService.getById(
                    user,
                    dashboardUuid,
                );
                deliveryUrl = `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view?${schedulerUuidParam}&isSync=true`;

                const defaultSchedulerTimezone =
                    await this.schedulerService.getSchedulerDefaultTimezone(
                        schedulerUuid,
                    );

                const chartUuids = dashboard.tiles.reduce<string[]>(
                    (acc, tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.savedChartUuid
                        ) {
                            return [...acc, tile.properties.savedChartUuid];
                        }
                        return acc;
                    },
                    [],
                );

                const refreshToken = await this.userService.getRefreshToken(
                    scheduler.createdBy,
                );

                const chartNames = chartUuids.reduce<Record<string, string>>(
                    (acc, chartUuid) => {
                        const tile = dashboard.tiles.find(
                            (t) =>
                                isDashboardChartTileType(t) &&
                                t.properties.savedChartUuid === chartUuid,
                        );
                        const chartName =
                            tile && isDashboardChartTileType(tile)
                                ? tile.properties.chartName
                                : undefined;
                        return {
                            ...acc,
                            [chartUuid]:
                                tile?.properties.title ||
                                chartName ||
                                chartUuid,
                        };
                    },
                    {},
                );

                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(
                        scheduler.cron,
                        scheduler.timezone ?? defaultSchedulerTimezone,
                    ),
                    Object.values(chartNames),
                );

                Logger.debug(
                    `Uploading dashboard with ${chartUuids.length} charts to Google Sheets`,
                );
                // We want to process all charts in sequence, so we don't load all chart results in memory
                chartUuids
                    .reduce(async (promise, chartUuid) => {
                        await promise;
                        const chart =
                            await this.schedulerService.savedChartModel.get(
                                chartUuid,
                            );
                        const { rows } =
                            await this.projectService.getResultsForChart(
                                user!,
                                chartUuid,
                                QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                            );
                        const explore = await this.projectService.getExplore(
                            user!,
                            chart.projectUuid,
                            chart.tableName,
                        );
                        const itemMap = getItemMap(
                            explore,
                            chart.metricQuery.additionalMetrics,
                            chart.metricQuery.tableCalculations,
                        );
                        const showTableNames = isTableChartConfig(
                            chart.chartConfig.config,
                        )
                            ? chart.chartConfig.config.showTableNames ?? false
                            : true;
                        const customLabels = getCustomLabelsFromTableConfig(
                            chart.chartConfig.config,
                        );

                        const chartTabName =
                            await this.googleDriveClient.createNewTab(
                                refreshToken,
                                gdriveId,
                                chartNames[chartUuid] || chartUuid,
                            );
                        const pivotConfig = getPivotConfig(chart);
                        if (
                            pivotConfig &&
                            isTableChartConfig(chart.chartConfig.config)
                        ) {
                            // PivotQueryResults expects a formatted ResultRow[] type, so we need to convert it first
                            // TODO: refactor pivotQueryResults to accept a Record<string, any>[] simple row type for performance
                            const formattedRows = formatRows(rows, itemMap);

                            const pivotedResults = pivotResultsAsCsv({
                                pivotConfig,
                                rows: formattedRows,
                                itemMap,
                                metricQuery: chart.metricQuery,
                                customLabels,
                                onlyRaw: true,
                                maxColumnLimit:
                                    this.lightdashConfig.pivotTable
                                        .maxColumnLimit,
                            });

                            await this.googleDriveClient.appendCsvToSheet(
                                refreshToken,
                                gdriveId,
                                pivotedResults,
                                chartTabName,
                            );
                        } else {
                            await this.googleDriveClient.appendToSheet(
                                refreshToken,
                                gdriveId,
                                rows,
                                itemMap,
                                showTableNames,
                                chartTabName,
                                chart.tableConfig.columnOrder,
                                customLabels,
                                getHiddenTableFields(chart.chartConfig),
                            );
                        }
                    }, Promise.resolve())
                    .catch((error) => {
                        Logger.debug('Error processing charts:', error);
                        throw error;
                    });
            } else {
                throw new UnexpectedServerError('Not implemented');
            }

            this.analytics.track({
                event: 'scheduler_notification_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    type: 'gsheets',
                    format,
                    resourceType: savedChartUuid ? 'chart' : 'dashboard',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_notification_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    error: `${e}`,
                    jobId,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: undefined,
                    type: 'gsheets',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'gsheets',
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: notification.projectUuid,
                    organizationUuid: notification.organizationUuid,
                    createdByUserUuid: notification.userUuid,
                },
            });
            const shouldDisableSync =
                e instanceof ForbiddenError ||
                e instanceof MissingConfigError ||
                e instanceof UnexpectedGoogleSheetsError;

            if (
                this.slackClient.isEnabled &&
                user?.organizationUuid &&
                scheduler
            ) {
                await this.slackClient.postMessageToNotificationChannel({
                    organizationUuid: user.organizationUuid,
                    text: `Error uploading Google Sheets: ${scheduler.name}`,
                    blocks: getNotificationChannelErrorBlocks(
                        scheduler.name,
                        e,
                        deliveryUrl,
                        'Google Sync',
                        shouldDisableSync,
                    ),
                });
            }

            if (shouldDisableSync) {
                console.warn(
                    `Disabling Google sheets scheduler with non-retryable error: ${e}`,
                );

                await this.schedulerService.setSchedulerEnabled(
                    user!, // This error from gdriveClient happens after user initialized
                    schedulerUuid,
                    false,
                );

                if (user?.email) {
                    await this.emailClient.sendGoogleSheetsErrorNotificationEmail(
                        user.email,
                        scheduler?.name || 'Unknown',
                        deliveryUrl,
                    );
                }
                return; // Do not cascade error
            }
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async logScheduledTarget(
        format: SchedulerFormat,
        target: CreateSchedulerTarget | undefined,
        targetJobId: string,
        schedulerUuid: string | undefined,
        jobId: string,
        scheduledTime: Date,
        details: {
            projectUuid: string;
            organizationUuid: string;
            createdByUserUuid: string;
        },
    ) {
        if (format === SchedulerFormat.GSHEETS) {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                target: undefined,
                targetType: 'gsheets',
                jobId: targetJobId,
                schedulerUuid,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.SCHEDULED,
                details,
            });
            return;
        }
        if (target === undefined) {
            Logger.error(`Missing target for scheduler format ${format}`);
            return;
        }
        const getTargetDetails = (): Pick<
            CreateSchedulerLog,
            'task' | 'target' | 'targetType'
        > => {
            if (isCreateSchedulerSlackTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                    target: target.channel,
                    targetType: 'slack',
                };
            }

            if (isCreateSchedulerMsTeamsTarget(target)) {
                return {
                    task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                    target: target.webhook,
                    targetType: 'msteams',
                };
            }
            return {
                task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                target: target.recipient,
                targetType: 'email',
            };
        };
        const { task, target: jobTarget, targetType } = getTargetDetails();

        await this.schedulerService.logSchedulerJob({
            task,
            target: jobTarget,
            targetType,
            jobId: targetJobId,
            schedulerUuid,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.SCHEDULED,
            details,
        });
    }

    protected async handleScheduledDelivery(
        jobId: string,
        scheduledTime: Date,
        schedulerPayload: ScheduledDeliveryPayload,
    ) {
        const schedulerUuid = getSchedulerUuid(schedulerPayload);

        const scheduler: SchedulerAndTargets | CreateSchedulerAndTargets =
            isCreateScheduler(schedulerPayload)
                ? schedulerPayload
                : await this.schedulerService.schedulerModel.getSchedulerAndTargets(
                      schedulerPayload.schedulerUuid,
                  );

        if (!scheduler.enabled) {
            // This should not happen, if schedulers are not enabled, we should remove the scheduled jobs from the queue
            throw new Error('Scheduler is disabled');
        }

        this.analytics.track({
            event: 'scheduler_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                sendNow: schedulerUuid === undefined,
                isThresholdAlert: scheduler.thresholds !== undefined,
            },
        });
        await this.schedulerService.logSchedulerJob({
            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
            details: {
                projectUuid: schedulerPayload.projectUuid,
                organizationUuid: schedulerPayload.organizationUuid,
                createdByUserUuid: schedulerPayload.userUuid,
            },
        });

        const traceProperties = {
            organizationUuid: schedulerPayload.organizationUuid,
            projectUuid: schedulerPayload.projectUuid,
            userUuid: schedulerPayload.userUuid,
        };

        const {
            createdBy: userUuid,
            savedChartUuid,
            dashboardUuid,
            thresholds,
            notificationFrequency,
        } = scheduler;
        try {
            if (thresholds !== undefined && thresholds.length > 0) {
                // TODO add multiple AND conditions
                if (savedChartUuid) {
                    // We are fetching here the results before getting image or CSV
                    const user = await this.userService.getSessionByUserUuid(
                        userUuid,
                    );
                    const { rows } =
                        await this.projectService.getResultsForChart(
                            user,
                            savedChartUuid,
                            QueryExecutionContext.SCHEDULED_CHART,
                        );

                    if (
                        SchedulerTask.isPositiveThresholdAlert(thresholds, rows)
                    ) {
                        // If the delivery frequency is once, we disable the scheduler.
                        // It will get sent once this time.
                        if (
                            notificationFrequency ===
                                NotificationFrequency.ONCE &&
                            schedulerUuid
                        ) {
                            console.debug(
                                'Alert is set to ONCE, disabling scheduler after delivery',
                            );
                            await this.schedulerService.setSchedulerEnabled(
                                user,
                                schedulerUuid,
                                false,
                            );
                        }
                        console.debug(
                            'Positive threshold alert, continue with notification',
                        );
                    } else {
                        console.debug(
                            'Negative threshold alert, skipping notification',
                        );
                        return;
                    }
                } else if (dashboardUuid) {
                    throw new Error(
                        'Threshold alert not implemented for dashboards',
                    );
                }
            }

            const page =
                scheduler.format === SchedulerFormat.GSHEETS
                    ? undefined
                    : await this.getNotificationPageData(scheduler, jobId);
            const scheduledJobs =
                await this.schedulerClient.generateJobsForSchedulerTargets(
                    scheduledTime,
                    scheduler,
                    page,
                    jobId,
                    traceProperties,
                );

            // Create scheduled jobs for targets
            await Promise.all(
                scheduledJobs.map(({ target, jobId: targetJobId }) =>
                    this.logScheduledTarget(
                        scheduler.format,
                        target,
                        targetJobId,
                        schedulerUuid,
                        jobId,
                        scheduledTime,
                        {
                            projectUuid: schedulerPayload.projectUuid,
                            organizationUuid: schedulerPayload.organizationUuid,
                            createdByUserUuid: schedulerPayload.userUuid,
                        },
                    ),
                ),
            );

            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
                details: {
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });

            this.analytics.track({
                event: 'scheduler_job.completed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });
        } catch (e) {
            this.analytics.track({
                event: 'scheduler_job.failed',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId,
                    schedulerId: schedulerUuid,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: {
                    error: getErrorMessage(e),
                    projectUuid: schedulerPayload.projectUuid,
                    organizationUuid: schedulerPayload.organizationUuid,
                    createdByUserUuid: schedulerPayload.userUuid,
                },
            });

            if (e instanceof NotEnoughResults) {
                Logger.warn(
                    `Scheduler ${schedulerUuid} did not return enough results for threshold alert`,
                );
                // We don't want to retry the error now, but we are not going to disable the scheduler.
                return; // Do not cascade error
            }

            if (e instanceof FieldReferenceError) {
                // This captures both the error from thresholdAlert and metricQuery
                Logger.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                const user = await this.userService.getSessionByUserUuid(
                    scheduler.createdBy,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user,
                    schedulerUuid!,
                    false,
                );
                return; // Do not cascade error
            }
            throw e; // Cascade error to it can be retried by graphile
        }
    }

    protected async indexCatalog(
        jobId: string,
        scheduledTime: Date,
        payload: SchedulerIndexCatalogJobPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.INDEX_CATALOG,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const { catalogFieldMap } =
                    await this.catalogService.indexCatalog(
                        payload.projectUuid,
                        payload.userUuid,
                    );

                await this.catalogService.migrateCatalogItemTags(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithTags,
                );

                await this.catalogService.migrateCatalogItemIcons(
                    payload.projectUuid,
                    payload.prevCatalogItemsWithIcons,
                );

                await this.catalogService.migrateMetricsTreeEdges(
                    payload.projectUuid,
                    payload.prevMetricTreeEdges,
                );

                await this.catalogService.setChartUsages(
                    payload.projectUuid,
                    catalogFieldMap,
                );

                return {}; // Don't pollute with more details
            },
        );
    }

    protected async exportCsvDashboard(
        jobId: string,
        scheduledTime: Date,
        payload: ExportCsvDashboardPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const url =
                    await this.csvService.runScheduledExportCsvDashboard(
                        payload,
                    );
                return { url };
            },
        );
    }

    protected async replaceCustomFields(
        jobId: string,
        scheduledTime: Date,
        payload: ReplaceCustomFieldsPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
                jobId,
                scheduledTime,
                details: {
                    userUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                    createdByUserUuid: payload.userUuid,
                },
            },
            async (): Promise<{
                replaceableCustomFields: ReplaceableCustomFields;
                replaceFields: ReplaceCustomFields;
                updatedCharts: Array<Pick<SavedChartDAO, 'uuid' | 'name'>>;
            }> => {
                const replaceableCustomFields =
                    await this.projectService.findReplaceableCustomFields(
                        payload,
                    );
                const replaceFields =
                    convertReplaceableFieldMatchMapToReplaceCustomFields(
                        replaceableCustomFields,
                    );
                const updatedCharts =
                    await this.projectService.replaceCustomFields({
                        userUuid: payload.userUuid,
                        projectUuid: payload.projectUuid,
                        organizationUuid: payload.organizationUuid,
                        replaceFields,
                        skipChartsUpdatedAfter: scheduledTime,
                    });
                return {
                    replaceableCustomFields,
                    replaceFields,
                    updatedCharts,
                };
            },
        );
    }

    protected async renameResources(
        jobId: string,
        scheduledTime: Date,
        payload: RenameResourcesPayload,
    ) {
        await this.logWrapper(
            {
                task: SCHEDULER_TASKS.RENAME_RESOURCES,
                jobId,
                scheduledTime,
                details: {
                    createdByUserUuid: payload.userUuid,
                    projectUuid: payload.projectUuid,
                    organizationUuid: payload.organizationUuid,
                },
            },
            async () => {
                const results =
                    await this.renameService.runScheduledRenameResources(
                        payload,
                    );
                return { results };
            },
        );
    }
}
