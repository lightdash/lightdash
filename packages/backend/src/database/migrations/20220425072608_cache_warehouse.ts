import { Knex } from 'knex';

const CACHED_WAREHOUSE_TABLE_NAME = 'cached_warehouse';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CACHED_WAREHOUSE_TABLE_NAME))) {
        await knex.schema.createTable(
            CACHED_WAREHOUSE_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder.uuid('project_uuid').primary();
                tableBuilder.jsonb('warehouse').notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CACHED_WAREHOUSE_TABLE_NAME);
}
