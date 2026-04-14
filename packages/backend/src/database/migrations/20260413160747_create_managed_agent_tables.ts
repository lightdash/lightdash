import { type Knex } from 'knex';

const ManagedAgentSettingsTableName = 'managed_agent_settings';
const ManagedAgentActionsTableName = 'managed_agent_actions';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable(ManagedAgentSettingsTableName, (table) => {
        table
            .uuid('project_uuid')
            .primary()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('schedule_cron').notNullable().defaultTo('*/30 * * * *');
        table
            .uuid('enabled_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        // Service account PAT created automatically when agent is enabled.
        // Encrypted at rest via EncryptionUtil (AES-256-GCM).
        // Used for MCP authentication via Anthropic vault.
        table.binary('service_account_token').nullable();
        // Anthropic platform resource IDs — persisted to avoid creating
        // duplicate environments and vaults on every service restart.
        table.text('anthropic_environment_id').nullable();
        table.text('anthropic_vault_id').nullable();
        // Slack channel ID for posting heartbeat summaries
        table.text('slack_channel_id').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(ManagedAgentActionsTableName, (table) => {
        table
            .uuid('action_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table.text('session_id').notNullable();
        table.text('action_type').notNullable();
        table.text('target_type').notNullable();
        table.uuid('target_uuid').notNullable();
        table.text('target_name').notNullable();
        table.text('description').notNullable();
        table.jsonb('metadata').notNullable().defaultTo('{}');
        table.timestamp('reversed_at', { useTz: false }).nullable();
        table
            .uuid('reversed_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });

    await knex.raw(`
        CREATE INDEX managed_agent_actions_project_date_idx
        ON ${ManagedAgentActionsTableName} (project_uuid, created_at DESC)
    `);

    await knex.raw(`
        CREATE INDEX managed_agent_actions_active_idx
        ON ${ManagedAgentActionsTableName} (project_uuid, created_at DESC)
        WHERE reversed_at IS NULL
    `);
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists(ManagedAgentActionsTableName);
    await knex.schema.dropTableIfExists(ManagedAgentSettingsTableName);
};
