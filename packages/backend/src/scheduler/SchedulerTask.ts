import {
    EmailNotificationPayload,
    isEmailTarget,
    isSchedulerCsvOptions,
    isSlackTarget,
    LightdashPage,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    Scheduler,
    SchedulerJobStatus,
    SlackNotificationPayload,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { Job } from 'graphile-worker';
import { nanoid } from 'nanoid';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
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
        };
    }

    throw new Error("Chart or dashboard can't be both undefined");
};

export const getNotificationPageData = async (
    scheduler: Scheduler,
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
    const { url, minimalUrl, pageType, details, organizationUuid } =
        await getChartOrDashboard(savedChartUuid, dashboardUuid);
    if (format === 'image') {
        imageUrl = await unfurlService.unfurlImage(
            minimalUrl,
            pageType,
            `slack-notification-image-${nanoid()}`,
            userUuid,
            3, // up to 3 retries
        );
        if (imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }
    } else {
        const user = await userService.getSessionByUserUuid(userUuid);
        const csvOptions = isSchedulerCsvOptions(options) ? options : undefined;

        if (savedChartUuid) {
            csvUrl = await csvService.getCsvForChart(
                user,
                savedChartUuid,
                csvOptions,
            );
        } else if (dashboardUuid) {
            csvUrls = await csvService.getCsvsForDashboard(
                user,
                dashboardUuid,
                csvOptions,
            );
        } else {
            throw new Error('Not implemented');
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

function getHumanReadableCronExpression(cronExpression: string) {
    const value = cronstrue.toString(cronExpression, {
        verbose: true,
        throwExceptionOnParseError: false,
    });
    return value[0].toLowerCase() + value.slice(1);
}

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
        } = notification.page ?? (await getNotificationPageData(scheduler));

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
                    csvUrl: csvUrl.path,
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
                channel: 'Casdfasdfasdfdsaf',
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
            scheduledTime,
            target: channel,
            targetType: 'slack',
            status: SchedulerJobStatus.COMPLETED,
        });
    } catch (e) {
        Logger.error(`Unable to complete job "${jobId}": ${JSON.stringify(e)}`);
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
            scheduledTime,
            targetType: 'slack',
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
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
            scheduledTime,
            target: recipient,
            targetType: 'email',
            status: SchedulerJobStatus.STARTED,
        });

        // Backwards compatibility for old scheduled deliveries
        const { url, details, pageType, imageUrl, csvUrl, csvUrls } =
            notification.page ?? (await getNotificationPageData(scheduler));

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
                csvUrl,
                url,
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
                csvUrls,
                url,
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
            scheduledTime,
            target: recipient,
            targetType: 'email',
            status: SchedulerJobStatus.COMPLETED,
        });
    } catch (e) {
        Logger.error(`Unable to complete job "${jobId}": ${JSON.stringify(e)}`);
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

        const scheduler =
            await schedulerService.schedulerModel.getSchedulerAndTargets(
                schedulerUuid,
            );
        const page = await getNotificationPageData(scheduler);
        await schedulerClient.generateJobsForSchedulerTargets(scheduler, page);
        analytics.track({
            event: 'scheduler_job.completed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId,
                schedulerId: schedulerUuid,
            },
        });
    } catch (e) {
        Logger.error(`Unable to complete job "${jobId}": ${JSON.stringify(e)}`);
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
            scheduledTime,
            status: SchedulerJobStatus.ERROR,
            details: { error: e.message },
        });

        throw e; // Cascade error to it can be retried by graphile
    }
};
