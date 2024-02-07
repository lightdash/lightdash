import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // add search_vector column to dashboards table
    await knex.raw(`
      ALTER TABLE dashboards ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED;
    `);

    // create index on search_vector column
    await knex.schema.alterTable('dashboards', (table) => {
        table.index('search_vector', 'dashboards_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector column
    await knex
        .update({
            name: knex.raw('name'),
            description: knex.raw('description'),
        })
        .into('dashboards');
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn('dashboards', 'search_vector')) {
        await knex.schema.alterTable('dashboards', (table) => {
            table.dropColumn('search_vector');
        });
    }

    if (await knex.schema.hasTable('dashboards_search_vector_idx')) {
        await knex.schema.alterTable('dashboards', (table) => {
            table.dropIndex('dashboards_search_vector_idx');
        });
    }
}
