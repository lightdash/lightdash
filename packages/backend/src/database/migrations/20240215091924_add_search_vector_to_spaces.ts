import { Knex } from 'knex';
import { SpaceTableName } from '../entities/spaces';

export async function up(knex: Knex): Promise<void> {
    // add search_vector column to spaces table
    await knex.raw(`
      ALTER TABLE ${SpaceTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(name, ''))
      ) STORED;
    `);

    // create index on search_vector column
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.index('search_vector', 'spaces_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector column
    await knex
        .update({
            name: knex.raw('name'),
        })
        .into(SpaceTableName);
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(SpaceTableName, 'search_vector')) {
        await knex.schema.alterTable(SpaceTableName, (table) => {
            // when column is dropped, index is dropped as well
            table.dropColumn('search_vector');
        });
    }
}
