import { Knex } from 'knex';

const SavedQueriesVersionsTableName = 'saved_queries_versions';
const SavedQueryVersionMergesTableName = 'saved_queries_version_merges';

/**
 * A chart version can merge its query with additional queries.
 *
 * Kept in its own table rather than as a column on saved_queries_versions,
 * following the same shape as the other per-version tables (fields, sorts,
 * table calculations). That table grows a row on every save of every chart and
 * is read on every chart load; almost no version has a merge, so a column would
 * widen every one of those reads for a value that is nearly always absent.
 *
 * Nothing is backfilled. Existing versions have no merge, which is true rather
 * than missing, so this migration creates an empty table and touches no
 * existing row.
 */
export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable(SavedQueryVersionMergesTableName);
    if (exists) return;

    await knex.schema.createTable(SavedQueryVersionMergesTableName, (table) => {
        // The version owns the merge one-to-one, so the version id is the
        // key. Chart versions are immutable, so this is insert-only.
        table
            .integer('saved_queries_version_id')
            .primary()
            .notNullable()
            .references('saved_queries_version_id')
            .inTable(SavedQueriesVersionsTableName)
            .onDelete('CASCADE');

        // Column, not a key inside the payload, so future shapes can be found
        // and migrated without scanning jsonb. Version 1 never shipped; this
        // table starts at the canonical sources[] representation.
        table.integer('schema_version').notNullable().defaultTo(2);

        // Holds sources[] and their relationship. The chart query is referenced
        // rather than copied, avoiding two sources of truth.
        table.jsonb('merge').notNullable();

        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(SavedQueryVersionMergesTableName);
}
