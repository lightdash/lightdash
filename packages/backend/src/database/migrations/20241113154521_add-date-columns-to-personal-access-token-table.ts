import { Knex } from 'knex';

const PersonalAccessTokensTableName = 'personal_access_tokens';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(PersonalAccessTokensTableName)) {
        await knex.schema.table(PersonalAccessTokensTableName, (table) => {
            table.timestamp('rotated_at', { useTz: false }).nullable();
            table.timestamp('last_used_at', { useTz: false }).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(PersonalAccessTokensTableName)) {
        await knex.schema.table(PersonalAccessTokensTableName, (table) => {
            table.dropColumn('rotated_at');
            table.dropColumn('last_used_at');
        });
    }
}
