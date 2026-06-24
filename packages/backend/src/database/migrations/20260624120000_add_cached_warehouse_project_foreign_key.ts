import { Knex } from 'knex';

const TABLE = 'cached_warehouse';

/**
 * cached_warehouse.project_uuid (NOT NULL) never had a foreign key. Following the
 * precedent of 20231101164443_add_cache_explores_foreign_key, delete the orphan
 * cache rows whose project was hard-deleted, then add a validated CASCADE FK.
 * cached_warehouse is a regenerable per-project cache, so deleting orphans is
 * non-destructive. project_uuid is already the primary key, so it is indexed.
 */
export async function up(knex: Knex): Promise<void> {
    await knex(TABLE)
        .whereNotExists(
            knex('projects')
                .select('project_id')
                .whereRaw(
                    'projects.project_uuid = cached_warehouse.project_uuid',
                ),
        )
        .delete();

    await knex.schema.alterTable(TABLE, (table) => {
        table
            .foreign('project_uuid')
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE, (table) => {
        table.dropForeign('project_uuid');
    });
}
