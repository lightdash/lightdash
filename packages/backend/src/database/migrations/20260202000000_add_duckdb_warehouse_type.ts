import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Check if duckdb already exists (idempotent migration)
    const existing = await knex('warehouse_types')
        .where('warehouse_type', 'duckdb')
        .first();

    if (!existing) {
        await knex('warehouse_types').insert([{ warehouse_type: 'duckdb' }]);
    }
}

export async function down(knex: Knex): Promise<void> {
    // Delete any warehouse credentials using duckdb first (FK constraint)
    await knex('warehouse_credentials')
        .delete()
        .where('warehouse_type', 'duckdb');

    // Then delete the warehouse type
    await knex('warehouse_types').delete().where('warehouse_type', 'duckdb');
}
