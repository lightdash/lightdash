import { Knex } from 'knex';

const DbtConnectionTypesTableName = 'dbt_connection_types';
const DbtConnectionTypeColumnName = 'dbt_connection_type';

export async function up(knex: Knex): Promise<void> {
    await knex(DbtConnectionTypesTableName).insert([
        { [DbtConnectionTypeColumnName]: 'azure_devops' },
    ]);
}

export async function down(knex: Knex): Promise<void> {
    await knex(DbtConnectionTypesTableName)
        .delete()
        .where(DbtConnectionTypeColumnName, 'azure_devops');
}
