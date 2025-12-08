import { Knex } from 'knex';

export const SlackChannelsTableName = 'slack_channels';

export type SlackChannelType = 'channel' | 'private_channel' | 'dm';

export type DbSlackChannel = {
    slack_channel_uuid: string;
    organization_id: number;
    channel_id: string;
    channel_name: string;
    channel_type: SlackChannelType;
    is_archived: boolean;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbSlackChannel = Pick<
    DbSlackChannel,
    'organization_id' | 'channel_id' | 'channel_name' | 'channel_type'
> &
    Partial<Pick<DbSlackChannel, 'is_archived' | 'deleted_at'>>;

export type UpdateDbSlackChannel = Partial<
    Pick<
        DbSlackChannel,
        'channel_name' | 'is_archived' | 'deleted_at' | 'updated_at'
    >
>;

export type SlackChannelsTable = Knex.CompositeTableType<
    DbSlackChannel,
    CreateDbSlackChannel,
    UpdateDbSlackChannel
>;
