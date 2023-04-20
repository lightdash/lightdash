import {
    DownloadCsvPayload,
    EmailNotificationPayload,
    getHumanReadableCronExpression,
    isEmailTarget,
    isSchedulerCsvOptions,
    isSlackTarget,
    LightdashPage,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    Scheduler,
    SchedulerJobStatus,
    SchedulerLog,
    SlackNotificationPayload,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import { analytics } from '../analytics/client';
import {
    DownloadCsv,
    LightdashAnalytics,
    parseAnalyticsLimit,
} from '../analytics/LightdashAnalytics';
import { emailClient, schedulerClient, slackClient } from '../clients/clients';
import {
    getChartAndDashboardBlocks,
    getChartCsvResultsBlocks,
    getDashboardCsvResultsBlocks,
} from '../clients/Slack/SlackMessageBlocks';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logger';
import {
    csvService,
    s3Service,
    schedulerService,
    unfurlService,
    userService,
} from '../services/services';

const getChartOrDashboard = async (
    chartUuid: string | null,
    dashboardUuid: string | null,
) => {
    if (chartUuid) {
        const chart = await schedulerService.savedChartModel.get(chartUuid);
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
            minimalUrl: `${lightdashConfig.siteUrl}/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboardUuid}`,
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
    scheduler: Scheduler,
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
    const {
        url,
        minimalUrl,
        pageType,
        details,
        organizationUuid,
        projectUuid,
    } = await getChartOrDashboard(savedChartUuid, dashboardUuid);
    if (format === 'image') {
        imageUrl = await unfurlService.unfurlImage(
            minimalUrl,
            pageType,
            `slack-image-notification-${nanoid()}`,
            userUuid,
        );
        if (imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
    } else {
        const user = await userService.getSessionByUserUuid(userUuid);
        const csvOptions = isSchedulerCsvOptions(options) ? options : undefined;

        const baseAnalyticsProperties: DownloadCsv['properties'] = {
            jobId,
            userId: userUuid,
            organizationId: user.organizationUuid,
            projectId: projectUuid,
            fileType: 'csv',
            values: csvOptions?.formatted ? 'formatted' : 'raw',
            limit: parseAnalyticsLimit(csvOptions?.limit),
            storage: s3Service.isEnabled() ? 's3' : 'local',
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
    }

    return {
        url,
        pageType,
        details,
        organizationUuid,
        imageUrl,
        csvUrl,
        csvUrls,
    };
};

export const sendSlackNotification = async (
    jobId: string,
    notification: SlackNotificationPayload,
) => {
    const { schedulerUuid, schedulerSlackTargetUuid, scheduledTime } =
        notification;
    analytics.track({
        event: 'scheduler_notification_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerSlackTargetUuid,
            type: 'slack',
        },
    });

    try {
        if (!slackClient.isEnabled) {
            throw new Error('Slack app is not configured');
        }

        const scheduler =
            await schedulerService.schedulerModel.getSchedulerAndTargets(
                schedulerUuid,
            );
        const { format, savedChartUuid, dashboardUuid, name, targets, cron } =
            scheduler;

        const target = targets
            .filter(isSlackTarget)
            .find(
                (t) => t.schedulerSlackTargetUuid === schedulerSlackTargetUuid,
            );

        if (!target) {
            throw new Error('Slack destination not found');
        }
        const { channel } = target;
        schedulerService.logSchedulerJob({
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
        const {
            url,
            details,
            pageType,
            organizationUuid,
            imageUrl,
            csvUrl,
            csvUrls,
        } =
            notification.page ??
            (await getNotificationPageData(scheduler, jobId));

        const getBlocksArgs = {
            title: name,
            description: `${details.name}${
                details.description ? ` - ${details.description}` : ''
            }`,
            ctaUrl: url,
            footerMarkdown: `This is a <${url}?scheduler_uuid=${schedulerUuid}|scheduled delivery> ${getHumanReadableCronExpression(
                cron,
            )} from Lightdash`,
        };

        if (format === 'image') {
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
            },
        });
        schedulerService.logSchedulerJob({
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
            },
        });
        schedulerService.logSchedulerJob({
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
        schedulerService.logSchedulerJob({
            ...baseLog,
            details: { createdByUserUuid: payload.userUuid },
            status: SchedulerJobStatus.STARTED,
        });

        const fileUrl = await csvService.downloadCsv(jobId, payload);
        schedulerService.logSchedulerJob({
            ...baseLog,
            details: { fileUrl, createdByUserUuid: payload.userUuid },
            status: SchedulerJobStatus.COMPLETED,
        });
    } catch (e) {
        schedulerService.logSchedulerJob({
            ...baseLog,
            status: SchedulerJobStatus.ERROR,
            details: { createdByUserUuid: payload.userUuid, error: e },
        });
        throw e; // Cascade error to it can be retried by graphile
    }
};

export const sendEmailNotification = async (
    jobId: string,
    notification: EmailNotificationPayload,
) => {
    const { schedulerUuid, schedulerEmailTargetUuid, scheduledTime } =
        notification;

    analytics.track({
        event: 'scheduler_notification_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerEmailTargetUuid,
            type: 'email',
        },
    });

    try {
        const scheduler =
            await schedulerService.schedulerModel.getSchedulerAndTargets(
                schedulerUuid,
            );
        const { format, savedChartUuid, dashboardUuid, name, targets } =
            scheduler;

        const target = targets
            .filter(isEmailTarget)
            .find(
                (t) => t.schedulerEmailTargetUuid === schedulerEmailTargetUuid,
            );

        if (!target) {
            throw new Error('Email destination not found');
        }
        const { recipient } = target;
        schedulerService.logSchedulerJob({
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
        const { url, details, pageType, imageUrl, csvUrl, csvUrls } =
            notification.page ??
            (await getNotificationPageData(scheduler, jobId));
        const schedulerUrl = `${url}?scheduler_uuid=${schedulerUuid}`;

        if (format === 'image') {
            if (imageUrl === undefined) {
                throw new Error('Missing image URL');
            }
            await emailClient.sendImageNotificationEmail(
                recipient,
                name,
                details.name,
                details.description || '',
                new Date().toLocaleDateString('en-GB'),
                getHumanReadableCronExpression(scheduler.cron),
                imageUrl,
                url,
                schedulerUrl,
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
                new Date().toLocaleDateString('en-GB'),
                getHumanReadableCronExpression(scheduler.cron),
                csvUrl,
                url,
                schedulerUrl,
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
                new Date().toLocaleDateString('en-GB'),
                getHumanReadableCronExpression(scheduler.cron),
                csvUrls,
                url,
                schedulerUrl,
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
                resourceType:
                    pageType === LightdashPage.CHART ? 'chart' : 'dashboard',
            },
        });
        schedulerService.logSchedulerJob({
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
            },
        });
        schedulerService.logSchedulerJob({
            task: 'sendEmailNotification',
            schedulerUuid,
            jobId,
            jobGroup: notification.jobGroup,
            scheduledTime,
            targetType: 'email',
            status: SchedulerJobStatus.ERROR,
            details: e,
        });

        throw e; // Cascade error to it can be retried by graphile
    }
};

export const handleScheduledDelivery = async (
    jobId: string,
    scheduledTime: Date,
    { schedulerUuid }: ScheduledDeliveryPayload,
) => {
    try {
        analytics.track({
            event: 'scheduler_job.started',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
            },
        });
        schedulerService.logSchedulerJob({
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobId,
            jobGroup: jobId,
            scheduledTime,
            status: SchedulerJobStatus.STARTED,
        });

        const scheduler =
            await schedulerService.schedulerModel.getSchedulerAndTargets(
                schedulerUuid,
            );
        const page = await getNotificationPageData(scheduler, jobId);
        const scheduledJobs =
            await schedulerClient.generateJobsForSchedulerTargets(
                scheduledTime,
                scheduler,
                page,
                jobId,
            );

        // Create scheduled jobs for targets
        scheduledJobs.map(async ({ target, jobId: targetJobId }) => {
            await schedulerService.logSchedulerJob({
                task: isSlackTarget(target)
                    ? 'sendSlackNotification'
                    : 'sendEmailNotification',
                schedulerUuid: scheduler.schedulerUuid,
                jobId: targetJobId,
                jobGroup: jobId,
                scheduledTime,
                target: isSlackTarget(target)
                    ? target.channel
                    : target.recipient,
                targetType: isSlackTarget(target) ? 'slack' : 'email',
                status: SchedulerJobStatus.SCHEDULED,
            });
        });

        schedulerService.logSchedulerJob({
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
        schedulerService.logSchedulerJob({
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
