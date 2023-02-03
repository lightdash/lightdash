import { nanoid } from 'nanoid';
import { unfurlChartAndDashboard } from '../clients/Slack/SlackUnfurl';
import { lightdashConfig } from '../config/lightdashConfig';
import Logger from '../logger';
import {
    schedulerService,
    slackClient,
    unfurlService,
} from '../services/services';
import { LightdashPage, Unfurl } from '../services/UnfurlService/UnfurlService';

const getChartOrDashboard = async (
    chartUuid?: string,
    dashboardUuid?: string,
) => {
    if (chartUuid !== undefined) {
        const chart = await schedulerService.savedChartModel.get(chartUuid);
        return {
            url: `${lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`,
            details: {
                name: chart.name,
                description: chart.description,
            },
            pageType: LightdashPage.CHART,
        };
    }

    if (dashboardUuid !== undefined) {
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
        };
    }

    throw new Error("Chart or dashboard can't be both undefined");
};

export const sendSlackNotification = async (notification: {
    organizationUuid: string;
    userUuid: string;
    chartUuid?: string;
    dashboardUuid?: string;
    channel: string;
}) => {
    if (!slackClient.isEnabled) {
        throw new Error('Slack app is not configured');
    }
    try {
        const {
            organizationUuid,
            userUuid,
            chartUuid,
            dashboardUuid,
            channel,
        } = notification;
        const { url, details, pageType } = await getChartOrDashboard(
            chartUuid,
            dashboardUuid,
        );

        let imageUrl;
        try {
            imageUrl = await unfurlService.unfurlImage(
                url,
                pageType,
                `slack-notification-image-${nanoid()}`,
                userUuid,
            );
        } catch (e) {
            // TODO track error here and retry
            // Placeholder image
            // TODO only use placeholder image on test env, when HEADLESS browser is not defined
            imageUrl =
                'https://uploads-ssl.webflow.com/62a9ae93cf7542032ae55b9c/62bb343438ff242c3efb5489_Group%2024%20(1)-p-1600.png';
        }

        const unfurl: Unfurl = {
            title: details.name,
            description: details.description,
            imageUrl,
            pageType,
        };
        const blocks = unfurlChartAndDashboard(url, unfurl, true);

        slackClient.postMessage({
            organizationUuid,
            text: details.name,
            channel,
            blocks,
        });
    } catch (e) {
        Logger.error(
            `Unable to sendNotification on slack : ${JSON.stringify(e)}`,
        );
    }
};
