import {
    NotFoundError,
    SchedulerJobStatus,
    SlackChannel,
} from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationTableName } from '../database/entities/organizations';
import {
    DbSlackAuthTokens,
    SlackAuthTokensTableName,
} from '../database/entities/slackAuthentication';
import {
    CreateDbSlackChannel,
    DbSlackChannel,
    SlackChannelsTableName,
    SlackChannelType,
} from '../database/entities/slackChannels';

const CHANNELS_LIMIT = 200;

type SlackChannelCacheModelArguments = {
    database: Knex;
};

type GetChannelsFilter = {
    search?: string;
    excludeArchived?: boolean;
    excludeDms?: boolean;
    excludeGroups?: boolean;
    includeChannelIds?: string[];
    limit?: number;
};

export class SlackChannelCacheModel {
    protected database: Knex;

    constructor(args: SlackChannelCacheModelArguments) {
        this.database = args.database;
    }

    async getOrganizationId(organizationUuid: string): Promise<number> {
        const [row] = await this.database(OrganizationTableName)
            .select('organization_id')
            .where('organization_uuid', organizationUuid);

        if (!row) {
            throw new NotFoundError(
                `Organization not found: ${organizationUuid}`,
            );
        }

        return row.organization_id;
    }

    async getChannels(
        organizationId: number,
        filter: GetChannelsFilter = {},
    ): Promise<SlackChannel[]> {
        const limit = filter.limit ?? CHANNELS_LIMIT;

        let query = this.database(SlackChannelsTableName)
            .select({
                id: 'channel_id',
                name: 'channel_name',
            })
            .where('organization_id', organizationId)
            .whereNull('deleted_at'); // Exclude soft-deleted channels

        if (filter.excludeArchived !== false) {
            query = query.where('is_archived', false);
        }

        if (filter.excludeDms) {
            query = query.whereNot('channel_type', 'dm');
        }

        if (filter.excludeGroups) {
            query = query.whereNot('channel_type', 'private_channel');
        }

        if (filter.search) {
            query = query.whereILike('channel_name', `%${filter.search}%`);
        }

        query = query.orderBy('channel_name', 'asc').limit(limit);

        let results = await query;

        // Always include specified channel IDs (e.g., currently selected channels)
        // Note: includeChannelIds can include soft-deleted channels (user may have selected them before deletion)
        if (filter.includeChannelIds && filter.includeChannelIds.length > 0) {
            const resultIds = new Set(results.map((r) => r.id));
            const missingIds = filter.includeChannelIds.filter(
                (id) => !resultIds.has(id),
            );

            if (missingIds.length > 0) {
                const includedRows = await this.database(SlackChannelsTableName)
                    .select({
                        id: 'channel_id',
                        name: 'channel_name',
                    })
                    .where('organization_id', organizationId)
                    .whereIn('channel_id', missingIds);

                results = [...results, ...includedRows];
            }
        }

        return results;
    }

    async getChannelById(
        organizationId: number,
        channelId: string,
    ): Promise<SlackChannel | null> {
        const [row] = await this.database(SlackChannelsTableName)
            .select<DbSlackChannel[]>('channel_id', 'channel_name')
            .where('organization_id', organizationId)
            .where('channel_id', channelId)
            .whereNull('deleted_at');

        if (!row) return null;

        return {
            id: row.channel_id,
            name: row.channel_name,
        };
    }

    /**
     * Get sync status from slack_auth_tokens table
     */
    async getSyncStatus(
        organizationId: number,
    ): Promise<Pick<
        DbSlackAuthTokens,
        | 'channels_last_sync_at'
        | 'channels_sync_started_at'
        | 'channels_sync_status'
        | 'channels_sync_error'
        | 'channels_count'
    > | null> {
        const [row] = await this.database(SlackAuthTokensTableName)
            .select<
                Pick<
                    DbSlackAuthTokens,
                    | 'channels_last_sync_at'
                    | 'channels_sync_started_at'
                    | 'channels_sync_status'
                    | 'channels_sync_error'
                    | 'channels_count'
                >[]
            >(
                'channels_last_sync_at',
                'channels_sync_started_at',
                'channels_sync_status',
                'channels_sync_error',
                'channels_count',
            )
            .where('organization_id', organizationId);

        return row ?? null;
    }

    async isCacheStale(
        organizationId: number,
        maxAgeMs: number,
    ): Promise<boolean> {
        const syncStatus = await this.getSyncStatus(organizationId);

        if (!syncStatus) {
            return true; // No Slack installation exists
        }

        if (syncStatus.channels_sync_status === SchedulerJobStatus.STARTED) {
            return false; // Sync is already running, don't trigger another
        }

        if (!syncStatus.channels_last_sync_at) {
            return true; // Sync never completed successfully
        }

        const cacheAge =
            new Date().getTime() - syncStatus.channels_last_sync_at.getTime();
        return cacheAge > maxAgeMs;
    }

    async hasAnyChannels(organizationId: number): Promise<boolean> {
        const [row] = await this.database(SlackChannelsTableName)
            .count<{ count: string }[]>('* as count')
            .where('organization_id', organizationId);

        return parseInt(row?.count ?? '0', 10) > 0;
    }

    async upsertChannels(
        organizationId: number,
        channels: Array<{
            channelId: string;
            channelName: string;
            channelType: SlackChannelType;
            isArchived?: boolean;
        }>,
    ): Promise<void> {
        if (channels.length === 0) return;

        const now = new Date();
        const rows: CreateDbSlackChannel[] = channels.map((channel) => ({
            organization_id: organizationId,
            channel_id: channel.channelId,
            channel_name: channel.channelName,
            channel_type: channel.channelType,
            is_archived: channel.isArchived ?? false,
            deleted_at: null, // Clear soft-delete on upsert (restores if previously deleted)
        }));

        // Batch insert/update with upsert
        // Only update columns that have actually changed using CASE WHEN
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            // eslint-disable-next-line no-await-in-loop
            await this.database(SlackChannelsTableName)
                .insert(batch)
                .onConflict(['organization_id', 'channel_id'])
                .merge({
                    // Only update if value changed (conditional update)
                    channel_name: this.database.raw(
                        'CASE WHEN EXCLUDED.channel_name != slack_channels.channel_name THEN EXCLUDED.channel_name ELSE slack_channels.channel_name END',
                    ),
                    channel_type: this.database.raw(
                        'CASE WHEN EXCLUDED.channel_type != slack_channels.channel_type THEN EXCLUDED.channel_type ELSE slack_channels.channel_type END',
                    ),
                    is_archived: this.database.raw(
                        'CASE WHEN EXCLUDED.is_archived != slack_channels.is_archived THEN EXCLUDED.is_archived ELSE slack_channels.is_archived END',
                    ),
                    deleted_at: this.database.raw('NULL'), // Always clear soft-delete
                    // Only bump updated_at if something actually changed
                    updated_at: this.database.raw(
                        `CASE WHEN EXCLUDED.channel_name != slack_channels.channel_name
                            OR EXCLUDED.channel_type != slack_channels.channel_type
                            OR EXCLUDED.is_archived != slack_channels.is_archived
                            OR slack_channels.deleted_at IS NOT NULL
                         THEN ? ELSE slack_channels.updated_at END`,
                        [now],
                    ),
                });
        }
    }

    /**
     * Soft delete channels that are not in the provided list.
     * Sets deleted_at timestamp instead of hard deleting.
     */
    async softDeleteChannelsNotInList(
        organizationId: number,
        channelIds: string[],
    ): Promise<number> {
        const now = new Date();

        if (channelIds.length === 0) {
            // Soft delete all channels for this org
            return this.database(SlackChannelsTableName)
                .where('organization_id', organizationId)
                .whereNull('deleted_at') // Only update non-deleted channels
                .update({
                    deleted_at: now,
                    updated_at: now,
                });
        }

        return this.database(SlackChannelsTableName)
            .where('organization_id', organizationId)
            .whereNotIn('channel_id', channelIds)
            .whereNull('deleted_at') // Only update non-deleted channels
            .update({
                deleted_at: now,
                updated_at: now,
            });
    }

    /**
     * Start a sync by updating the status in slack_auth_tokens.
     * Note: Concurrency is handled by Graphile's jobKey deduplication,
     * so this just updates status for monitoring/UI purposes.
     */
    async startSync(organizationId: number): Promise<void> {
        const now = new Date();

        await this.database(SlackAuthTokensTableName)
            .update({
                channels_sync_status: SchedulerJobStatus.STARTED,
                channels_sync_started_at: now,
                channels_sync_error: null,
            })
            .where('organization_id', organizationId);
    }

    async completeSync(
        organizationId: number,
        totalChannels: number,
    ): Promise<void> {
        const now = new Date();
        await this.database(SlackAuthTokensTableName)
            .update({
                channels_sync_status: SchedulerJobStatus.COMPLETED,
                channels_last_sync_at: now,
                channels_count: totalChannels,
                channels_sync_error: null,
            })
            .where('organization_id', organizationId);
    }

    async failSync(organizationId: number, error: string): Promise<void> {
        await this.database(SlackAuthTokensTableName)
            .update({
                channels_sync_status: SchedulerJobStatus.ERROR,
                channels_sync_error: error,
            })
            .where('organization_id', organizationId);
    }

    /**
     * Get all organization UUIDs that have Slack installations.
     * Used by the daily sync cron job.
     */
    async getAllOrganizationsWithSlack(): Promise<string[]> {
        const rows = await this.database(SlackAuthTokensTableName)
            .join(
                OrganizationTableName,
                `${SlackAuthTokensTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .select(`${OrganizationTableName}.organization_uuid`);

        return rows.map((row) => row.organization_uuid);
    }
}
