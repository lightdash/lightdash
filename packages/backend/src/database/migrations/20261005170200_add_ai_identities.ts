import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds account-scoped AI identity, event and job tables without changing existing data.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('ai_identity_accounts', (table) => {
        table
            .uuid('ai_identity_account_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table.text('snowflake_account').notNullable();
        table.text('twin_name_template').nullable();
        table.timestamp('last_full_check_at', { useTz: true }).nullable();
        table.timestamps(true, true);
        table.unique(['organization_uuid', 'snowflake_account']);
    });
    await knex.schema.createTable('ai_identities', (table) => {
        table
            .uuid('ai_identity_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('ai_identity_account_uuid')
            .notNullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table.text('snowflake_login').nullable();
        table.text('twin_name_override').nullable();
        table.text('public_key').nullable();
        table.text('public_key_fingerprint').nullable();
        table.binary('encrypted_private_key').nullable();
        table.text('status').notNullable().defaultTo('pending');
        table.text('failure_reason').nullable();
        table.text('status_message').nullable();
        table.timestamp('checked_at', { useTz: true }).nullable();
        table.timestamps(true, true);
        table.unique(['ai_identity_account_uuid', 'user_uuid']);
        table.index(['ai_identity_account_uuid', 'status', 'failure_reason']);
    });
    await knex.raw(
        "ALTER TABLE ai_identities ADD CONSTRAINT ai_identities_status_check CHECK (status IN ('pending', 'ready', 'failed'))",
    );
    await knex.schema.createTable('ai_identity_events', (table) => {
        table
            .uuid('ai_identity_event_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('ai_identity_account_uuid')
            .nullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('SET NULL')
            .index();
        table
            .uuid('ai_identity_uuid')
            .nullable()
            .references('ai_identity_uuid')
            .inTable('ai_identities')
            .onDelete('SET NULL')
            .index();
        table.text('actor_type').notNullable();
        table
            .uuid('actor_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.text('action').notNullable();
        table.integer('target_count').notNullable().defaultTo(0);
        table.text('status').notNullable();
        table.text('detail').nullable();
        table
            .timestamp('created_at', { useTz: true })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
    await knex.raw(
        "ALTER TABLE ai_identity_events ADD CONSTRAINT ai_identity_events_actor_type_check CHECK (actor_type IN ('user', 'api', 'scheduler'))",
    );
    await knex.raw(
        "ALTER TABLE ai_identity_events ADD CONSTRAINT ai_identity_events_status_check CHECK (status IN ('success', 'error'))",
    );
    await knex.raw(
        'CREATE INDEX ai_identity_events_org_created_desc_idx ON ai_identity_events (organization_uuid, created_at DESC)',
    );
    await knex.schema.createTable('ai_identity_jobs', (table) => {
        table
            .uuid('job_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('ai_identity_account_uuid')
            .notNullable()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE')
            .index();
        table.text('kind').notNullable();
        table.text('status').notNullable().defaultTo('queued');
        table.jsonb('filter').notNullable();
        table.text('format').nullable();
        table.text('role_for_twin').nullable();
        table.integer('total').notNullable().defaultTo(0);
        table.integer('done').notNullable().defaultTo(0);
        table.text('file_url').nullable();
        table.text('error').nullable();
        table
            .uuid('created_by_user_uuid')
            .nullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL')
            .index();
        table.timestamps(true, true);
    });
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_kind_check CHECK (kind IN ('test', 'export', 'sync'))",
    );
    await knex.raw(
        "ALTER TABLE ai_identity_jobs ADD CONSTRAINT ai_identity_jobs_status_check CHECK (status IN ('queued', 'running', 'done', 'failed'))",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_identity_jobs');
    await knex.schema.dropTable('ai_identity_events');
    await knex.schema.dropTable('ai_identities');
    await knex.schema.dropTable('ai_identity_accounts');
}
