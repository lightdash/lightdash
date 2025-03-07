import {
    friendlyName,
    MissingConfigError,
    SlackAppCustomSettings,
    SlackChannel,
    SlackInstallationNotFoundError,
    SlackSettings,
    UnexpectedServerError,
} from '@lightdash/common';
import { Block } from '@slack/bolt';
import {
    ChatPostMessageArguments,
    ChatUpdateArguments,
    ConversationsListResponse,
    FilesCompleteUploadExternalResponse,
    UsersListResponse,
    WebAPICallResult,
    WebClient,
} from '@slack/web-api';
import { LightdashConfig } from '../../config/parseConfig';
import { slackErrorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';

type SlackClientArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
};

const DEFAULT_CACHE_TIME = 1000 * 60 * 10; // 10 minutes
const MAX_CHANNELS_LIMIT = 100000;

export type PostSlackFile = {
    organizationUuid: string;
    channelId: string;
    threadTs: string;
    file: Buffer;
    title: string;
    comment?: string;
    filename: string;
    fileType?: string;
};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    public isEnabled: boolean = false;

    private channelsCache: Map<
        string,
        { lastCached: Date; channels: SlackChannel[] }
    > = new Map();

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
            throw new MissingConfigError('Slack is not configured');
        }
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) {
            throw new SlackInstallationNotFoundError();
        }

        return new WebClient(installation.token);
    }

    async getChannels(
        organizationUuid: string,
        search?: string,
        filter: { excludeArchived?: boolean; forceRefresh?: boolean } = {
            excludeArchived: true,
        },
    ): Promise<SlackChannel[] | undefined> {
        const getCachedChannels = () => {
            const cached = this.channelsCache.get(organizationUuid);
            if (!cached) return undefined;

            let finalResults = cached.channels;
            if (search) {
                finalResults = finalResults.filter((channel) =>
                    channel.name.includes(search),
                );
            }
            return finalResults.slice(0, MAX_CHANNELS_LIMIT);
        };

        const isCacheValid = () => {
            if (filter.forceRefresh) return false;
            const cached = this.channelsCache.get(organizationUuid);
            if (!cached) return false;

            const cacheAge = new Date().getTime() - cached.lastCached.getTime();
            return (
                cacheAge <
                (this.lightdashConfig.slack?.channelsCachedTime ||
                    DEFAULT_CACHE_TIME)
            );
        };

        if (isCacheValid()) {
            return getCachedChannels();
        }

        Logger.debug('Fetching channels from Slack API');

        let nextCursor: string | undefined;
        let allChannels: ConversationsListResponse['channels'] = [];

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) return undefined;

        const webClient = await this.getWebClient(organizationUuid);

        do {
            try {
                Logger.debug(
                    `Fetching slack channels with cursor ${nextCursor}`,
                );

                const conversations: ConversationsListResponse =
                    // eslint-disable-next-line no-await-in-loop
                    await webClient.conversations.list({
                        types: 'public_channel,private_channel',
                        exclude_archived: filter?.excludeArchived,
                        limit: 900,
                        cursor: nextCursor,
                    });

                nextCursor = conversations.response_metadata?.next_cursor;
                allChannels = conversations.channels
                    ? [...allChannels, ...conversations.channels]
                    : allChannels;
            } catch (e) {
                slackErrorHandler(e, 'Unable to fetch slack channels');
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
                slackErrorHandler(e, 'Unable to fetch slack users');
            }
        } while (nextCursor);
        Logger.debug(`Total slack users ${allUsers.length}`);

        const sortedChannels = allChannels
            .filter(({ id, name }) => id && name)
            .map<SlackChannel>(({ id, name }) => ({
                id: id!,
                name: `#${name!}`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const sortedUsers = allUsers
            .filter(({ id, name }) => id && name)
            .map<SlackChannel>(({ id, name }) => ({
                id: id!,
                name: `@${name!}`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const channels = [...sortedChannels, ...sortedUsers];
        this.channelsCache.set(organizationUuid, {
            lastCached: new Date(),
            channels,
        });

        return getCachedChannels();
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
            slackErrorHandler(
                e,
                `Unable to join channels ${channels} on organization ${organizationUuid}`,
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

        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) {
            throw new SlackInstallationNotFoundError();
        }

        const { appProfilePhotoUrl } = installation;

        return webClient.chat
            .postMessage({
                ...(appProfilePhotoUrl ? { icon_url: appProfilePhotoUrl } : {}),
                ...slackMessageArgs,
            })
            .catch((e) => {
                slackErrorHandler(e, 'Unable to post message on Slack');
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
            await this.joinChannels(organizationUuid, [channelId]);
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
                .catch((e) => {
                    slackErrorHandler(
                        e,
                        'Unable to post message on Slack. You might need to add the Slack app to the channel you wish you sent notifications to',
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

    async postFileToThread(args: PostSlackFile) {
        const webClient = await this.getWebClient(args.organizationUuid);

        const result = await webClient.files.uploadV2({
            channel_id: args.channelId,
            thread_ts: args.threadTs,
            file: args.file,
            title: args.title,
            initial_comment: args.comment,
            filename: args.filename,
            filetype: args.fileType || 'png',
        });

        if (!result.ok) {
            Logger.error(`Failed to upload file to slack`, result.error);
            throw new Error(`Failed to upload file to slack: ${result.error}`);
        } else {
            Logger.debug(`Uploaded file to slack`, result.file);
        }
    }

    /* 
    This method will try to upload an image to slack, so it can be used in blocks, 
    instead of sharing the file directly on a channel or a thread
    It returns a promise that resolves to the file url, but it takes a while for the file to be uploaded
    Note: method sharedPublicURL will not work here because it requires a user token, and we only use bot tokens
    */
    async uploadFile(args: {
        organizationUuid: string;
        file: Buffer;
        title: string;
    }) {
        const webClient = await this.getWebClient(args.organizationUuid);
        const filename = friendlyName(args.title);
        const result = (await webClient.files.uploadV2({
            file: args.file,
            title: args.title,
            filename,
        })) as WebAPICallResult & {
            files: FilesCompleteUploadExternalResponse[];
        };

        const uploadedFile = result.files?.[0].files?.[0];

        if (!uploadedFile?.id) {
            throw new UnexpectedServerError('Slack file was not uploaded');
        }

        // We need to wait for the file to be ready, otherwise slack will fail with invalid_blocks error
        async function waitForFileReady(fileId: string): Promise<string> {
            const maxRetries = 10;
            const delay = 1000;

            const checkFile = async (attempt: number): Promise<string> => {
                if (attempt >= maxRetries) {
                    throw new UnexpectedServerError(
                        'File URL not available after maximum retries.',
                    );
                }

                const fileInfo = await webClient.files.info({ file: fileId });
                const urlPrivate = fileInfo.file?.url_private;
                const mimeType = fileInfo.file?.mimetype;

                if (mimeType && urlPrivate) {
                    Logger.debug(`Slack image ready after ${attempt} retries`);
                    return urlPrivate;
                }

                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(checkFile(attempt + 1));
                    }, delay);
                });
            };

            return checkFile(0);
        }

        const fileUrl = await waitForFileReady(uploadedFile?.id);

        return fileUrl;
    }

    /**
     * Helper method to try to upload an image to slack, so it can be used in blocks without expiration
     * If it fails, we will keep using the same URL (s3)
     */
    async tryUploadingImageToSlack(
        organizationUuid: string,
        imageUrl: string | undefined,
        name: string,
    ) {
        try {
            if (!imageUrl) {
                return { url: imageUrl, expiring: true };
            }
            const response = await fetch(imageUrl);
            const buffer = Buffer.from(await response.arrayBuffer());
            const slackFileUrl = await this.uploadFile({
                organizationUuid,
                file: buffer,
                title: name,
            });
            return { url: slackFileUrl, expiring: false };
        } catch (e) {
            slackErrorHandler(e, 'Failed to upload image to slack');
            return { url: imageUrl, expiring: true };
        }
    }
}
