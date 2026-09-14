import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates two new empty mobile push notification tables',
} as const;

const installationsTable = 'mobile_push_installations';
const liveActivitiesTable = 'ai_agent_live_activities';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.createTable(installationsTable, (table) => {
        table
            .uuid('mobile_push_installation_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.uuid('installation_uuid').notNullable().unique();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .text('environment')
            .notNullable()
            .checkIn(['sandbox', 'production']);
        table.binary('encrypted_device_token').notNullable();
        table.string('device_token_fingerprint', 64).notNullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['environment', 'device_token_fingerprint']);
        table.index(['organization_uuid', 'user_uuid']);
    });

    await knex.schema.createTable(liveActivitiesTable, (table) => {
        table.uuid('live_activity_uuid').primary();
        table
            .uuid('mobile_push_installation_uuid')
            .notNullable()
            .references('mobile_push_installation_uuid')
            .inTable(installationsTable)
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
        table
            .uuid('agent_uuid')
            .notNullable()
            .references('ai_agent_uuid')
            .inTable('ai_agent')
            .onDelete('CASCADE');
        table
            .uuid('thread_uuid')
            .notNullable()
            .references('ai_thread_uuid')
            .inTable('ai_thread')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE');
        table.binary('encrypted_push_token').notNullable();
        table.string('push_token_fingerprint', 64).notNullable().unique();
        table
            .text('last_delivered_state')
            .nullable()
            .checkIn(['working', 'waiting_for_you', 'idle']);
        table
            .timestamp('last_delivered_state_changed_at', { useTz: false })
            .nullable();
        table.timestamp('last_delivered_at', { useTz: false }).nullable();
        table.timestamp('stale_at', { useTz: false }).nullable();
        table.timestamp('ended_at', { useTz: false }).nullable();
        table
            .timestamp('completion_alert_completed_at', { useTz: false })
            .nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.index(['organization_uuid', 'user_uuid']);
        table.index(['thread_uuid', 'ended_at']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(liveActivitiesTable);
    await knex.schema.dropTableIfExists(installationsTable);
}
