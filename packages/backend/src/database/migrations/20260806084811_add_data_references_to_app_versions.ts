import { type Knex } from 'knex';

const AppVersionsTableName = 'app_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.jsonb('data_references').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.dropColumn('data_references');
    });
}
