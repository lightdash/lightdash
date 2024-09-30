import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.alterTable('dashboard_tile_sql_charts', (table) => {
        table.uuid('saved_sql_uuid').nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.alterTable('dashboard_tile_sql_charts', (table) => {
        table.uuid('saved_sql_uuid').notNullable().alter();
    });
}
