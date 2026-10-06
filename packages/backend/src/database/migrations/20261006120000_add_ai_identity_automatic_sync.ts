import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Adds optional automatic AI grant sync settings without changing existing identity rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('ai_identity_automatic_sync', (table) => {
        table
            .uuid('ai_identity_account_uuid')
            .primary()
            .references('ai_identity_account_uuid')
            .inTable('ai_identity_accounts')
            .onDelete('CASCADE');
        table.boolean('enabled').notNullable().defaultTo(false);
        table.boolean('pending').notNullable().defaultTo(false);
        table.text('status').nullable();
        table.timestamp('last_run_at', { useTz: true }).nullable();
        table.jsonb('managed_scope').notNullable().defaultTo('[]');
        table.jsonb('issues').notNullable().defaultTo('[]');
        table.integer('progress').notNullable().defaultTo(0);
        table.timestamps(true, true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('ai_identity_automatic_sync');
}
