import {
    AnyType,
    friendlyName,
    MissingConfigError,
    SlackAppCustomSettings,
    SlackChannel,
    SlackError,
    SlackInstallationNotFoundError,
    SlackSettings,
    UnexpectedServerError,
} from '@lightdash/common';
import {
    App,
    Block,
    ExpressReceiver,
    LogLevel as SlackLogLevel,
    type InstallationStore,
} from '@slack/bolt';
import { InstallProvider } from '@slack/oauth';
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
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig, LoggingLevel } from '../../config/parseConfig';
import { slackErrorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';

const DEFAULT_CACHE_TIME = 1000 * 60 * 10; // 10 minutes
const CHANNELS_LIMIT = 200;

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

export type SlackClientArguments = {
    slackAuthenticationModel: SlackAuthenticationModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
};

const lightdashLogLevelToSlackLogLevel = (
    level: LoggingLevel,
): SlackLogLevel => {
    switch (level) {
        case 'error':
            return SlackLogLevel.ERROR;
        case 'warn':
            return SlackLogLevel.WARN;
        case 'info':
            return SlackLogLevel.INFO;
        case 'debug':
            return SlackLogLevel.DEBUG;
        default:
            return SlackLogLevel.INFO;
    }
};

export class SlackClient {
    slackAuthenticationModel: SlackAuthenticationModel;

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    public isEnabled: boolean = false;

    private slackApp: App | undefined;

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

    public getApp(): App | undefined {
        return this.slackApp;
    }

    // eslint-disable-next-line class-methods-use-this
    public getRequiredScopes() {
        return [
            'links:read',
            'links:write',
            'chat:write',
            'chat:write.customize',
            'channels:read',
            'groups:read',
            'users:read',
            'app_mentions:read',
            'files:write',
            'files:read',
            // 'channels:join', - Made optional since users can manually add the app to channels
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
            includeChannelIds?: string[];
        } = {
            excludeArchived: true,
            excludeDms: false,
            excludeGroups: false,
        },
    ): Promise<SlackChannel[] | undefined> {
        // Create cache key that includes filters that affect API calls
        const cacheKey = `${organizationUuid}:${JSON.stringify({
            excludeArchived: filter.excludeArchived,
            excludeDms: filter.excludeDms,
            excludeGroups: filter.excludeGroups,
        })}`;

        const getCachedChannels = () => {
            const cached = this.channelsCache.get(cacheKey);
            if (!cached) return undefined;

            let finalResults = cached.channels;

            if (search) {
                finalResults = finalResults.filter((channel) =>
                    channel.name.toLowerCase().includes(search.toLowerCase()),
                );
            }

            // Always include specified channel IDs (e.g., currently selected channels)
            const includeIds = filter.includeChannelIds ?? [];
            const includedChannels =
                includeIds.length > 0
                    ? cached.channels.filter((channel) =>
                          includeIds.includes(channel.id),
                      )
                    : [];

            if (finalResults.length > CHANNELS_LIMIT) {
                Logger.debug(
                    `Limiting Slack channels response to ${CHANNELS_LIMIT} (total: ${finalResults.length}). Use search to find specific channels.`,
                );
                const limited = finalResults.slice(0, CHANNELS_LIMIT);
                // Merge included channels that aren't already in the limited results
                const limitedIds = new Set(limited.map((c) => c.id));
                const missingIncluded = includedChannels.filter(
                    (c) => !limitedIds.has(c.id),
                );
                return [...limited, ...missingIncluded];
            }

            return finalResults;
        };

        const isCacheValid = () => {
            if (filter.forceRefresh) return false;
            const cached = this.channelsCache.get(cacheKey);
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
                break;
            }
        } while (nextCursor);
        Logger.debug(`Total slack channels ${allChannels.length}`);

        let allUsers: UsersListResponse['members'] = [];
        if (!filter.excludeDms) {
            nextCursor = undefined;
            do {
                try {
                    Logger.debug(
                        `Fetching slack users with cursor ${nextCursor}`,
                    );

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
                    break;
                }
            } while (nextCursor);
            Logger.debug(`Total slack users ${allUsers.length}`);
        }

        const sortedChannels = allChannels
            .filter(({ id, name }) => id && name)
            .filter(({ id }) => !filter.excludeGroups || !id!.startsWith('G'))
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
        this.channelsCache.set(cacheKey, {
            lastCached: new Date(),
            channels,
        });

        return getCachedChannels();
    }

    private static async isBotInChannel(
        webClient: WebClient,
        channelId: string,
    ): Promise<boolean> {
        try {
            // Use conversations.info to check if bot is a member
            // This works with channels:read and groups:read scopes
            const response = await webClient.conversations.info({
                channel: channelId,
            });

            return response.channel?.is_member ?? false;
        } catch (e: AnyType) {
            // If we can't check membership (e.g., private channel we're not in), assume we're not in it
            Logger.debug(
                `Unable to check bot membership for channel ${channelId}: ${
                    e?.message || e
                }`,
            );
            return false;
        }
    }

    async joinChannels(organizationUuid: string, channels: string[]) {
        if (channels.length === 0) return;

        try {
            const webClient = await this.getWebClient(organizationUuid);

            // Filter out DM channels
            const channelsToJoin = channels.filter(
                (channel) => !channel.startsWith('U'),
            );

            if (channelsToJoin.length === 0) return;

            // Check which channels we're already in
            const membershipChecks = await Promise.allSettled(
                channelsToJoin.map(async (channel) => ({
                    channel,
                    isMember: await SlackClient.isBotInChannel(
                        webClient,
                        channel,
                    ),
                })),
            );

            const channelsNeedingJoin = membershipChecks
                .filter(
                    (result) =>
                        result.status === 'fulfilled' && !result.value.isMember,
                )
                .map((result) =>
                    result.status === 'fulfilled' ? result.value.channel : '',
                )
                .filter(Boolean);

            if (channelsNeedingJoin.length === 0) {
                Logger.debug(
                    `Bot is already a member of all channels: ${channelsToJoin.join(
                        ', ',
                    )}`,
                );
                return;
            }

            const joinPromises = channelsNeedingJoin.map((channel) =>
                webClient.conversations.join({ channel }),
            );
            await Promise.all(joinPromises);
            Logger.debug(
                `Successfully joined channels: ${channelsNeedingJoin.join(
                    ', ',
                )}`,
            );
        } catch (e: AnyType) {
            Logger.error(
                `Unable to join channels ${channels.join(
                    ', ',
                )} on organization ${organizationUuid}`,
                e,
            );
            // If the channels:join scope is missing, provide a helpful error
            if (e?.data?.error === 'missing_scope') {
                Logger.warn(
                    `Unable to join channels ${channels.join(
                        ', ',
                    )} on organization ${organizationUuid}: missing channels:join scope. The app can still be added to channels manually.`,
                );
                throw new SlackError(
                    `Unable to join channel(s): missing channels:join scope. Add the app to the channel(s) manually.`,
                );
            }
            slackErrorHandler(
                e,
                `Unable to join channels ${channels.join(
                    ', ',
                )} on organization ${organizationUuid}`,
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

    async start(expressApp: Express) {
        if (!this.lightdashConfig.slack?.clientId) {
            Logger.warn(`Missing "SLACK_CLIENT_ID", Slack App will not run`);
            return;
        }

        let app: App | undefined;
        const slackOptions = this.getSlackOptions();
        const logLevel = lightdashLogLevelToSlackLogLevel(
            this.lightdashConfig.logging.level ?? 'info',
        );
        const installationStore: InstallationStore = {
            storeInstallation: (i) =>
                this.slackAuthenticationModel.createInstallation(i),
            fetchInstallation: (i) =>
                this.slackAuthenticationModel.getInstallation(i),
            deleteInstallation: (i) =>
                this.slackAuthenticationModel.deleteInstallation(i),
        };

        try {
            if (this.lightdashConfig.slack?.socketMode) {
                if (!this.lightdashConfig.slack.appToken) {
                    throw new MissingConfigError(
                        'Missing "SLACK_APP_TOKEN" to start Slack Client in socket mode',
                    );
                }

                // Create InstallProvider for OAuth routes
                const installProvider = new InstallProvider({
                    ...slackOptions,
                    installationStore,
                    logLevel,
                });

                // Register OAuth routes manually, the SocketModeReceiver doesn't seem to handle the oauth flow
                expressApp.get(
                    slackOptions.installerOptions.redirectUriPath,
                    async (req, res) => {
                        await installProvider.handleCallback(req, res);
                    },
                );

                app = new App({
                    ...slackOptions,
                    socketMode: this.lightdashConfig.slack.socketMode,
                    appToken: this.lightdashConfig.slack.appToken,
                    port: this.lightdashConfig.slack.port,
                    installationStore,
                    logLevel,
                });
            } else {
                const slackReceiver = new ExpressReceiver({
                    ...slackOptions,
                    installationStore,
                    logLevel,
                    app: expressApp,
                });

                app = new App({
                    ...slackOptions,
                    receiver: slackReceiver,
                });
            }
        } catch (e: unknown) {
            Logger.error(`Unable to start Slack app ${e}`);
        }

        if (app) {
            this.slackApp = app;

            try {
                await app.start();
                Logger.info('Slack app initialized successfully');
            } catch (e) {
                Logger.error(`Unable to start Slack app ${e}`);
            }
        }
    }
}
