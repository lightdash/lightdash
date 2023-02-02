import { App, LogLevel } from '@slack/bolt';

import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';

import { slackOptions } from './SlackOptions';

type SlackClientDependencies = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    slackApp: App | undefined;

    constructor({
        slackAuthenticationModel,
        lightdashConfig,
    }: SlackClientDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.slackAuthenticationModel = slackAuthenticationModel;
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
                Logger.error(`Unable to start Slack app ${e}`);
            }
        } else {
            Logger.warn(`Missing "SLACK_APP_TOKEN", Slack App will not run`);
        }
    }

    async sendNotification(notification: {
        organizationUuid: string;
        text: string;
        channel: string;
    }): Promise<void> {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                notification.organizationUuid,
            );

        this.slackApp.client.chat
            .postMessage({
                token: installation?.token,
                channel: notification.channel,
                text: notification.text,
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
