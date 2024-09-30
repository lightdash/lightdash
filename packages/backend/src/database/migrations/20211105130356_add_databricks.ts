import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex('warehouse_types').insert([{ warehouse_type: 'databricks' }]);
}

export async function down(knex: Knex): Promise<void> {
    await knex('warehouse_credentials')
        .delete()
        .where('warehouse_type', 'databricks');
}
