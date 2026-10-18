import { Knex } from 'knex';

const SavedQueriesVersionsTableName = 'saved_queries_versions';
const SavedQueryVersionPipelinesTableName = 'saved_queries_version_pipelines';

/**
 * A chart version can draw a composer pipeline instead of a metric query.
 *
 * Its own table, like the merge table and the other per-version tables:
 * saved_queries_versions grows a row on every save of every chart and is
 * read on every chart load, and almost no version has a pipeline.
 *
 * Nothing is backfilled: existing versions have no pipeline.
 */
export async function up(knex: Knex): Promise<void> {
    const exists = await knex.schema.hasTable(
        SavedQueryVersionPipelinesTableName,
    );
    if (exists) return;
    await knex.raw("SET LOCAL lock_timeout = '5s'");

    await knex.schema.createTable(
        SavedQueryVersionPipelinesTableName,
        (table) => {
            // The version owns the pipeline one-to-one, so the version id is
            // the key. Chart versions are immutable, so this is insert-only.
            table
                .integer('saved_queries_version_id')
                .primary()
                .notNullable()
                .references('saved_queries_version_id')
                .inTable(SavedQueriesVersionsTableName)
                .onDelete('CASCADE');

            // Column, not a key inside the payload, so old shapes can be
            // found and migrated without scanning jsonb.
            table.integer('schema_version').notNullable().defaultTo(1);

            // The nodes, the terminal node id and the terminal result's
            // columns as they were when the chart was saved.
            table.jsonb('pipeline').notNullable();

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(SavedQueryVersionPipelinesTableName);
}
