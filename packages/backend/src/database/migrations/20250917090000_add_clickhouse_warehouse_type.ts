import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('warehouse_types').insert([{ warehouse_type: 'clickhouse' }]);
}

export async function down(knex: Knex): Promise<void> {
    await knex('warehouse_credentials')
        .delete()
        .where('warehouse_type', 'clickhouse');
    await knex('warehouse_types')
        .delete()
        .where('warehouse_type', 'clickhouse');
}
