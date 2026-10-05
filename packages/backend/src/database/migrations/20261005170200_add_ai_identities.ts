import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a new identity table and nullable project setting without changing existing data.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('projects', (table) => {
        table.text('ai_twin_name_template').nullable();
    });
    await knex.schema.createTable('ai_identities', (table) => {
        table
            .uuid('ai_identity_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
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
        table.text('public_key').notNullable();
        table.text('public_key_fingerprint').notNullable();
        table.binary('encrypted_private_key').notNullable();
        table.text('status').notNullable().defaultTo('pending');
        table.text('status_message').nullable();
        table.timestamp('checked_at', { useTz: true }).nullable();
        table.timestamps(true, true);
        table.unique(['project_uuid', 'user_uuid']);
    });
    await knex.raw(
        "ALTER TABLE ai_identities ADD CONSTRAINT ai_identities_status_check CHECK (status IN ('pending', 'ready', 'failed'))",
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_identities');
    await knex.schema.alterTable('projects', (table) => {
        table.dropColumn('ai_twin_name_template');
    });
}
