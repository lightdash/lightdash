import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.boolean('ai_require_oauth').defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.dropColumn('ai_require_oauth');
    });
}
