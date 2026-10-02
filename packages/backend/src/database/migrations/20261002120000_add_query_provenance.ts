import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable('query_history', (table) => {
        table.text('surface').nullable();
        table.text('ai_client').nullable();
        table.text('credential_kind').nullable();
        table.uuid('credential_uuid').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.alterTable('query_history', (table) => {
        table.dropColumn('credential_uuid');
        table.dropColumn('credential_kind');
        table.dropColumn('ai_client');
        table.dropColumn('surface');
    });
}
