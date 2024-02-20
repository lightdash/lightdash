import { Knex } from 'knex';
import { SpaceTableName } from '../entities/spaces';

const customSearchConfigName = `lightdash_english_config`;

export async function up(knex: Knex): Promise<void> {
    // drop search_vector column if it exists - don't think I can alter it since it is generated
    if (await knex.schema.hasColumn(SpaceTableName, 'search_vector')) {
        await knex.schema.alterTable(SpaceTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }

    // add search_vector column weighted by name
    await knex.raw(`
      ALTER TABLE ${SpaceTableName} ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
          setweight(to_tsvector('${customSearchConfigName}', name), 'A')
      ) STORED;
  `);

    // create index on spaces search_vector column
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.index('search_vector', 'spaces_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector columns
    await knex
        .update({
            name: knex.raw('name'),
        })
        .into(SpaceTableName);
}

export async function down(knex: Knex): Promise<void> {
    // drop search_vector column if it exists - don't think I can alter it since it is generated
    if (await knex.schema.hasColumn(SpaceTableName, 'search_vector')) {
        await knex.schema.alterTable(SpaceTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }

    // add search_vector column unweighted by name
    await knex.raw(`
      ALTER TABLE ${SpaceTableName} ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
          to_tsvector('${customSearchConfigName}', name)
      ) STORED;
  `);

    // create index on spaces search_vector column
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.index('search_vector', 'spaces_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector columns
    await knex
        .update({
            name: knex.raw('name'),
        })
        .into(SpaceTableName);
}
