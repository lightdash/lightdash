import { Knex } from 'knex';
import { DashboardsTableName } from '../entities/dashboards';
import { SavedChartsTableName } from '../entities/savedCharts';
import { SpaceTableName } from '../entities/spaces';

const customDictionaryName = `lightdash_english_dict`;
const customSearchConfigName = `lightdash_english_config`;

export async function up(knex: Knex): Promise<void> {
    // create custom text search dictionary
    await knex.schema.raw(`
      CREATE TEXT SEARCH DICTIONARY ${customDictionaryName} (
          template = snowball,
          language = english
      )
  `);

    // create a configuration file for stopwords
    await knex.raw(`
      CREATE TEXT SEARCH CONFIGURATION ${customSearchConfigName} (
          copy = english
      )
  `);

    // add the stopwords to the configuration file
    await knex.raw(`
      ALTER TEXT SEARCH CONFIGURATION ${customSearchConfigName}
          ALTER MAPPING FOR asciiword, asciihword, hword_asciipart, hword, hword_part
          WITH ${customDictionaryName}
  `);

    // add search_vector column to spaces table
    await knex.raw(`
        ALTER TABLE ${SpaceTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            to_tsvector('${customSearchConfigName}', coalesce(name, ''))
        ) STORED;
    `);

    // create index on spaces search_vector column
    await knex.schema.alterTable(SpaceTableName, (table) => {
        table.index('search_vector', 'spaces_search_vector_idx', 'GIN');
    });

    // add search_vector column to savedCharts table
    await knex.raw(`
        ALTER TABLE ${SavedChartsTableName} ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
            setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
        ) STORED;
    `);

    // create index on charts search_vector column
    await knex.schema.alterTable(SavedChartsTableName, (table) => {
        table.index('search_vector', 'charts_search_vector_idx', 'GIN');
    });

    // add search_vector column to dashboards table
    await knex.raw(`
        ALTER TABLE ${DashboardsTableName} ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
            setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
        ) STORED;
    `);

    // create index on dashboards search_vector column
    await knex.schema.alterTable(DashboardsTableName, (table) => {
        table.index('search_vector', 'dashboards_search_vector_idx', 'GIN');
    });

    // backfilling the search_vector columns
    await knex
        .update({
            name: knex.raw('name'),
        })
        .into(SpaceTableName);

    await knex
        .update({
            name: knex.raw('name'),
            description: knex.raw('description'),
        })
        .into(SavedChartsTableName);

    await knex
        .update({
            name: knex.raw('name'),
            description: knex.raw('description'),
        })
        .into(DashboardsTableName);
}

export async function down(knex: Knex): Promise<void> {
    // when column is dropped, index is dropped as well
    if (await knex.schema.hasColumn(SpaceTableName, 'search_vector')) {
        await knex.schema.alterTable(SpaceTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }

    if (await knex.schema.hasColumn(SavedChartsTableName, 'search_vector')) {
        await knex.schema.alterTable(SavedChartsTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }

    if (await knex.schema.hasColumn(DashboardsTableName, 'search_vector')) {
        await knex.schema.alterTable(DashboardsTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }

    // drop search configuration
    await knex.schema.raw(`
        DROP TEXT SEARCH CONFIGURATION IF EXISTS ${customSearchConfigName};
    `);

    // drop search dictionary
    await knex.schema.raw(`
        DROP TEXT SEARCH DICTIONARY IF EXISTS ${customDictionaryName};
    `);
}
