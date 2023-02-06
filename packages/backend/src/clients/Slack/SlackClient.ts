import { App, Block, LogLevel } from '@slack/bolt';

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

    public isEnabled: boolean = false;

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
                Logger.error(`Unable to start Slack client ${e}`);
            }
            this.isEnabled = true;
        } else {
            Logger.warn(
                `Missing "SLACK_APP_TOKEN", Slack client will not work`,
            );
        }
    }

    async getChannels(organizationUuid: string) {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        const channels = await this.slackApp.client.conversations.list({
            token: installation?.token,
            types: 'public_channel',
        });

        const users = await this.slackApp.client.users.list({
            token: installation?.token,
        });
        const channelNames =
            channels.channels?.map((channel) => ({
                id: channel.id,
                name: channel.name,
            })) || [];
        const userNames =
            users.members?.map((user) => ({ id: user.id, name: user.name })) ||
            [];
        return [...channelNames, ...userNames];
    }

    async joinChannel(organizationUuid: string, channel: string) {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        await this.slackApp.client.conversations.join({
            token: installation?.token,
            channel,
        });
    }

    async postMessage(message: {
        organizationUuid: string;
        text: string;
        channel: string;
        blocks?: Block[];
    }): Promise<void> {
        if (this.slackApp === undefined) {
            throw new Error('Slack app is not configured');
        }

        const { organizationUuid, text, channel, blocks } = message;

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        this.slackApp.client.chat
            .postMessage({
                token: installation?.token,
                channel,
                text,
                blocks,
            })
            .catch((e: any) => {
                Logger.error(
                    `Unable to postmessage on slack : ${JSON.stringify(e)}`,
                );
            });
    }
}
