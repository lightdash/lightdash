import {
    SlackAppCustomSettings,
    SlackChannel,
    SlackSettings,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { Block } from '@slack/bolt';
import {
    ChatPostMessageArguments,
    ChatUpdateArguments,
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
        const { appProfilePhotoUrl } =
            (await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            )) || {};

        return webClient.chat
            .postMessage({
                ...(appProfilePhotoUrl ? { icon_url: appProfilePhotoUrl } : {}),
                ...slackMessageArgs,
            })
            .catch((e: any) => {
                Logger.error(
                    `Unable to post message on Slack: ${JSON.stringify(e)}`,
                );
                throw e;
            });
    }

    async updateAppCustomSettings(
        userFullName: string,
        organizationUuid: string,
        opts: SlackAppCustomSettings,
    ) {
        const webClient = await this.getWebClient(organizationUuid);
        const { notificationChannel: channelId, appProfilePhotoUrl } = opts;
        const currentChannelId = await this.getNotificationChannel(
            organizationUuid,
        );

        await this.slackAuthenticationModel.updateAppCustomSettings(
            organizationUuid,
            opts,
        );

        if (channelId && channelId !== currentChannelId) {
            await webClient.chat
                .postMessage({
                    channel: channelId,
                    text: `This channel will now receive notifications for failed scheduled delivery jobs in Lightdash. Configuration completed${
                        userFullName.trim().length ? ` by ${userFullName}` : ''
                    }. Stay informed on your job status here.`,
                    ...(appProfilePhotoUrl
                        ? { icon_url: appProfilePhotoUrl }
                        : {}),
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

    async updateMessage({
        organizationUuid,
        text,
        blocks,
        channelId,
        messageTs,
    }: {
        organizationUuid: string;
        text: string;
        blocks?: ChatUpdateArguments['blocks'];
        channelId: string;
        messageTs: string;
    }) {
        const webClient = await this.getWebClient(organizationUuid);
        return webClient.chat.update({
            channel: channelId,
            text,
            blocks,
            ts: messageTs,
        });
    }

    async deleteMessage({
        organizationUuid,
        channelId,
        messageTs,
    }: {
        organizationUuid: string;
        channelId: string;
        messageTs: string;
    }) {
        const webClient = await this.getWebClient(organizationUuid);
        return webClient.chat.delete({
            channel: channelId,
            ts: messageTs,
        });
    }

    /**
     *
     * @param args.filename - you must provide an extension for slack to recognize the file type
     */
    async postFileToThread(args: {
        organizationUuid: string;
        channelId: string;
        threadTs: string;
        file: Buffer;
        title: string;
        comment: string;
        filename: string;
    }): Promise<void> {
        const webClient = await this.getWebClient(args.organizationUuid);
        await webClient.files.uploadV2({
            channel_id: args.channelId,
            thread_ts: args.threadTs,
            file: args.file,
            title: args.title,
            initial_comment: args.comment,
            filename: args.filename,
        });
    }
}
