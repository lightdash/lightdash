import {
    AnyType,
    friendlyName,
    getErrorMessage,
    getSlackErrorCode,
    isSlackRateLimitedError,
    isUnrecoverableSlackError,
    MissingConfigError,
    SLACK_ID_REGEX,
    SlackAppCustomSettings,
    SlackChannel,
    SlackError,
    SlackInstallationNotFoundError,
    SlackSettings,
    sleep,
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
    FilesCompleteUploadExternalResponse,
    WebAPICallResult,
    WebClient,
    type FilesUploadV2Arguments,
} from '@slack/web-api';
import { Express } from 'express';
import { throttle, without } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig, LoggingLevel } from '../../config/parseConfig';
import { SlackChannelType } from '../../database/entities/slackChannels';
import { slackErrorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { SlackAuthenticationModel } from '../../models/SlackAuthenticationModel';
import { SlackChannelCacheModel } from '../../models/SlackChannelCacheModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';

const DEFAULT_CACHE_TIME = 1000 * 60 * 10; // 10 minutes
const CHANNELS_LIMIT = 200;
// Maximum time to wait for initial sync when there's no cached data
const INITIAL_SYNC_TIMEOUT_MS = 60000; // 60 seconds
// Poll interval when waiting for sync to complete
const SYNC_POLL_INTERVAL_MS = 1000; // 1 second

// Slack Tier 2 rate limit throttling configuration
// Tier 2 allows 20+ requests/minute - we use only 20% to be a good API citizen
const TIER_2_REQUESTS_PER_MIN = 20;
const RATE_LIMIT_USAGE_PERCENT = 0.2; // Use only 20% of the rate limit
const THROTTLE_MIN_DELAY_MS = Math.ceil(
    60000 / (TIER_2_REQUESTS_PER_MIN * RATE_LIMIT_USAGE_PERCENT),
); // 15000ms = 15 seconds between requests

/**
 * Creates a throttled executor for Slack API calls.
 * Uses lodash throttle pattern to proactively stay within 20% of Tier 2 rate limits.
 * This prevents rate limit errors instead of reacting to them.
 * Includes a simple retry as safety net for unexpected rate limits (e.g., from other integrations).
 */
const createThrottledSlackExecutor = () => {
    let lastCallTime = 0;

    // Throttled function to track timing - ensures we don't call more than once per THROTTLE_MIN_DELAY_MS
    const trackCall = throttle(
        () => {
            lastCallTime = Date.now();
        },
        THROTTLE_MIN_DELAY_MS,
        { leading: true, trailing: false },
    );

    return async <T>(
        operation: () => Promise<T>,
        context: string,
    ): Promise<T> => {
        // Calculate wait time based on last call
        const now = Date.now();
        const timeSinceLastCall = now - lastCallTime;

        if (lastCallTime > 0 && timeSinceLastCall < THROTTLE_MIN_DELAY_MS) {
            const waitTime = THROTTLE_MIN_DELAY_MS - timeSinceLastCall;
            Logger.debug(
                `Throttling ${context}: waiting ${waitTime}ms to stay within 20% of Tier 2 rate limit`,
            );
            // eslint-disable-next-line no-await-in-loop
            await sleep(waitTime);
        }

        // Track this call
        trackCall();

        // Execute with simple retry as safety net for unexpected rate limits
        try {
            return await operation();
        } catch (error: unknown) {
            if (!isSlackRateLimitedError(error)) {
                // Only send unexpected errors to Sentry
                // Unrecoverable errors (account_inactive, invalid_auth, missing_scope)
                // are expected for orgs with broken installations - don't spam Sentry
                if (!isUnrecoverableSlackError(error)) {
                    slackErrorHandler(
                        error,
                        `Slack API error during ${context}`,
                    );
                }
                throw error;
            }

            // Unexpected rate limit - wait for retry_after and try once more
            let retryAfter = THROTTLE_MIN_DELAY_MS;
            if (
                error instanceof Error &&
                'retryAfter' in error &&
                typeof error.retryAfter === 'number'
            ) {
                retryAfter = error.retryAfter * 1000;
            }

            Logger.warn(
                `Unexpected rate limit during ${context} despite throttling. Waiting ${retryAfter}ms before retry.`,
            );
            await sleep(retryAfter);
            trackCall(); // Reset timing after waiting

            return operation();
        }
    };
};

export type SlackChannelForCache = {
    channelId: string;
    channelName: string;
    channelType: SlackChannelType;
    isArchived: boolean;
};

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
    slackChannelCacheModel: SlackChannelCacheModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    schedulerClient: SchedulerClient;
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

    slackChannelCacheModel: SlackChannelCacheModel;

    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    public isEnabled: boolean = false;

    private slackApp: App | undefined;

    private schedulerClient: SchedulerClient;

    constructor({
        slackAuthenticationModel,
        slackChannelCacheModel,
        lightdashConfig,
        analytics,
        schedulerClient,
    }: SlackClientArguments) {
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.slackAuthenticationModel = slackAuthenticationModel;
        this.slackChannelCacheModel = slackChannelCacheModel;
        this.schedulerClient = schedulerClient;

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

    async getWebClient(organizationUuid: string): Promise<WebClient> {
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
        // Check if organization has Slack installation
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) return undefined;

        const organizationId =
            await this.slackChannelCacheModel.getOrganizationId(
                organizationUuid,
            );

        const cacheMaxAge =
            this.lightdashConfig.slack?.channelsCachedTime ||
            DEFAULT_CACHE_TIME;

        // Get channels from DB cache
        const getCachedChannels = async (): Promise<SlackChannel[]> =>
            this.slackChannelCacheModel.getChannels(organizationId, {
                search,
                excludeArchived: filter.excludeArchived,
                excludeDms: filter.excludeDms,
                excludeGroups: filter.excludeGroups,
                includeChannelIds: filter.includeChannelIds,
                limit: CHANNELS_LIMIT,
            });

        // Check if we have any cached channels
        const hasChannels = await this.slackChannelCacheModel.hasAnyChannels(
            organizationId,
        );

        // Check if cache is stale
        const isStale =
            filter.forceRefresh ||
            (await this.slackChannelCacheModel.isCacheStale(
                organizationId,
                cacheMaxAge,
            ));

        if (!hasChannels) {
            // No cached data - we need to wait for sync to complete
            Logger.info(
                `No cached Slack channels for organization ${organizationUuid}, triggering sync and waiting`,
            );

            // Queue sync job
            await this.schedulerClient.syncSlackChannelsJob({
                organizationUuid,
                projectUuid: undefined,
                userUuid: undefined,
            });

            // Wait for sync to complete with timeout
            const startTime = Date.now();

            while (Date.now() - startTime < INITIAL_SYNC_TIMEOUT_MS) {
                // eslint-disable-next-line no-await-in-loop
                await sleep(SYNC_POLL_INTERVAL_MS);

                const syncStatus =
                    // eslint-disable-next-line no-await-in-loop
                    await this.slackChannelCacheModel.getSyncStatus(
                        organizationId,
                    );

                if (syncStatus?.channels_sync_status === 'completed') {
                    Logger.info(
                        `Slack channel sync completed for organization ${organizationUuid}`,
                    );
                    return getCachedChannels();
                }

                if (syncStatus?.channels_sync_status === 'error') {
                    Logger.error(
                        `Slack channel sync failed for organization ${organizationUuid}: ${syncStatus.channels_sync_error}`,
                    );
                    // Return empty array instead of throwing to not break the UI
                    return [];
                }
            }

            // Timeout - return whatever we have (might be empty)
            Logger.warn(
                `Slack channel sync timed out for organization ${organizationUuid}`,
            );
            return getCachedChannels();
        }

        // We have cached data
        if (isStale) {
            // Trigger background refresh (fire and forget)
            Logger.debug(
                `Triggering background Slack channel sync for organization ${organizationUuid}`,
            );
            this.schedulerClient
                .syncSlackChannelsJob({
                    organizationUuid,
                    projectUuid: undefined,
                    userUuid: undefined,
                })
                .catch((e) => {
                    Logger.warn(
                        `Failed to queue Slack channel sync job: ${e.message}`,
                    );
                });
        }

        // Return cached data immediately
        return getCachedChannels();
    }

    /**
     * Fetch all channels and users from Slack for background cache sync.
     * This method uses throttling to stay within 20% of Slack's Tier 2 rate limits.
     * Used by the scheduler task to populate the slack_channels cache table.
     */
    async fetchAllChannelsForCache(
        organizationUuid: string,
    ): Promise<SlackChannelForCache[]> {
        const webClient = await this.getWebClient(organizationUuid);

        const allChannels: SlackChannelForCache[] = [];

        // Create throttled executor - ensures we only use 20% of Tier 2 rate limit
        const throttledExecute = createThrottledSlackExecutor();

        // Fetch channels with pagination and throttling
        let channelCursor: string | undefined;
        do {
            /* eslint-disable @typescript-eslint/no-loop-func */
            // eslint-disable-next-line no-await-in-loop
            const conversations = await throttledExecute(
                () =>
                    webClient.conversations.list({
                        types: 'public_channel,private_channel',
                        exclude_archived: false, // Fetch all, store archived status
                        limit: 1000,
                        cursor: channelCursor,
                    }),
                'conversations.list',
            );
            /* eslint-enable @typescript-eslint/no-loop-func */

            if (conversations.channels) {
                for (const channel of conversations.channels) {
                    if (channel.id && channel.name) {
                        const isPrivate =
                            channel.id.startsWith('G') ||
                            channel.is_private === true;
                        allChannels.push({
                            channelId: channel.id,
                            channelName: `#${channel.name}`,
                            channelType: isPrivate
                                ? 'private_channel'
                                : 'channel',
                            isArchived: channel.is_archived ?? false,
                        });
                    }
                }
            }

            channelCursor = conversations.response_metadata?.next_cursor;

            if (channelCursor) {
                Logger.debug(
                    `Fetched ${allChannels.length} channels so far, continuing to next page`,
                );
            }
        } while (channelCursor);

        Logger.info(
            `Fetched ${allChannels.length} channels from Slack for organization ${organizationUuid}`,
        );

        // Fetch users for DMs with pagination and throttling
        let userCursor: string | undefined;
        do {
            /* eslint-disable @typescript-eslint/no-loop-func */
            // eslint-disable-next-line no-await-in-loop
            const users = await throttledExecute(
                () =>
                    webClient.users.list({
                        limit: 1000,
                        cursor: userCursor,
                    }),
                'users.list',
            );
            /* eslint-enable @typescript-eslint/no-loop-func */

            if (users.members) {
                for (const user of users.members) {
                    if (user.id && user.name && !user.is_bot) {
                        allChannels.push({
                            channelId: user.id,
                            channelName: `@${user.name}`,
                            channelType: 'dm',
                            isArchived: user.deleted ?? false,
                        });
                    }
                }
            }

            userCursor = users.response_metadata?.next_cursor;

            if (userCursor) {
                Logger.debug(
                    `Fetched ${allChannels.length} channels/users so far, continuing to next page`,
                );
            }
        } while (userCursor);

        Logger.info(
            `Fetched ${allChannels.length} total channels and users from Slack for organization ${organizationUuid}`,
        );

        return allChannels;
    }

    /**
     * Get all organization UUIDs that have Slack installations.
     * Used by the daily sync cron job to schedule sync jobs.
     */
    async getAllOrganizationsWithSlack(): Promise<string[]> {
        return this.slackChannelCacheModel.getAllOrganizationsWithSlack();
    }

    /**
     * Sync all Slack channels to the cache database.
     * Handles the full workflow: locking, fetching, upserting, and cleanup.
     * Returns sync result with status and channel count.
     */
    async syncChannelsToCache(organizationUuid: string): Promise<{
        status: 'completed' | 'skipped';
        reason: string;
        totalChannels: number;
    }> {
        // Check if installation has required scopes before syncing
        const installation =
            await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                organizationUuid,
            );

        if (!installation) {
            return {
                status: 'skipped',
                reason: 'No Slack installation found',
                totalChannels: 0,
            };
        }

        if (!this.hasRequiredScopes(installation.scopes)) {
            const currentScopes = installation.scopes.join(', ');
            const requiredScopes = this.getRequiredScopes().join(', ');
            Logger.debug(
                `Skipping Slack channel sync for organization ${organizationUuid}: missing required scopes. Has: [${currentScopes}], needs: [${requiredScopes}]`,
            );
            return {
                status: 'skipped',
                reason: 'Missing required Slack scopes - user needs to re-install',
                totalChannels: 0,
            };
        }

        const organizationId =
            await this.slackChannelCacheModel.getOrganizationId(
                organizationUuid,
            );

        if (!organizationId) {
            throw new Error(`Organization ${organizationUuid} not found`);
        }
        // Mark sync as started (for monitoring/UI purposes)
        // Note: Concurrency is handled by Graphile's jobKey deduplication
        await this.slackChannelCacheModel.startSync(organizationId);

        try {
            // Fetch all channels from Slack (handles rate limiting and pagination)
            const allChannels = await this.fetchAllChannelsForCache(
                organizationUuid,
            );

            // Upsert all channels to database
            await this.slackChannelCacheModel.upsertChannels(
                organizationId,
                allChannels,
            );

            // Soft delete channels that are no longer in Slack
            const channelIds = allChannels.map((c) => c.channelId);
            await this.slackChannelCacheModel.softDeleteChannelsNotInList(
                organizationId,
                channelIds,
            );

            // Mark sync as complete
            await this.slackChannelCacheModel.completeSync(
                organizationId,
                allChannels.length,
            );

            return {
                status: 'completed',
                reason: '',
                totalChannels: allChannels.length,
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);

            // Handle unrecoverable Slack errors gracefully (user needs to re-install)
            if (isUnrecoverableSlackError(error)) {
                const slackErrorCode = getSlackErrorCode(error);
                const reason = `Slack installation is invalid (${slackErrorCode}) - user needs to re-install`;
                Logger.warn(
                    `Skipping Slack channel sync for organization ${organizationUuid}: ${reason}`,
                );
                await this.slackChannelCacheModel.failSync(
                    organizationId,
                    reason,
                );
                return {
                    status: 'skipped',
                    reason,
                    totalChannels: 0,
                };
            }

            Logger.error(
                `Slack channel sync failed for organization ${organizationUuid}: ${errorMessage}`,
            );
            await this.slackChannelCacheModel.failSync(
                organizationId,
                errorMessage,
            );
            throw error;
        }
    }

    /**
     * Look up a channel by ID or name.
     * - If input looks like a Slack ID (C/G/U/W + alphanumerics), look up by ID
     * - If input looks like a name (#channel-name), search by name
     *
     * Used for on-demand fetching when user pastes a channel ID not in the cache.
     * 1. First checks the cache
     * 2. If not found (and ID), fetches directly from Slack API
     * 3. Caches the result for future lookups
     *
     * @returns SlackChannel if found, null if not found or no access
     */
    async lookupChannelById(
        organizationUuid: string,
        input: string,
    ): Promise<SlackChannel | null> {
        const organizationId =
            await this.slackChannelCacheModel.getOrganizationId(
                organizationUuid,
            );

        if (!organizationId) {
            throw new Error(`Organization ${organizationUuid} not found`);
        }

        const isSlackId = SLACK_ID_REGEX.test(input);

        if (isSlackId) {
            return this.lookupChannelByIdInternal(
                organizationUuid,
                organizationId,
                input,
            );
        }

        // Input looks like a channel name - search by name
        return this.lookupChannelByNameInternal(organizationId, input);
    }

    private async lookupChannelByIdInternal(
        organizationUuid: string,
        organizationId: number,
        channelId: string,
    ): Promise<SlackChannel | null> {
        // First check the cache
        const cachedChannel = await this.slackChannelCacheModel.getChannelById(
            organizationId,
            channelId,
        );

        if (cachedChannel) {
            return cachedChannel;
        }

        const webClient = await this.getWebClient(organizationUuid);
        try {
            const response = await webClient.conversations.info({
                channel: channelId,
            });
            if (
                !response.ok ||
                !response.channel?.id ||
                !response.channel?.name
            ) {
                return null;
            }

            // Cache the channel for future lookups
            const channelName = `#${response.channel.name}`;
            await this.slackChannelCacheModel.upsertChannels(organizationId, [
                {
                    channelId: response.channel.id,
                    channelName,
                    channelType: response.channel.is_private
                        ? 'private_channel'
                        : 'channel',
                },
            ]);
            return {
                id: response.channel.id,
                name: channelName,
            };
        } catch (error) {
            slackErrorHandler(
                error,
                `Error fetching Slack channel info for channel ${channelId}`,
            );
            return null;
        }
    }

    private async lookupChannelByNameInternal(
        organizationId: number,
        channelName: string,
    ): Promise<SlackChannel | null> {
        // First check the cache
        const cachedChannel =
            await this.slackChannelCacheModel.getChannelByName(
                organizationId,
                channelName,
            );

        if (cachedChannel) {
            return cachedChannel;
        }

        return null;
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
