import { Knex } from 'knex';

const WAREHOUSE_TYPES_TABLE = 'warehouse_types';
const WAREHOUSE_CREDENTIALS_TABLE = 'warehouse_credentials';

export async function up(knex: Knex): Promise<void> {
    await knex(WAREHOUSE_TYPES_TABLE).insert({
        warehouse_type: 'duckdb',
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex(WAREHOUSE_CREDENTIALS_TABLE)
        .where('warehouse_type', 'duckdb')
        .delete();
    await knex(WAREHOUSE_TYPES_TABLE)
        .where('warehouse_type', 'duckdb')
        .delete();
}
