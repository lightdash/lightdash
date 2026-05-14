import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.boolean('unfurls_enabled').defaultTo(true);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table('slack_auth_tokens', (table) => {
        table.dropColumn('unfurls_enabled');
    });
}
