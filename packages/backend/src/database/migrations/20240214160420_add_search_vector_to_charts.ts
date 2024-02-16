import { Knex } from 'knex';
import { SavedChartsTableName } from '../entities/savedCharts';

export async function up(knex: Knex): Promise<void> {
    // add search_vector column to savedCharts table
    await knex.raw(`
      ALTER TABLE ${SavedChartsTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('lightdash_english_config', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('lightdash_english_config', coalesce(description, '')), 'B')
      ) STORED;
    `);

    // create index on search_vector column
    await knex.schema.alterTable(SavedChartsTableName, (table) => {
        table.index('search_vector', 'charts_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector column
    await knex
        .update({
            name: knex.raw('name'),
            description: knex.raw('description'),
        })
        .into(SavedChartsTableName);
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SavedChartsTableName, 'search_vector')) {
        await knex.schema.alterTable(SavedChartsTableName, (table) => {
            // when column is dropped, index is dropped as well
            table.dropColumn('search_vector');
        });
    }
}
