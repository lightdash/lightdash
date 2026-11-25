import { Knex } from 'knex';

const PersonalAccessTokensTableName = 'personal_access_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(PersonalAccessTokensTableName, (table) => {
        table.boolean('cli_oauth_pat_compat').defaultTo(false).notNullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(PersonalAccessTokensTableName, (table) => {
        table.dropColumn('cli_oauth_pat_compat');
    });
}
