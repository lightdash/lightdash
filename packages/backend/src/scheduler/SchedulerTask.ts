import {
    isSchedulerCsvOptions,
    ScheduledEmailNotification,
    ScheduledSlackNotification,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { nanoid } from 'nanoid';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { emailClient, slackClient } from '../clients/clients';
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
import { LightdashPage } from '../services/UnfurlService/UnfurlService';

const getChartOrDashboard = async (
    chartUuid: string | null,
    dashboardUuid: string | null,
) => {
    if (chartUuid) {
        const chart = await schedulerService.savedChartModel.get(chartUuid);
        return {
            url: `${lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
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

export const sendSlackNotification = async (
    jobId: string,
    notification: ScheduledSlackNotification,
) => {
    const {
        schedulerUuid,
        schedulerSlackTargetUuid,
        createdBy: userUuid,
        savedChartUuid,
        dashboardUuid,
        channel,
        format,
        options,
    } = notification;
    analytics.track({
        event: 'scheduler_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            format,

            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerSlackTargetUuid,
            type: 'slack',
        },
    });
    try {
        if (!slackClient.isEnabled) {
            throw new Error('Slack app is not configured');
        }

        const { url, details, pageType, organizationUuid } =
            await getChartOrDashboard(savedChartUuid, dashboardUuid);
        const scheduler = await schedulerService.schedulerModel.getScheduler(
            schedulerUuid,
        );
        const cronHumanString = cronstrue.toString(scheduler.cron, {
            verbose: true,
            throwExceptionOnParseError: false,
        });
        const footerMarkdown = `This is a [scheduled delivery](${url}) ${cronHumanString} from Lightdash`;
        if (format === 'image') {
            const imageUrl = await unfurlService.unfurlImage(
                url,
                pageType,
                `slack-notification-image-${nanoid()}`,
                userUuid,
                3, // up to 3 retries
            );
            if (imageUrl === undefined) {
                throw new Error('Unable to unfurl image');
            }

            const blocks = getChartAndDashboardBlocks({
                title: scheduler.name,
                description: [details.name, details.description].join(' - '),
                imageUrl,
                ctaUrl: url,
                footerMarkdown,
            });

            await slackClient.postMessage({
                organizationUuid,
                text: scheduler.name,
                channel,
                blocks,
            });
        } else {
            const user = await userService.getSessionByUserUuid(userUuid);
            const csvOptions = isSchedulerCsvOptions(options)
                ? options
                : undefined;

            let blocks;
            if (savedChartUuid) {
                const csvUrl = await csvService.getCsvForChart(
                    user,
                    savedChartUuid,
                    csvOptions,
                );
                blocks = getChartCsvResultsBlocks({
                    title: scheduler.name,
                    description: [details.name, details.description].join(
                        ' - ',
                    ),
                    ctaUrl: url,
                    csvUrl: csvUrl.path,
                    footerMarkdown,
                });
            } else if (dashboardUuid) {
                const csvUrls = await csvService.getCsvsForDashboard(
                    user,
                    dashboardUuid,
                    csvOptions,
                );
                blocks = getDashboardCsvResultsBlocks({
                    title: scheduler.name,
                    description: [details.name, details.description].join(
                        ' - ',
                    ),
                    ctaUrl: url,
                    csvUrls,
                    footerMarkdown,
                });
            } else {
                throw new Error('Not implemented');
            }
            await slackClient.postMessage({
                organizationUuid,
                text: scheduler.name,
                channel,
                blocks,
            });
        }
        analytics.track({
            event: 'scheduler_job.completed',
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
    } catch (e) {
        Logger.error(
            `Unable to sendNotification on slack : ${JSON.stringify(e)}`,
        );
        analytics.track({
            event: 'scheduler_job.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                error: `${e}`,
                jobId,
                format,

                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerSlackTargetUuid,
                type: 'slack',
            },
        });
        throw e; // Cascade error to it can be retried by graphile
    }
};

export const sendEmailNotification = async (
    jobId: string,
    notification: ScheduledEmailNotification,
) => {
    const {
        schedulerUuid,
        schedulerEmailTargetUuid,
        createdBy: userUuid,
        savedChartUuid,
        dashboardUuid,
        recipient,
        name: schedulerName,
        format,
        options,
    } = notification;
    analytics.track({
        event: 'scheduler_job.started',
        anonymousId: LightdashAnalytics.anonymousId,
        properties: {
            jobId,
            format,

            schedulerId: schedulerUuid,
            schedulerTargetId: schedulerEmailTargetUuid,
            type: 'email',
        },
    });

    try {
        const { url, details, pageType, organizationUuid } =
            await getChartOrDashboard(savedChartUuid, dashboardUuid);

        if (format === 'image') {
            const imageUrl = await unfurlService.unfurlImage(
                url,
                pageType,
                `email-notification-image-${nanoid()}`,
                userUuid,
                3, // up to 3 retries
            );
            if (imageUrl === undefined) {
                throw new Error('Unable to unfurl image');
            }
            emailClient.sendImageNotificationEmail(
                recipient,
                schedulerName,
                details.name,
                details.description || '',
                imageUrl,
                url,
            );
        } else {
            const user = await userService.getSessionByUserUuid(userUuid);

            const csvOptions = isSchedulerCsvOptions(options)
                ? options
                : undefined;

            if (savedChartUuid) {
                const csvUrl = await csvService.getCsvForChart(
                    user,
                    savedChartUuid,
                    csvOptions,
                );

                emailClient.sendChartCsvNotificationEmail(
                    recipient,
                    schedulerName,
                    details.name,
                    details.description || '',
                    csvUrl,
                    url,
                );
            } else if (dashboardUuid) {
                const csvUrls = await csvService.getCsvsForDashboard(
                    user,
                    dashboardUuid,
                    csvOptions,
                );
                emailClient.sendDashboardCsvNotificationEmail(
                    recipient,
                    schedulerName,
                    details.name,
                    details.description || '',
                    csvUrls,
                    url,
                );
            } else {
                throw new Error('Not implemented');
            }
        }

        analytics.track({
            event: 'scheduler_job.completed',
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
    } catch (e) {
        Logger.error(
            `Unable to send notification on email : ${JSON.stringify(e)}`,
        );
        analytics.track({
            event: 'scheduler_job.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                error: `${e}`,
                jobId,
                format,

                schedulerId: schedulerUuid,
                schedulerTargetId: schedulerEmailTargetUuid,
                type: 'email',
            },
        });
        throw e; // Cascade error to it can be retried by graphile
    }
};
