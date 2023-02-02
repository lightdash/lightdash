import { App, LogLevel } from '@slack/bolt';
import { nanoid } from 'nanoid';

import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import {
    LightdashPage,
    Unfurl,
} from '../../services/UnfurlService/UnfurlService';

import { slackOptions } from './SlackOptions';
import { unfurlChartAndDashboard } from './SlackUnfurl';

type SlackClientDependencies = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    savedChartModel: SavedChartModel;

    slackApp: App | undefined;

    dashboardModel: DashboardModel;

    constructor({
        slackAuthenticationModel,
        lightdashConfig,
        savedChartModel,
        dashboardModel,
    }: SlackClientDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.slackAuthenticationModel = slackAuthenticationModel;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.start();
    }

    async start() {
        if (this.lightdashConfig.slack?.appToken) {
            try {
                this.slackApp = new App({
                    ...slackOptions,
                    installationStore: {
                        storeInstallation: (i) =>
                            this.slackAuthenticationModel.createInstallation(i),
                        fetchInstallation: (i) =>
                            this.slackAuthenticationModel.getInstallation(i),
                    },
                    logLevel: LogLevel.INFO,
                    port: this.lightdashConfig.slack.port,
                    socketMode: true,
                    appToken: this.lightdashConfig.slack.appToken,
                });
            } catch (e: unknown) {
                Logger.error(`Unable to start Slack client ${e}`);
            }
        } else {
            Logger.warn(
                `Missing "SLACK_APP_TOKEN", Slack client will not work`,
            );
        }
    }

    async sendNotification(notification: {
        organizationUuid: string;
        userUuid: string;
        chartUuid?: string;
        dashboardUuid?: string;
        channel: string;
    }): Promise<void> {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }
        try {
            /* TODO  analytics.track({
                event: 'share_slack.unfurl',
                userId: eventUserId,
                properties: {},
            });
            */
            const { userUuid, chartUuid, channel } = notification;

            if (chartUuid === undefined) {
                Logger.error(`Undefined chart ${chartUuid}`);
                return;
            }
            const chart = await this.savedChartModel.get(chartUuid);

            const imageId = `slack-image-${nanoid()}`;

            const url = `${this.lightdashConfig.siteUrl}/projects/${chart.projectUuid}/saved/${chartUuid}`;
            const imageUrl = `https://lightdash-cloud-file-storage-us.storage.googleapis.com/slack-image-NOp7S9b-qz4I3VQ4pL-QC`; /* await unfurlService.unfurlImage(
                    url,
                    LightdashPage.CHART,
                    imageId,
                    userUuid,
                ); */

            if (imageUrl) {
                const installation =
                    await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                        notification.organizationUuid,
                    );
                const unfurl: Unfurl = {
                    title: chart.name,
                    description: chart.description,
                    imageUrl,
                    pageType: LightdashPage.CHART,
                };
                const blocks = unfurlChartAndDashboard(url, unfurl, true);
                this.slackApp.client.chat
                    .postMessage({
                        token: installation?.token,
                        channel,
                        blocks,
                        text: chart.name,
                    })
                    .catch((e: any) => {
                        /* analytics.track({
                            event: 'share_slack.unfurl_error',
                            userId: event.user,
                            properties: {
                                error: `${e}`,
                            },
                        }); */
                        Logger.error(
                            `Unable to postmessage on slack with blocks ${JSON.stringify(
                                blocks,
                            )}: ${JSON.stringify(e)}`,
                        );
                    });

                /* analytics.track({
                        event: 'share_slack.unfurl_completed',
                        userId: eventUserId,
                        properties: { pageType: details.pageType },
                    }); */
            } else {
                // TODO track error here and retry
            }
        } catch (e) {
            /* analytics.track({
                event: 'share_slack.unfurl_error',
                userId: eventUserId,

                properties: {
                    error: `${e}`,
                },
            });

            notifySlackError(e, l.url, client, event); */
        }
    }

    async sendText(message: {
        organizationUuid: string;
        text: string;
        channel: string;
    }): Promise<void> {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }

        const { organizationUuid, text, channel } = message;

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        this.slackApp.client.chat
            .postMessage({
                token: installation?.token,
                channel,
                text,
            })
            .catch((e: any) => {
                /* analytics.track({
                event: 'share_slack.unfurl_error',
                userId: event.user,
                properties: {
                    error: `${e}`,
                },
            }); */
                Logger.error(
                    `Unable to postmessage on slack : ${JSON.stringify(e)}`,
                );
            });
    }
}
