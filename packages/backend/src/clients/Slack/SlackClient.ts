import {
    AnyType,
    friendlyName,
    getErrorMessage,
    LightdashMode,
    MissingConfigError,
    ScreenshotError,
    SlackAppCustomSettings,
    SlackChannel,
    SlackInstallationNotFoundError,
    SlackSettings,
    UnexpectedServerError,
} from '@lightdash/common';
import { App, Block, ExpressReceiver, LogLevel } from '@slack/bolt';
import {
    ChatPostMessageArguments,
    ChatUpdateArguments,
    ConversationsListResponse,
    FilesCompleteUploadExternalResponse,
    UsersListResponse,
    WebAPICallResult,
    WebClient,
    type FilesUploadV2Arguments,
} from '@slack/web-api';
import { Express } from 'express';
import { without } from 'lodash';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { slackErrorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import {
    ScreenshotContext,
    Unfurl,
    UnfurlService,
} from '../../services/UnfurlService/UnfurlService';
import { getUnfurlBlocks } from './SlackMessageBlocks';

const DEFAULT_CACHE_TIME = 1000 * 60 * 10; // 10 minutes
const MAX_CHANNELS_LIMIT = 100000;

export type PostSlackFile = {
    organizationUuid: string;
    channelId: string;
    threadTs: string;
    file: FilesUploadV2Arguments['file'];
    title: string;
    comment?: string;
    filename: string;
    fileType?: string;
};

const notifySlackError = async (
    error: unknown,
    url: string,
    client: AnyType,
    event: AnyType,
    { appProfilePhotoUrl }: { appProfilePhotoUrl?: string },
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
            ...(appProfilePhotoUrl ? { icon_url: appProfilePhotoUrl } : {}),
            text: `:fire: Unable to unfurl ${url}: ${error}`,
        })
        .catch((er: unknown) =>
            Logger.error(
                `Unable send slack error message: ${getErrorMessage(er)}`,
            ),
        );
};

export type SlackClientArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    public isEnabled: boolean = false;

    private channelsCache: Map<
        string,
        { lastCached: Date; channels: SlackChannel[] }
    > = new Map();

    constructor({
        slackAuthenticationModel,
        lightdashConfig,
        analytics,
    }: SlackClientArguments) {
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.slackAuthenticationModel = slackAuthenticationModel;

        if (this.lightdashConfig.slack?.clientId) {
            this.isEnabled = true;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    public getRequiredScopes() {
        return [
            'links:read',
            'links:write',
            'chat:write',
            'chat:write.customize',
            'channels:read',
            'channels:join',
            'groups:read',
            'users:read',
            'app_mentions:read',
            'files:write',
            'files:read',
        ];
    }

    public getSlackOptions() {
        return {
            signingSecret: this.lightdashConfig.slack?.signingSecret || '',
            clientId: this.lightdashConfig.slack?.clientId || '',
            clientSecret: this.lightdashConfig.slack?.clientSecret || '',
            stateSecret: this.lightdashConfig.slack?.stateSecret || '',

            redirectUri: `${this.lightdashConfig.siteUrl}/api/v1/slack/oauth_redirect`,
            installerOptions: {
                directInstall: true,
                // The default value for redirectUriPath is ‘/slack/oauth_redirect’, but we override it to match the existing redirect route in the Slack app manifest files.
                redirectUriPath: '/api/v1/slack/oauth_redirect',
                userScopes: [],
            },
            scopes: this.getRequiredScopes(),
        };
    }

    public hasRequiredScopes(installationScopes: string[]) {
        const requiredScopes = this.getRequiredScopes();
        return without(requiredScopes, ...installationScopes).length === 0;
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
        filter: {
            excludeArchived?: boolean;
            excludeDms?: boolean;
            excludeGroups?: boolean;
            forceRefresh?: boolean;
        } = {
            excludeArchived: true,
            excludeDms: false,
            excludeGroups: false,
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
            if (filter.excludeDms) {
                finalResults = finalResults.filter(
                    (channel) =>
                        !channel.id.startsWith('D') &&
                        !channel.id.startsWith('U'),
                );
            }
            if (filter.excludeGroups) {
                finalResults = finalResults.filter(
                    (channel) => !channel.id.startsWith('G'),
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

        let { channelId } = args;
        // If the channel ID is a user ID (starts with U), we need to open a DM channel first
        // Slack API's files.uploadV2 doesn't support uploading files where channel_id is a user ID
        if (channelId.startsWith('U')) {
            try {
                const response = await webClient.conversations.open({
                    users: channelId,
                });
                if (!response.ok || !response.channel?.id) {
                    throw new Error('Failed to open DM channel');
                }
                channelId = response.channel.id;
            } catch (error) {
                Logger.error(
                    `Failed to open DM channel with user ${channelId}`,
                    error,
                );
                throw new Error(`Failed to open DM channel: ${error}`);
            }
        }

        const result = await webClient.files.uploadV2({
            channel_id: channelId,
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

    async getUserInfo(
        organizationUuid: string,
        userId: string,
    ): Promise<{
        id: string;
        name?: string;
        image?: string;
    }> {
        const webClient = await this.getWebClient(organizationUuid);
        const response = await webClient.users.info({ user: userId });

        if (!response.ok) {
            throw new UnexpectedServerError(
                `Failed to get user info for ${userId}: ${response.error}`,
            );
        }
        if (!response.user?.profile) {
            throw new UnexpectedServerError(
                `Failed to get user info for ${userId}: No profile found`,
            );
        }

        return {
            id: userId,
            name: response.user.profile.real_name,
            image: response.user.profile.image_512,
        };
    }

    async getAppName(organizationUuid: string): Promise<string | undefined> {
        const webClient = await this.getWebClient(organizationUuid);

        // Get the raw installation data from the database which includes bot.id
        const installation =
            await this.slackAuthenticationModel.getRawInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) {
            throw new SlackInstallationNotFoundError();
        }

        try {
            // Try to get bot info using the bot ID from the installation
            const botId = installation?.bot?.id;
            if (botId) {
                const botResponse = await webClient.bots.info({
                    bot: botId,
                });

                if (botResponse.ok && botResponse.bot) {
                    return botResponse.bot.name;
                }
            }

            return undefined;
        } catch (error) {
            Logger.warn(
                `Failed to get app info for organization ${organizationUuid}: ${error}`,
            );
            return undefined;
        }
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

    async start(
        expressApp: Express,
        unfurlService: UnfurlService,
        aiAgentService: AnyType,
    ) {
        if (!this.lightdashConfig.slack?.clientId) {
            Logger.warn(`Missing "SLACK_CLIENT_ID", Slack App will not run`);
            return;
        }

        try {
            if (this.lightdashConfig.slack?.socketMode) {
                const app = new App({
                    ...this.getSlackOptions(),
                    installationStore: {
                        storeInstallation: (i) =>
                            this.slackAuthenticationModel.createInstallation(i),
                        fetchInstallation: (i) =>
                            this.slackAuthenticationModel.getInstallation(i),
                        deleteInstallation: (i) =>
                            this.slackAuthenticationModel.deleteInstallation(i),
                    },
                    logLevel: LogLevel.INFO,
                    port: this.lightdashConfig.slack.port,
                    socketMode: this.lightdashConfig.slack.socketMode,
                    appToken: this.lightdashConfig.slack.appToken,
                });
                this.addEventListeners(app, unfurlService, aiAgentService);
            } else {
                const slackReceiver = new ExpressReceiver({
                    ...this.getSlackOptions(),
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
                    ...this.getSlackOptions(),

                    receiver: slackReceiver,
                });
                this.addEventListeners(app, unfurlService, aiAgentService);
            }
        } catch (e: unknown) {
            Logger.error(`Unable to start Slack app ${e}`);
        }
    }

    protected addEventListeners(
        app: App,
        unfurlService: UnfurlService,
        // TODO: aiAgentService is optional, but we need to handle it in the service
        aiAgentService: AnyType,
    ) {
        app.event('link_shared', (m) => this.unfurlSlackUrls(m, unfurlService));
    }

    private async sendUnfurl(
        event: AnyType,
        originalUrl: string,
        unfurl: Unfurl,
        client: AnyType,
    ) {
        const unfurlBlocks = getUnfurlBlocks(originalUrl, unfurl);
        await client.chat
            .unfurl({
                ts: event.message_ts,
                channel: event.channel,
                unfurls: unfurlBlocks,
            })
            .catch((e: unknown) => {
                this.analytics.track({
                    event: 'share_slack.unfurl_error',
                    userId: event.user,
                    properties: {
                        error: `${getErrorMessage(e)}`,
                    },
                });
                Logger.error(
                    `Unable to unfurl on slack ${JSON.stringify(
                        unfurlBlocks,
                    )}: ${JSON.stringify(e)}`,
                );
            });
    }

    // TODO: this is an antipattern, we should not have UnfurlService as a parameter here
    // in fact, we should not have unfurlSlackUrls here at all, it should be moved to the service
    async unfurlSlackUrls(message: AnyType, unfurlService: UnfurlService) {
        const { event, client, context } = message;
        let appProfilePhotoUrl: string | undefined;

        if (event.channel === 'COMPOSER') return; // Do not unfurl urls when typing, only when message is sent

        Logger.debug(`Got link_shared slack event ${event.message_ts}`);

        event.links.map(async (l: AnyType) => {
            const eventUserId = context.botUserId;

            try {
                const { teamId } = context;
                const details = await unfurlService.unfurlDetails(l.url);

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

                    if (!installation) {
                        throw new SlackInstallationNotFoundError();
                    }

                    appProfilePhotoUrl = installation.appProfilePhotoUrl;

                    const { imageUrl } = await unfurlService.unfurlImage({
                        url: details.minimalUrl,
                        lightdashPage: details.pageType,
                        imageId,
                        authUserUuid,
                        context: ScreenshotContext.SLACK,
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
                        appProfilePhotoUrl,
                    });
                }
                if (!(e instanceof ScreenshotError)) {
                    slackErrorHandler(e, 'Unable to unfurl slack URL');
                }

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
