import { SlackChannel, SlackSettings } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Block } from '@slack/bolt';
import {
    ChatPostMessageArguments,
    ConversationsListResponse,
    UsersListResponse,
    WebClient,
} from '@slack/web-api';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';

type SlackClientArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
};

const CACHE_TIME = 1000 * 60 * 10; // 10 minutes
const cachedChannels: Record<
    string,
    { lastCached: Date; channels: SlackChannel[] }
> = {};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    public isEnabled: boolean = false;

    constructor({
        slackAuthenticationModel,
        lightdashConfig,
    }: SlackClientArguments) {
        this.lightdashConfig = lightdashConfig;
        this.slackAuthenticationModel = slackAuthenticationModel;
        if (this.lightdashConfig.slack?.clientId) {
            this.isEnabled = true;
        }
    }

    private async getWebClient(organizationUuid: string): Promise<WebClient> {
        if (!this.isEnabled) {
            throw new Error('Slack is not configured');
        }
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        return new WebClient(installation?.token);
    }

    async getChannels(organizationUuid: string): Promise<SlackChannel[]> {
        if (
            cachedChannels[organizationUuid] &&
            new Date().getTime() -
                cachedChannels[organizationUuid].lastCached.getTime() <
                CACHE_TIME
        ) {
            return cachedChannels[organizationUuid].channels;
        }

        Logger.debug('Fetching channels from Slack API');

        let nextCursor: string | undefined;
        let allChannels: ConversationsListResponse['channels'] = [];

        const webClient = await this.getWebClient(organizationUuid);

        do {
            try {
                Logger.debug(
                    `Fetching slack channels with cursor ${nextCursor}`,
                );

                const conversations: ConversationsListResponse =
                    // eslint-disable-next-line no-await-in-loop
                    await webClient.conversations.list({
                        types: 'public_channel',
                        limit: 900,
                        cursor: nextCursor,
                    });

                nextCursor = conversations.response_metadata?.next_cursor;
                allChannels = conversations.channels
                    ? [...allChannels, ...conversations.channels]
                    : allChannels;
            } catch (e) {
                Logger.error(`Unable to fetch slack channels ${e}`);
                Sentry.captureException(e);
                break;
            }
        } while (nextCursor);
        Logger.debug(`Total slack channels ${allChannels.length}`);

        nextCursor = undefined;
        let allUsers: UsersListResponse['members'] = [];
        do {
            try {
                Logger.debug(`Fetching slack users with cursor ${nextCursor}`);

                const users: UsersListResponse =
                    // eslint-disable-next-line no-await-in-loop
                    await webClient.users.list({
                        limit: 900,
                        cursor: nextCursor,
                    });
                nextCursor = users.response_metadata?.next_cursor;
                allUsers = users.members
                    ? [...allUsers, ...users.members]
                    : allUsers;
            } catch (e) {
                Logger.error(`Unable to fetch slack users ${e}`);
                Sentry.captureException(e);

                break;
            }
        } while (nextCursor);
        Logger.debug(`Total slack users ${allUsers.length}`);

        const sortedChannels = allChannels
            .reduce<SlackChannel[]>(
                (acc, { id, name }) =>
                    id && name ? [...acc, { id, name: `#${name}` }] : acc,
                [],
            )
            .sort((a, b) => a.name.localeCompare(b.name));

        const sortedUsers = allUsers
            .reduce<SlackChannel[]>(
                (acc, { id, name }) =>
                    id && name ? [...acc, { id, name: `@${name}` }] : acc,
                [],
            )
            .sort((a, b) => a.name.localeCompare(b.name));

        const channels = [...sortedChannels, ...sortedUsers];
        cachedChannels[organizationUuid] = { lastCached: new Date(), channels };
        return channels;
    }

    async joinChannels(organizationUuid: string, channels: string[]) {
        if (channels.length === 0) return;
        try {
            const webClient = await this.getWebClient(organizationUuid);
            const joinPromises = channels.map((channel) => {
                // Don't need to join user channels (DM)
                if (channel.startsWith('U')) return undefined;

                return webClient.conversations.join({
                    channel,
                });
            });
            await Promise.all(joinPromises);
        } catch (e) {
            Logger.error(
                `Unable to join channels ${channels} on organization ${organizationUuid}: ${e}`,
            );
        }
    }

    async postMessage(
        message: {
            organizationUuid: string;
        } & ChatPostMessageArguments,
    ) {
        const { organizationUuid, ...slackMessageArgs } = message;
        const webClient = await this.getWebClient(organizationUuid);
        return webClient.chat
            .postMessage({
                ...slackMessageArgs,
            })
            .catch((e: any) => {
                Logger.error(
                    `Unable to post message on Slack: ${JSON.stringify(e)}`,
                );
                throw e;
            });
    }

    async updateNotificationChannel(
        userFullName: string,
        organizationUuid: string,
        channelId: string | null,
    ) {
        const webClient = await this.getWebClient(organizationUuid);

        await this.slackAuthenticationModel.updateNotificationChannelFromOrganizationUuid(
            organizationUuid,
            channelId,
        );

        if (channelId) {
            await webClient.chat
                .postMessage({
                    channel: channelId,
                    text: `This channel will now receive notifications for failed scheduled delivery jobs in Lightdash. Configuration completed${
                        userFullName.trim().length ? ` by ${userFullName}` : ''
                    }. Stay informed on your job status here.`,
                })
                .catch((e: any) => {
                    Logger.error(
                        `Unable to post message on Slack. You might need to add the Slack app to the channel you wish you sent notifications to. Error: ${JSON.stringify(
                            e,
                        )}`,
                    );
                    throw e;
                });
        }
    }

    async getNotificationChannel(
        organizationUuid: string,
    ): Promise<SlackSettings['notificationChannel']> {
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        return installation?.notificationChannel;
    }

    async postMessageToNotificationChannel({
        organizationUuid,
        text,
        blocks,
    }: {
        organizationUuid: string;
        text: string;
        blocks?: Block[];
    }): Promise<void> {
        const channelId = await this.getNotificationChannel(organizationUuid);
        if (!channelId) {
            Logger.warn(
                `Unable to send slack notification for organization ${organizationUuid}. No notification channel set.`,
            );
            return;
        }
        await this.postMessage({
            organizationUuid,
            text,
            channel: channelId,
            blocks,
        });
    }
}
