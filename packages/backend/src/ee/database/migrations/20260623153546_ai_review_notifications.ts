import { Knex } from 'knex';

const SETTINGS_TABLE = 'ai_agent_review_notification_settings';
const LOG_TABLE = 'ai_agent_review_notification';
const ORGANIZATIONS_TABLE = 'organizations';
const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(SETTINGS_TABLE, (table) => {
        table
            .uuid('organization_uuid')
            .primary()
            .references('organization_uuid')
            .inTable(ORGANIZATIONS_TABLE)
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.text('slack_channel_id').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable(LOG_TABLE, (table) => {
        table
            .uuid('notification_log_uuid')
            .primary()
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable(ORGANIZATIONS_TABLE)
            .onDelete('CASCADE')
            .index();
        table.text('fingerprint').notNullable();
        table
            .uuid('recipient_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable(USERS_TABLE)
            .onDelete('SET NULL')
            .index();
        table.text('channel').notNullable();
        table.text('event').notNullable();
        table.text('status').notNullable();
        table.text('error').nullable();
        table.timestamp('sent_at').nullable();
        table.timestamp('clicked_at').nullable();
        table.timestamp('dismissed_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.index(['organization_uuid', 'fingerprint']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(LOG_TABLE);
    await knex.schema.dropTableIfExists(SETTINGS_TABLE);
}
