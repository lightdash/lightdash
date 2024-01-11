import {
    assertUnreachable,
    CompileProjectPayload,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    CreateSchedulerTarget,
    DownloadCsvPayload,
    EmailNotificationPayload,
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
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    SchedulerAndTargets,
    SchedulerFilterRule,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerLog,
    SlackNotificationPayload,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import slackifyMarkdown from 'slackify-markdown';
import { analytics } from '../analytics/client';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
    QueryExecutionContext,
} from '../analytics/LightdashAnalytics';
import {
    emailClient,
    googleDriveClient,
    s3Client,
    schedulerClient,
    slackClient,
} from '../clients/clients';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getDashboardCsvResultsBlocks,
    getNotificationChannelErrorBlocks,
} from '../clients/Slack/SlackMessageBlocks';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logging/logger';
import {
    csvService,
    dashboardService,
    projectService,
    schedulerService,
    unfurlService,
    userService,
    validationService,
} from '../services/services';

const getChartOrDashboard = async (
    chartUuid: string | null,
    dashboardUuid: string | null,
    schedulerUuid: string | undefined,
    sendNowSchedulerFilters: SchedulerFilterRule[] | undefined,
) => {
    if (chartUuid) {
        const chart = await schedulerService.savedChartModel.getSummary(
            chartUuid,
        );
        return {
            url: `${lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
            minimalUrl: `${lightdashConfig.siteUrl}/minimal/projects/${chart.projectUuid}/saved/${chartUuid}`,
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
        const dashboard = await schedulerService.dashboardModel.getById(
            dashboardUuid,
        );

        return {
            url: `${lightdashConfig.siteUrl}/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}/view`,
            minimalUrl: `${lightdashConfig.siteUrl}/minimal/projects/${
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
};

export const getNotificationPageData = async (
    scheduler: CreateSchedulerAndTargets,
    jobId: string,
): Promise<NotificationPayloadBase['page']> => {
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
    } = await getChartOrDashboard(
        savedChartUuid,
        dashboardUuid,
        schedulerUuid,
        sendNowSchedulerFilters,
    );

    switch (format) {
        case SchedulerFormat.IMAGE:
            try {
                const imageId = `slack-image-notification-${nanoid()}`;
                const imageOptions = isSchedulerImageOptions(scheduler.options)
                    ? scheduler.options
                    : undefined;
                const unfurlImage = await unfurlService.unfurlImage({
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
                if (slackClient.isEnabled) {
                    await slackClient.postMessageToNotificationChannel({
                        organizationUuid,
                        text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                        blocks: getNotificationChannelErrorBlocks(
                            scheduler.name,
                            error,
                        ),
                    });
                }

                throw error;
            }
            break;
        case SchedulerFormat.GSHEETS:
            // We don't generate CSV files for Google sheets on handleNotification task,
            // instead we directly upload the data from the row results in the uploadGsheets task
            throw new Error("Don't fetch csv for gsheets");
        case SchedulerFormat.CSV:
            const user = await userService.getSessionByUserUuid(userUuid);
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
                storage: s3Client.isEnabled() ? 's3' : 'local',
            };

            try {
                if (savedChartUuid) {
                    csvUrl = await csvService.getCsvForChart(
                        user,
                        savedChartUuid,
                        csvOptions,
                        jobId,
                    );
                } else if (dashboardUuid) {
                    analytics.track({
                        event: 'download_results.started',
                        userId: userUuid,
                        properties: {
                            ...baseAnalyticsProperties,
                            context: 'scheduled delivery dashboard',
                        },
                    });

                    csvUrls = await csvService.getCsvsForDashboard(
                        user,
                        dashboardUuid,
                        csvOptions,
                        isDashboardScheduler(scheduler)
                            ? scheduler.filters
                            : undefined,
                    );

                    analytics.track({
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
                Logger.error(`Unable to download CSV on scheduled task: ${e}`);

                if (slackClient.isEnabled) {
                    await slackClient.postMessageToNotificationChannel({
                        organizationUuid,
                        text: `Error sending Scheduled Delivery: ${scheduler.name}`,
                        blocks: getNotificationChannelErrorBlocks(
                            scheduler.name,
                            e,
                        ),
                    });
                }

                analytics.track({
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
};

export const sendSlackNotification = async (
    jobId: string,
    notification: SlackNotificationPayload,
) => {
    const {
        schedulerUuid,
        schedulerSlackTargetUuid,
        channel,
        scheduledTime,
        scheduler,
    } = notification;
    analytics.track({
        event: 'scheduler_notification_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerSlackTargetUuid,
            type: 'slack',
            sendNow: schedulerUuid === undefined,
        },
    });

    try {
        if (!slackClient.isEnabled) {
            throw new Error('Slack app is not configured');
        }

        const { format, savedChartUuid, dashboardUuid, name, cron } = scheduler;

        await schedulerService.logSchedulerJob({
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
            (await getNotificationPageData(scheduler, jobId));

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
            message: scheduler.message && slackifyMarkdown(scheduler.message),
            ctaUrl: url,
            footerMarkdown: `This is a <${url}?scheduler_uuid=${
                schedulerUuid || ''
            }|scheduled delivery> ${getHumanReadableCronExpression(
                cron,
            )} from Lightdash\n${s3Client.getExpirationWarning()?.slack || ''}`,
        };

        if (format === SchedulerFormat.IMAGE) {
            if (imageUrl === undefined) {
                throw new Error('Missing image URL');
            }

            const blocks = getChartAndDashboardBlocks({
                ...getBlocksArgs,
                imageUrl,
            });

            await slackClient.postMessage({
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
                        csvUrl.path !== '#no-results' ? csvUrl.path : undefined,
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
            await slackClient.postMessage({
                organizationUuid,
                text: name,
                channel,
                blocks,
            });
        }
        analytics.track({
            event: 'scheduler_notification_job.completed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                type: 'slack',
                format,
                resourceType:
                    pageType === LightdashPage.CHART ? 'chart' : 'dashboard',
                sendNow: schedulerUuid === undefined,
            },
        });
        await schedulerService.logSchedulerJob({
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
        analytics.track({
            event: 'scheduler_notification_job.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                error: `${e}`,
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                type: 'slack',
                sendNow: schedulerUuid === undefined,
            },
        });
        await schedulerService.logSchedulerJob({
            task: 'sendSlackNotification',
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,

            scheduledTime,
            targetType: 'slack',
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
        });

        throw e; // Cascade error to it can be retried by graphile
    }
};

export const testAndCompileProject = async (
    jobId: string,
    scheduledTime: Date,
    payload: CompileProjectPayload,
) => {
    const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> = {
        task: 'compileProject',
        jobId,
        scheduledTime,
    };
    try {
        const user = await userService.getSessionByUserUuid(
            payload.createdByUserUuid,
        );

        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: { createdByUserUuid: payload.createdByUserUuid },
            status: SchedulerJobStatus.STARTED,
        });

        await projectService.testAndCompileProject(
            user,
            payload.projectUuid,
            getRequestMethod(payload.requestMethod),
            payload.jobUuid,
        );

        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: {},
            status: SchedulerJobStatus.COMPLETED,
        });
        if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
            schedulerClient.generateValidation({
                userUuid: payload.createdByUserUuid,
                projectUuid: payload.projectUuid,
                context: 'test_and_compile',
                organizationUuid: user.organizationUuid,
            });
        }
    } catch (e) {
        await schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.ERROR,
            details: { createdByUserUuid: payload.createdByUserUuid, error: e },
        });
        throw e;
    }
};

export const compileProject = async (
    jobId: string,
    scheduledTime: Date,
    payload: CompileProjectPayload,
) => {
    const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> = {
        task: 'compileProject',
        jobId,
        scheduledTime,
    };
    try {
        const user = await userService.getSessionByUserUuid(
            payload.createdByUserUuid,
        );

        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: { createdByUserUuid: payload.createdByUserUuid },
            status: SchedulerJobStatus.STARTED,
        });

        await projectService.compileProject(
            user,
            payload.projectUuid,
            getRequestMethod(payload.requestMethod),
            payload.jobUuid,
        );
        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: {},
            status: SchedulerJobStatus.COMPLETED,
        });
        if (process.env.IS_PULL_REQUEST !== 'true' && !payload.isPreview) {
            schedulerClient.generateValidation({
                projectUuid: payload.projectUuid,
                context: 'dbt_refresh',
                userUuid: payload.createdByUserUuid,
                organizationUuid: user.organizationUuid,
            });
        }
    } catch (e) {
        await schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.ERROR,
            details: { createdByUserUuid: payload.createdByUserUuid, error: e },
        });
        throw e;
    }
};

export const validateProject = async (
    jobId: string,
    scheduledTime: Date,
    payload: ValidateProjectPayload,
) => {
    await schedulerService.logSchedulerJob({
        task: 'validateProject',
        jobId,
        scheduledTime,
        status: SchedulerJobStatus.STARTED,
    });

    analytics.track({
        event: 'validation.run',
        userId: payload.userUuid,
        properties: {
            context: payload.context,
            organizationId: payload.organizationUuid,
            projectId: payload.projectUuid,
        },
    });
    try {
        const errors = await validationService.generateValidation(
            payload.projectUuid,
            payload.explores,
        );

        const contentIds = errors.map((validation) => {
            if (isChartValidationError(validation)) return validation.chartUuid;
            if (isDashboardValidationError(validation))
                return validation.dashboardUuid;

            return validation.name;
        });

        await validationService.storeValidation(
            payload.projectUuid,
            errors,
            payload.explores ? jobId : undefined,
        );

        analytics.track({
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

        await schedulerService.logSchedulerJob({
            task: 'validateProject',
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.COMPLETED,
        });
    } catch (e) {
        analytics.track({
            event: 'validation.error',
            userId: payload.userUuid,
            properties: {
                context: payload.context,
                organizationId: payload.organizationUuid,
                projectId: payload.projectUuid,
                error: e.message,
            },
        });

        await schedulerService.logSchedulerJob({
            task: 'validateProject',
            jobId,
            scheduledTime,
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
        });
    }
};

export const downloadCsv = async (
    jobId: string,
    scheduledTime: Date,
    payload: DownloadCsvPayload,
) => {
    const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> = {
        task: 'downloadCsv',
        jobId,
        scheduledTime,
    };
    try {
        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: { createdByUserUuid: payload.userUuid },
            status: SchedulerJobStatus.STARTED,
        });

        const { fileUrl, truncated } = await csvService.downloadCsv(
            jobId,
            payload,
        );
        await schedulerService.logSchedulerJob({
            ...baseLog,
            details: {
                fileUrl,
                createdByUserUuid: payload.userUuid,
                truncated,
            },
            status: SchedulerJobStatus.COMPLETED,
        });
    } catch (e) {
        await schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.ERROR,
            details: { createdByUserUuid: payload.userUuid, error: e },
        });
        throw e; // Cascade error to it can be retried by graphile
    }
};

export const uploadGsheetFromQuery = async (
    jobId: string,
    scheduledTime: Date,
    payload: UploadMetricGsheetPayload,
) => {
    const baseLog: Pick<SchedulerLog, 'task' | 'jobId' | 'scheduledTime'> = {
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
        if (!googleDriveClient.isEnabled) {
            throw new Error(
                'Unable to upload Google Sheet from query, Google Drive is not enabled',
            );
        }
        schedulerService.logSchedulerJob({
            ...baseLog,
            details: { createdByUserUuid: payload.userUuid },
            status: SchedulerJobStatus.STARTED,
        });

        analytics.track({
            event: 'download_results.started',
            userId: payload.userUuid,
            properties: analyticsProperties,
        });
        const user = await userService.getSessionByUserUuid(payload.userUuid);

        const { rows } = await projectService.runMetricQuery({
            user,
            metricQuery: payload.metricQuery,
            projectUuid: payload.projectUuid,
            exploreName: payload.exploreId,
            csvLimit: undefined,
            context: QueryExecutionContext.GSHEETS,
        });
        const refreshToken = await userService.getRefreshToken(
            payload.userUuid,
        );
        const { spreadsheetId, spreadsheetUrl } =
            await googleDriveClient.createNewSheet(
                refreshToken,
                payload.exploreId,
            );

        if (!spreadsheetId) {
            throw new Error('Unable to create new sheet');
        }

        const explore = await projectService.getExplore(
            user,
            payload.projectUuid,
            payload.exploreId,
        );
        const itemMap = getItemMap(
            explore,
            payload.metricQuery.additionalMetrics,
            payload.metricQuery.tableCalculations,
        );
        await googleDriveClient.appendToSheet(
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
        const truncated = csvService.couldBeTruncated(rows);

        schedulerService.logSchedulerJob({
            ...baseLog,
            details: {
                fileUrl: spreadsheetUrl,
                createdByUserUuid: payload.userUuid,
                truncated,
            },
            status: SchedulerJobStatus.COMPLETED,
        });
        analytics.track({
            event: 'download_results.completed',
            userId: payload.userUuid,
            properties: analyticsProperties,
        });
    } catch (e) {
        schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.ERROR,
            details: { createdByUserUuid: payload.userUuid, error: e },
        });
        analytics.track({
            event: 'download_results.error',
            userId: payload.userUuid,
            properties: analyticsProperties,
        });
        throw e; // Cascade error to it can be retried by graphile
    }
};

export const sendEmailNotification = async (
    jobId: string,
    notification: EmailNotificationPayload,
) => {
    const {
        schedulerUuid,
        schedulerEmailTargetUuid,
        recipient,
        scheduledTime,
        scheduler,
    } = notification;

    analytics.track({
        event: 'scheduler_notification_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerEmailTargetUuid,
            type: 'email',
            sendNow: schedulerUuid === undefined,
        },
    });

    try {
        const { format, savedChartUuid, dashboardUuid, name } = scheduler;

        await schedulerService.logSchedulerJob({
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
            (await getNotificationPageData(scheduler, jobId));

        const { url, details, pageType, imageUrl, csvUrl, csvUrls, pdfFile } =
            notificationPageData;

        const schedulerUrl = `${url}?scheduler_uuid=${schedulerUuid}`;

        if (format === SchedulerFormat.IMAGE) {
            if (imageUrl === undefined) {
                throw new Error('Missing image URL');
            }
            await emailClient.sendImageNotificationEmail(
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
                s3Client.getExpirationWarning()?.days,
            );
        } else if (savedChartUuid) {
            if (csvUrl === undefined) {
                throw new Error('Missing CSV URL');
            }
            await emailClient.sendChartCsvNotificationEmail(
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
                s3Client.getExpirationWarning()?.days,
            );
        } else if (dashboardUuid) {
            if (csvUrls === undefined) {
                throw new Error('Missing CSV URLS');
            }
            await emailClient.sendDashboardCsvNotificationEmail(
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
                s3Client.getExpirationWarning()?.days,
            );
        } else {
            throw new Error('Not implemented');
        }

        analytics.track({
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
                    pageType === LightdashPage.CHART ? 'chart' : 'dashboard',
                sendNow: schedulerUuid === undefined,
            },
        });
        await schedulerService.logSchedulerJob({
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
        analytics.track({
            event: 'scheduler_notification_job.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                error: `${e}`,
                jobId,
                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerEmailTargetUuid,
                type: 'email',
                sendNow: schedulerUuid === undefined,
            },
        });
        await schedulerService.logSchedulerJob({
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
};

export const uploadGsheets = async (
    jobId: string,
    notification: GsheetsNotificationPayload,
) => {
    const { schedulerUuid, scheduledTime } = notification;

    analytics.track({
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

    try {
        if (!googleDriveClient.isEnabled) {
            throw new Error(
                'Unable to upload Google Sheet from scheduler, Google Drive is not enabled',
            );
        }

        const scheduler =
            await schedulerService.schedulerModel.getSchedulerAndTargets(
                schedulerUuid,
            );
        const { format, savedChartUuid, dashboardUuid } = scheduler;

        const gdriveId = isSchedulerGsheetsOptions(scheduler.options)
            ? scheduler.options.gdriveId
            : undefined;
        if (gdriveId === undefined) {
            throw new Error('Missing gdriveId');
        }

        await schedulerService.logSchedulerJob({
            task: 'uploadGsheets',
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            target: gdriveId,
            targetType: 'gsheets',
            status: SchedulerJobStatus.STARTED,
        });
        const user = await userService.getSessionByUserUuid(
            scheduler.createdBy,
        );

        if (format !== SchedulerFormat.GSHEETS) {
            throw new Error(
                `Unable to process format ${format} on sendGdriveNotification`,
            );
        } else if (savedChartUuid) {
            const chart = await schedulerService.savedChartModel.get(
                savedChartUuid,
            );
            const { rows } = await projectService.getResultsForChart(
                user,
                savedChartUuid,
            );

            const explore = await projectService.getExplore(
                user,
                chart.projectUuid,
                chart.tableName,
            );
            const itemMap = getItemMap(
                explore,
                chart.metricQuery.additionalMetrics,
                chart.metricQuery.tableCalculations,
            );
            const showTableNames = isTableChartConfig(chart.chartConfig.config)
                ? chart.chartConfig.config.showTableNames ?? false
                : true;
            const customLabels = getCustomLabelsFromTableConfig(
                chart.chartConfig.config,
            );

            const refreshToken = await userService.getRefreshToken(
                scheduler.createdBy,
            );
            await googleDriveClient.uploadMetadata(
                refreshToken,
                gdriveId,
                getHumanReadableCronExpression(scheduler.cron),
            );

            await googleDriveClient.appendToSheet(
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
            const dashboard = await dashboardService.getById(
                user,
                dashboardUuid,
            );
            const chartUuids = dashboard.tiles.reduce<string[]>((acc, tile) => {
                if (
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid
                ) {
                    return [...acc, tile.properties.savedChartUuid];
                }
                return acc;
            }, []);

            const refreshToken = await userService.getRefreshToken(
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
                            tile?.properties.title || chartName || chartUuid,
                    };
                },
                {},
            );

            await googleDriveClient.uploadMetadata(
                refreshToken,
                gdriveId,
                getHumanReadableCronExpression(scheduler.cron),
                Object.values(chartNames),
            );

            Logger.debug(
                `Uploading dashboard with ${chartUuids.length} charts to Google Sheets`,
            );
            // We want to process all charts in sequence, so we don't load all chart results in memory
            chartUuids.reduce(async (promise, chartUuid) => {
                await promise;
                const chart = await schedulerService.savedChartModel.get(
                    chartUuid,
                );
                const { rows } = await projectService.getResultsForChart(
                    user,
                    chartUuid,
                );
                const explore = await projectService.getExplore(
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

                const tabName = await googleDriveClient.createNewTab(
                    refreshToken,
                    gdriveId,
                    chartNames[chartUuid] || chartUuid,
                );

                await googleDriveClient.appendToSheet(
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
            }, Promise.resolve());
        } else {
            throw new Error('Not implemented');
        }

        analytics.track({
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
        await schedulerService.logSchedulerJob({
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
        analytics.track({
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
        await schedulerService.logSchedulerJob({
            task: 'uploadGsheets',
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'gsheets',
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
        });

        throw e; // Cascade error to it can be retried by graphile
    }
};

const logScheduledTarget = async (
    format: SchedulerFormat,
    target: CreateSchedulerTarget | undefined,
    targetJobId: string,
    schedulerUuid: string | undefined,
    jobId: string,
    scheduledTime: Date,
) => {
    if (format === SchedulerFormat.GSHEETS) {
        await schedulerService.logSchedulerJob({
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

    await schedulerService.logSchedulerJob({
        task,
        target: jobTarget,
        targetType,
        jobId: targetJobId,
        schedulerUuid,
        jobGroup: jobId,
        scheduledTime,
        status: SchedulerJobStatus.SCHEDULED,
    });
};

export const handleScheduledDelivery = async (
    jobId: string,
    scheduledTime: Date,
    schedulerPayload: ScheduledDeliveryPayload,
) => {
    const schedulerUuid = getSchedulerUuid(schedulerPayload);

    try {
        const scheduler: SchedulerAndTargets | CreateSchedulerAndTargets =
            isCreateScheduler(schedulerPayload)
                ? schedulerPayload
                : await schedulerService.schedulerModel.getSchedulerAndTargets(
                      schedulerPayload.schedulerUuid,
                  );

        analytics.track({
            event: 'scheduler_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
                sendNow: schedulerUuid === undefined,
            },
        });
        await schedulerService.logSchedulerJob({
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
        });

        const page =
            scheduler.format === SchedulerFormat.GSHEETS
                ? undefined
                : await getNotificationPageData(scheduler, jobId);
        const scheduledJobs =
            await schedulerClient.generateJobsForSchedulerTargets(
                scheduledTime,
                scheduler,
                page,
                jobId,
            );

        // Create scheduled jobs for targets
        scheduledJobs.map(async ({ target, jobId: targetJobId }) => {
            logScheduledTarget(
                scheduler.format,
                target,
                targetJobId,
                schedulerUuid,
                jobId,
                scheduledTime,
            );
        });

        await schedulerService.logSchedulerJob({
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.COMPLETED,
        });

        analytics.track({
            event: 'scheduler_job.completed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
            },
        });
    } catch (e) {
        analytics.track({
            event: 'scheduler_job.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
            },
        });
        await schedulerService.logSchedulerJob({
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
        });

        throw e; // Cascade error to it can be retried by graphile
    }
};
