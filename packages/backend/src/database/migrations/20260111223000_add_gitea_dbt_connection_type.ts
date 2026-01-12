import { Knex } from 'knex';

const DbtConnectionTypesTableName = 'dbt_connection_types';
const DbtConnectionTypeColumnName = 'dbt_connection_type';
const GITEA_CONNECTION_TYPE = 'gitea';

export async function up(knex: Knex): Promise<void> {
    await knex(DbtConnectionTypesTableName)
        .insert([{ [DbtConnectionTypeColumnName]: GITEA_CONNECTION_TYPE }])
        .onConflict(DbtConnectionTypeColumnName)
        .ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex(DbtConnectionTypesTableName)
        .delete()
        .where(DbtConnectionTypeColumnName, GITEA_CONNECTION_TYPE);
}
