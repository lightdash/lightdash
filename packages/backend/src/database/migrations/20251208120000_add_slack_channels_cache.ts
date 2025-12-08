import { Knex } from 'knex';

const SlackChannelsTableName = 'slack_channels';
const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    // Cache table for storing channel data (avoids rate limiting from Slack API on-demand requests)
    await knex.schema.createTable(SlackChannelsTableName, (table) => {
        table
            .uuid('slack_channel_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .integer('organization_id')
            .notNullable()
            .references('organization_id')
            .inTable(SlackAuthTokensTableName)
            .onDelete('CASCADE');
        table
            .string('channel_id')
            .notNullable()
            .comment('Slack channel ID (e.g., C01234567)');
        table
            .string('channel_name')
            .notNullable()
            .comment('Display name with prefix (#channel or @user)');
        table
            .string('channel_type')
            .notNullable()
            .comment('channel | private_channel | dm');
        table.boolean('is_archived').notNullable().defaultTo(false);
        table
            .timestamp('deleted_at', { useTz: false })
            .nullable()
            .comment(
                'Soft delete timestamp - set when channel not found in Slack sync',
            );
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['organization_id', 'channel_id']);
        table.index('organization_id');
        table.index(['organization_id', 'channel_name']);
        table.index(['organization_id', 'deleted_at']); // For filtering active channels
        table.index(['organization_id', 'is_archived']); // For filtering archived channels
    });

    // Add channel sync status columns to slack_auth_tokens
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table
            .timestamp('channels_last_sync_at', { useTz: false })
            .nullable()
            .comment('Last time channels were synced from Slack');
        table
            .string('channels_sync_status')
            .nullable()
            .comment('scheduled | started | completed | error');
        table.text('channels_sync_error').nullable();
        table.integer('channels_count').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.dropColumn('channels_last_sync_at');
        table.dropColumn('channels_sync_status');
        table.dropColumn('channels_sync_error');
        table.dropColumn('channels_count');
    });
    await knex.schema.dropTableIfExists(SlackChannelsTableName);
}
