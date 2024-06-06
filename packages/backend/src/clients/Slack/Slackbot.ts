import { LightdashMode, SlackAppCustomSettings } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import { Express } from 'express';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import {
    Unfurl,
    type UnfurlService,
} from '../../services/UnfurlService/UnfurlService';
import { getUnfurlBlocks } from './SlackMessageBlocks';
import { slackOptions } from './SlackOptions';

const notifySlackError = async (
    error: unknown,
    url: string,
    client: any,
    event: any,
    {
        appName,
        appProfilePhotoUrl,
    }: { appName?: string; appProfilePhotoUrl?: string },
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
            ...(appName ? { username: appName } : {}),
            ...(appProfilePhotoUrl ? { icon_url: appProfilePhotoUrl } : {}),
            text: `:fire: Unable to unfurl ${url}: ${error}`,
        })
        .catch((er: any) =>
            Logger.error(`Unable send slack error message: ${er} `),
        );
};

export type SlackBotArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    unfurlService: UnfurlService;
};

export class SlackBot {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    unfurlService: UnfurlService;

    constructor({
        slackAuthenticationModel,
        lightdashConfig,
        analytics,
        unfurlService,
    }: SlackBotArguments) {
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.slackAuthenticationModel = slackAuthenticationModel;
        this.unfurlService = unfurlService;
    }

    async start(expressApp: Express) {
        if (!this.lightdashConfig.slack?.clientId) {
            Logger.warn(`Missing "SLACK_CLIENT_ID", Slack App will not run`);
            return;
        }

        try {
            const slackReceiver = new ExpressReceiver({
                ...slackOptions,
                installationStore: {
                    storeInstallation: (i) =>
                        this.slackAuthenticationModel.createInstallation(i),
                    fetchInstallation: (i) =>
                        this.slackAuthenticationModel.getInstallation(i),
                    deleteInstallation: (i) =>
                        this.slackAuthenticationModel.deleteInstallation(i),
                },
                logLevel: LogLevel.INFO,
                app: expressApp,
            });

            const app = new App({
                ...slackOptions,

                receiver: slackReceiver,
            });

            this.addEventListeners(app);
        } catch (e: unknown) {
            Logger.error(`Unable to start Slack app ${e}`);
        }
    }

    protected addEventListeners(app: App) {
        app.event('link_shared', (m) => this.unfurlSlackUrls(m));
    }

    private async sendUnfurl(
        event: any,
        originalUrl: string,
        unfurl: Unfurl,
        client: any,
    ) {
        const unfurlBlocks = getUnfurlBlocks(originalUrl, unfurl);
        await client.chat
            .unfurl({
                ts: event.message_ts,
                channel: event.channel,
                unfurls: unfurlBlocks,
            })
            .catch((e: any) => {
                this.analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: event.user,
                    properties: {
                        error: `${e}`,
                    },
                });
                Logger.error(
                    `Unable to unfurl on slack ${JSON.stringify(
                        unfurlBlocks,
                    )}: ${JSON.stringify(e)}`,
                );
            });
    }

    async unfurlSlackUrls(message: any) {
        const { event, client, context } = message;
        let appName: string | undefined;
        let appProfilePhotoUrl: string | undefined;

        if (event.channel === 'COMPOSER') return; // Do not unfurl urls when typing, only when message is sent

        Logger.debug(`Got link_shared slack event ${event.message_ts}`);

        event.links.map(async (l: any) => {
            const eventUserId = context.botUserId;

            try {
                const { teamId } = context;
                const details = await this.unfurlService.unfurlDetails(l.url);

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

                    const imageId = `slack-image-${nanoid()}`;
                    const authUserUuid =
                        await this.slackAuthenticationModel.getUserUuid(teamId);

                    const installation =
                        await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                            details?.organizationUuid,
                        );

                    appName = installation?.appName;
                    appProfilePhotoUrl = installation?.appProfilePhotoUrl;

                    const { imageUrl } = await this.unfurlService.unfurlImage({
                        url: details.minimalUrl,
                        lightdashPage: details.pageType,
                        imageId,
                        authUserUuid,
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
                        appName,
                        appProfilePhotoUrl,
                    });
                }

                Sentry.captureException(e);

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
