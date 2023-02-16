import {
    ApiQueryResults,
    DimensionType,
    getItemLabel,
    getItemMap,
    isField,
    ScheduledEmailNotification,
    ScheduledSlackNotification,
    SessionUser,
} from '@lightdash/common';
import { stringify } from 'csv-stringify';
import * as fs from 'fs/promises';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { emailClient, slackClient } from '../clients/clients';
import { unfurlChartAndDashboard } from '../clients/Slack/SlackUnfurl';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logger';
import {
    projectService,
    s3Service,
    schedulerService,
    unfurlService,
    userService,
} from '../services/services';
import { LightdashPage, Unfurl } from '../services/UnfurlService/UnfurlService';

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

const getCsvForChart = async (user: SessionUser, chartUuid: string) => {
    const chart = await schedulerService.savedChartModel.get(chartUuid);
    const { metricQuery } = chart;
    const exploreId = chart.tableName;
    const onlyRaw = false;
    const results: ApiQueryResults = await projectService.runQuery(
        user,
        metricQuery,
        chart.projectUuid,
        exploreId,
        500, // TOdo from chart ?
    );

    const explore = await projectService.getExplore(
        user,
        chart.projectUuid,
        exploreId,
    );
    const itemMap = getItemMap(
        explore,
        metricQuery.additionalMetrics,
        metricQuery.tableCalculations,
    );
    // Ignore fields from results that are not selected in metrics or dimensions
    const selectedFieldIds = [
        ...metricQuery.metrics,
        ...metricQuery.dimensions,
        ...metricQuery.tableCalculations.map((tc: any) => tc.name),
    ];
    const csvHeader = Object.keys(results.rows[0])
        .filter((id) => selectedFieldIds.includes(id))
        .map((id) => getItemLabel(itemMap[id]));
    const csvBody = results.rows.map((row) =>
        Object.keys(row)
            .filter((id) => selectedFieldIds.includes(id))
            .map((id) => {
                const rowData = row[id];
                const item = itemMap[id];
                if (isField(item) && item.type === DimensionType.TIMESTAMP) {
                    return moment(rowData.value.raw).format(
                        'YYYY-MM-DD HH:mm:ss',
                    );
                }
                if (isField(item) && item.type === DimensionType.DATE) {
                    return moment(rowData.value.raw).format('YYYY-MM-DD');
                }
                if (onlyRaw) {
                    return rowData.value.raw;
                }
                return rowData.value.formatted;
            }),
    );

    const csvContent: string = await new Promise((resolve, reject) => {
        stringify(
            [csvHeader, ...csvBody],
            {
                delimiter: ',',
            },
            (err, output) => {
                if (err) {
                    reject(new Error(err.message));
                }
                resolve(output);
            },
        );
    });

    const fileId = `csv-${nanoid()}.csv`;

    try {
        return await s3Service.uploadCsv(csvContent, fileId);
    } catch (e) {
        // Can't store file in S3, storing locally
        await fs.writeFile(`/tmp/${fileId}`, csvContent, 'utf-8');
        return `${lightdashConfig.siteUrl}/api/v1/projects/${chart.projectUuid}/csv/${fileId}`;
    }
};

// getCsvForChart('5de7b22b-813d-46a9-b093-ff2d83912253')

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

        const imageUrl = await unfurlService.unfurlImage(
            url,
            pageType,
            `slack-notification-image-${nanoid()}`,
            userUuid,
        );
        if (imageUrl === undefined) {
            throw new Error('Unable to unfurl image');
        }

        const unfurl: Unfurl = {
            title: details.name,
            description: details.description,
            imageUrl,
            pageType,
        };
        const blocks = unfurlChartAndDashboard(url, unfurl, true);

        await slackClient.postMessage({
            organizationUuid,
            text: details.name,
            channel,
            blocks,
        });
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
            // TODO get results
            // TODO if dashboard, download all charts within
            const csvUrl = '';
            emailClient.sendImageNotificationEmail(
                recipient,
                schedulerName,
                details.name,
                details.description || '',
                csvUrl,
                url,
            );
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
