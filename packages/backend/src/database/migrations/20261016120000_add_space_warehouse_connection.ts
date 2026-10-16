import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Add a nullable column that older binaries ignore without changing existing rows.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('spaces', (table) => {
        table
            .uuid('warehouse_connection_uuid')
            .nullable()
            .references('warehouse_connection_uuid')
            .inTable('warehouse_connections')
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('spaces', (table) => {
        table.dropColumn('warehouse_connection_uuid');
    });
}
