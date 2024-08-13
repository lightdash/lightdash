import {
    assertUnreachable,
    CompileProjectPayload,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    CreateSchedulerTarget,
    DownloadCsvPayload,
    EmailNotificationPayload,
    FieldReferenceError,
    friendlyName,
    getCustomLabelsFromTableConfig,
    getHiddenTableFields,
    getHumanReadableCronExpression,
    getItemMap,
    getRequestMethod,
    getSchedulerUuid,
    GsheetsNotificationPayload,
    isChartValidationError,
    isCreateScheduler,
    isCreateSchedulerSlackTarget,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardValidationError,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isTableChartConfig,
    LightdashPage,
    NotEnoughResults,
    NotificationFrequency,
    NotificationPayloadBase,
    operatorActionValue,
    ScheduledDeliveryPayload,
    SchedulerAndTargets,
    SchedulerFilterRule,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerLog,
    semanticLayerQueryJob,
    SemanticLayerQueryPayload,
    SessionUser,
    SlackInstallationNotFoundError,
    SlackNotificationPayload,
    SqlColumn,
    sqlRunnerJob,
    SqlRunnerPayload,
    ThresholdOperator,
    ThresholdOptions,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import slackifyMarkdown from 'slackify-markdown';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
    QueryExecutionContext,
} from '../analytics/LightdashAnalytics';
import { S3Client } from '../clients/Aws/s3';
import EmailClient from '../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../clients/Google/GoogleDriveClient';
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
import { CsvService } from '../services/CsvService/CsvService';
import { DashboardService } from '../services/DashboardService/DashboardService';
import { ProjectService } from '../services/ProjectService/ProjectService';
import { SchedulerService } from '../services/SchedulerService/SchedulerService';
import { SemanticLayerService } from '../services/SemanticLayerService/SemanticLayerService';
import { UnfurlService } from '../services/UnfurlService/UnfurlService';
import { UserService } from '../services/UserService';
import { ValidationService } from '../services/ValidationService/ValidationService';
import { SchedulerClient } from './SchedulerClient';

type SchedulerTaskArguments = {
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
    semanticLayerService: SemanticLayerService;
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

    private readonly semanticLayerService: SemanticLayerService;

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
        this.semanticLayerService = args.semanticLayerService;
    }

    protected async getChartOrDashboard(
        chartUuid: string | null,
        dashboardUuid: string | null,
        schedulerUuid: string | undefined,
        sendNowSchedulerFilters: SchedulerFilterRule[] | undefined,
    ) {
        if (chartUuid) {
            const chart =
                await this.schedulerService.savedChartModel.getSummary(
                    chartUuid,
                );
            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
                minimalUrl: `${this.lightdashConfig.siteUrl}/minimal/projects/${chart.projectUuid}/saved/${chartUuid}`,
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

            return {
                url: `${this.lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view`,
                minimalUrl: `${this.lightdashConfig.siteUrl}/minimal/projects/${
                    dashboard.projectUuid
                }/dashboards/${dashboardUuid}${
                    schedulerUuid ? `?schedulerUuid=${schedulerUuid}` : ''
                }${
                    sendNowSchedulerFilters
                        ? `?sendNowchedulerFilters=${encodeURI(
                              JSON.stringify(sendNowSchedulerFilters),
                          )}`
                        : ''
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
        );

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
                    });
                    if (unfurlImage.imageUrl === undefined) {
                        throw new Error('Unable to unfurl image');
                    }
                    pdfFile = unfurlImage.pdfPath;
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
                                context: 'scheduled delivery dashboard',
                            },
                        });

                        csvUrls = await this.csvService.getCsvsForDashboard(
                            user,
                            dashboardUuid,
                            csvOptions,
                            isDashboardScheduler(scheduler)
                                ? scheduler.filters
                                : undefined,
                        );

                        this.analytics.track({
                            event: 'download_results.completed',
                            userId: userUuid,
                            properties: {
                                ...baseAnalyticsProperties,
                                context: 'scheduled delivery dashboard',
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
                thresholds,
            } = scheduler;

            await this.schedulerService.logSchedulerJob({
                task: 'sendSlackNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: channel,
                targetType: 'slack',
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
                organizationUuid,
                imageUrl,
                csvUrl,
                csvUrls,
                // pdfFile, // TODO: add pdf to slack
            } = notificationPageData;

            const getBlocksArgs = {
                title: name,
                name: details.name,
                description: details.description,
                message:
                    scheduler.message && slackifyMarkdown(scheduler.message),
                ctaUrl: url,
                footerMarkdown: `This is a <${url}?scheduler_uuid=${
                    schedulerUuid || ''
                }|scheduled delivery> ${getHumanReadableCronExpression(
                    cron,
                )} from Lightdash\n${
                    this.s3Client.getExpirationWarning()?.slack || ''
                }`,
            };

            if (thresholds !== undefined && thresholds.length > 0) {
                // We assume the threshold is possitive , so we don't need to get results here
                if (savedChartUuid) {
                    const blocks = getChartThresholdAlertBlocks({
                        ...getBlocksArgs,
                        footerMarkdown: `This is a <${url}?threshold_uuid=${
                            schedulerUuid || ''
                        }|data alert> sent by Lightdash. For security reasons, delivered files expire after ${
                            this.s3Client.getExpirationWarning()?.days || 3
                        } days`,
                        imageUrl,
                        thresholds,
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
                if (imageUrl === undefined) {
                    throw new Error('Missing image URL');
                }

                const blocks = getChartAndDashboardBlocks({
                    ...getBlocksArgs,
                    imageUrl,
                });

                await this.slackClient.postMessage({
                    organizationUuid,
                    text: name,
                    channel,
                    blocks,
                });
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
                task: 'sendSlackNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                target: channel,
                targetType: 'slack',
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
                    schedulerTargetId: schedulerSlackTargetUuid,
                    type: 'slack',
                    sendNow: schedulerUuid === undefined,
                    isThresholdAlert: scheduler.thresholds !== undefined,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: 'sendSlackNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

                scheduledTime,
                targetType: 'slack',
                status: SchedulerJobStatus.ERROR,
                details: { error: e.message },
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

    protected async testAndCompileProject(
        jobId: string,
        scheduledTime: Date,
        payload: CompileProjectPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: 'compileProject',
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { createdByUserUuid: payload.createdByUserUuid },
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
                details: {},
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    userUuid: payload.createdByUserUuid,
                    projectUuid: payload.projectUuid,
                    context: 'test_and_compile',
                    organizationUuid: user.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    error: e,
                },
            });
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
                task: 'compileProject',
                jobId,
                scheduledTime,
            };
        try {
            const user = await this.userService.getSessionByUserUuid(
                payload.createdByUserUuid,
            );

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { createdByUserUuid: payload.createdByUserUuid },
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
                details: {},
                status: SchedulerJobStatus.COMPLETED,
            });
            if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
                void this.schedulerClient.generateValidation({
                    projectUuid: payload.projectUuid,
                    context: 'dbt_refresh',
                    userUuid: payload.createdByUserUuid,
                    organizationUuid: user.organizationUuid,
                });
            }
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: {
                    createdByUserUuid: payload.createdByUserUuid,
                    error: e,
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
            task: 'validateProject',
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
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
                task: 'validateProject',
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            this.analytics.track({
                event: 'validation.error',
                userId: payload.userUuid,
                properties: {
                    context: payload.context,
                    organizationId: payload.organizationUuid,
                    projectId: payload.projectUuid,
                    error: e.message,
                },
            });

            await this.schedulerService.logSchedulerJob({
                task: 'validateProject',
                jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: { error: e.message },
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
                task: 'downloadCsv',
                jobId,
                scheduledTime,
            };
        try {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: { createdByUserUuid: payload.userUuid },
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
                    createdByUserUuid: payload.userUuid,
                    truncated,
                },
                status: SchedulerJobStatus.COMPLETED,
            });
        } catch (e) {
            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                status: SchedulerJobStatus.ERROR,
                details: { createdByUserUuid: payload.userUuid, error: e },
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
                details: { ...baseLog.details, error: e.message },
            });
            Logger.error(`Error in scheduler task: ${e}`);
            throw e;
        }
    }

    protected async semanticLayerQuery(
        jobId: string,
        scheduledTime: Date,
        payload: SemanticLayerQueryPayload,
    ) {
        await this.logWrapper(
            {
                task: semanticLayerQueryJob,
                jobId,
                scheduledTime,
                details: { createdByUserUuid: payload.userUuid },
            },
            async () => {
                const { fileUrl } =
                    await this.semanticLayerService.streamQueryIntoFile(
                        payload,
                    );
                return { fileUrl };
            },
        );
    }

    protected async sqlRunner(
        jobId: string,
        scheduledTime: Date,
        payload: SqlRunnerPayload,
    ) {
        await this.logWrapper<string | SqlColumn[]>(
            {
                task: sqlRunnerJob,
                jobId,
                scheduledTime,
                details: { createdByUserUuid: payload.userUuid },
            },
            async () => {
                const { fileUrl, columns } =
                    await this.projectService.streamSqlQueryIntoFile(payload);
                return { fileUrl, columns };
            },
        );
    }

    protected async uploadGsheetFromQuery(
        jobId: string,
        scheduledTime: Date,
        payload: UploadMetricGsheetPayload,
    ) {
        const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> =
            {
                task: 'uploadGsheetFromQuery',
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
                details: { createdByUserUuid: payload.userUuid },
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

            const { rows } = await this.projectService.runMetricQuery({
                user,
                metricQuery: payload.metricQuery,
                projectUuid: payload.projectUuid,
                exploreName: payload.exploreId,
                csvLimit: undefined,
                context: QueryExecutionContext.GSHEETS,
                chartUuid: undefined,
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
            const truncated = this.csvService.couldBeTruncated(rows);

            await this.schedulerService.logSchedulerJob({
                ...baseLog,
                details: {
                    fileUrl: spreadsheetUrl,
                    createdByUserUuid: payload.userUuid,
                    truncated,
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
                details: { createdByUserUuid: payload.userUuid, error: e },
            });

            this.analytics.track({
                event: 'download_results.error',
                userId: payload.userUuid,
                properties: analyticsProperties,
            });
            throw e; // Cascade error to it can be retried by graphile
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
            const { format, savedChartUuid, dashboardUuid, name, thresholds } =
                scheduler;

            await this.schedulerService.logSchedulerJob({
                task: 'sendEmailNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

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

            const schedulerUrl = `${url}?scheduler_uuid=${schedulerUuid}`;

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
                    pdfFile,
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
                    getHumanReadableCronExpression(scheduler.cron),
                    imageUrl,
                    url,
                    schedulerUrl,
                    pdfFile,
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
                    getHumanReadableCronExpression(scheduler.cron),
                    csvUrl,
                    url,
                    schedulerUrl,
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
                    getHumanReadableCronExpression(scheduler.cron),
                    csvUrls,
                    url,
                    schedulerUrl,
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
                task: 'sendEmailNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,

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
                task: 'sendEmailNotification',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'email',
                status: SchedulerJobStatus.ERROR,
                details: { error: e.message },
            });

            throw e; // Cascade error to it can be retried by graphile
        }
    }

    static isPositiveThresholdAlert(
        thresholds: ThresholdOptions[],
        results: Record<string, any>[],
    ): boolean {
        if (thresholds.length < 1 || results.length < 1) {
            return false;
        }
        const { fieldId, operator, value: thresholdValue } = thresholds[0];

        const getValue = (resultIdx: number) => {
            if (resultIdx >= results.length) {
                throw new NotEnoughResults(
                    `Threshold alert error: Can't find enough results`,
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
        let user: SessionUser;

        try {
            if (!this.googleDriveClient.isEnabled) {
                throw new Error(
                    'Unable to upload Google Sheet from scheduler, Google Drive is not enabled',
                );
            }

            const scheduler =
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

            await this.schedulerService.logSchedulerJob({
                task: 'uploadGsheets',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
                status: SchedulerJobStatus.STARTED,
            });
            user = await this.userService.getSessionByUserUuid(
                scheduler.createdBy,
            );

            if (format !== SchedulerFormat.GSHEETS) {
                throw new Error(
                    `Unable to process format ${format} on sendGdriveNotification`,
                );
            } else if (savedChartUuid) {
                const chart = await this.schedulerService.savedChartModel.get(
                    savedChartUuid,
                );
                const { rows } = await this.projectService.getResultsForChart(
                    user,
                    savedChartUuid,
                    QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                );

                if (thresholds !== undefined && thresholds.length > 0) {
                    throw new Error(
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

                const reportUrl = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chart.uuid}/view?scheduler_uuid=${schedulerUuid}&isSync=true`;
                await this.googleDriveClient.uploadMetadata(
                    refreshToken,
                    gdriveId,
                    getHumanReadableCronExpression(scheduler.cron),
                    undefined,
                    reportUrl,
                );

                await this.googleDriveClient.appendToSheet(
                    refreshToken,
                    gdriveId,
                    rows,
                    itemMap,
                    showTableNames,
                    undefined,
                    chart.tableConfig.columnOrder,
                    customLabels,
                    getHiddenTableFields(chart.chartConfig),
                );
            } else if (dashboardUuid) {
                const dashboard = await this.dashboardService.getById(
                    user,
                    dashboardUuid,
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
                    getHumanReadableCronExpression(scheduler.cron),
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
                                user,
                                chartUuid,
                                QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD,
                            );
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

                        const tabName =
                            await this.googleDriveClient.createNewTab(
                                refreshToken,
                                gdriveId,
                                chartNames[chartUuid] || chartUuid,
                            );

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
                    }, Promise.resolve())
                    .catch((error) => {
                        Logger.debug('Error processing charts:', error);
                        throw error;
                    });
            } else {
                throw new Error('Not implemented');
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
                task: 'uploadGsheets',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                target: gdriveId,
                targetType: 'gsheets',
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
                    schedulerTargetId: undefined,
                    type: 'gsheets',
                    sendNow: schedulerUuid === undefined,
                },
            });
            await this.schedulerService.logSchedulerJob({
                task: 'uploadGsheets',
                schedulerUuid,
                jobId,
                jobGroup: notification.jobGroup,
                scheduledTime,
                targetType: 'gsheets',
                status: SchedulerJobStatus.ERROR,
                details: { error: e.message },
            });

            if (
                `${e}`.includes('invalid_grant') ||
                `${e}`.includes('Requested entity was not found')
            ) {
                console.warn(
                    `Disabling scheduler with non-retryable error: ${e}`,
                );
                await this.schedulerService.setSchedulerEnabled(
                    user!, // This error from gdriveClient happens after user initialized
                    schedulerUuid,
                    false,
                );
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
    ) {
        if (format === SchedulerFormat.GSHEETS) {
            await this.schedulerService.logSchedulerJob({
                task: 'uploadGsheets',
                target: undefined,
                targetType: 'gsheets',
                jobId: targetJobId,
                schedulerUuid,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.SCHEDULED,
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
                    task: 'sendSlackNotification',
                    target: target.channel,
                    targetType: 'slack',
                };
            }
            return {
                task: 'sendEmailNotification',
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
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
        });

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
                    ),
                ),
            );

            await this.schedulerService.logSchedulerJob({
                task: 'handleScheduledDelivery',
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.COMPLETED,
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
                task: 'handleScheduledDelivery',
                schedulerUuid,
                jobId,
                jobGroup: jobId,
                scheduledTime,
                status: SchedulerJobStatus.ERROR,
                details: { error: e.message },
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
}
