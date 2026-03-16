import { Knex } from 'knex';

const CATALOG_TABLE = 'catalog_search';
const INDEX_NAME = 'catalog_search_project_has_time_dimension_idx';

// Disable transaction wrapping so CREATE INDEX CONCURRENTLY can be used.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(CATALOG_TABLE, (table) => {
        table.boolean('has_time_dimension').notNullable().defaultTo(false);
    });

    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}" ON "${CATALOG_TABLE}" (project_uuid, has_time_dimension)`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);

    await knex.schema.alterTable(CATALOG_TABLE, (table) => {
        table.dropColumn('has_time_dimension');
    });
}
