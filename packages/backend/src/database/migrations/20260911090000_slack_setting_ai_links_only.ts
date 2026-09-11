import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.boolean('ai_links_only').notNullable().defaultTo(false);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.dropColumn('ai_links_only');
    });
}
