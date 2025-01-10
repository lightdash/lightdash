import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';
const customSearchConfigName = `lightdash_english_config`;

export async function up(knex: Knex): Promise<void> {
    // Add label column
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.text('label').nullable();
    });

    // Update search vector to include label
    await knex.raw(`
        ALTER TABLE ${CatalogTableName} DROP COLUMN search_vector;
        ALTER TABLE ${CatalogTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(label, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
        ) STORED;
    `);

    // Recreate the index
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.index('search_vector', 'catalog_search_vector_idx', 'GIN');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Revert search vector to original
    await knex.raw(`
        ALTER TABLE ${CatalogTableName} DROP COLUMN search_vector;
        ALTER TABLE ${CatalogTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
        ) STORED;
    `);

    // Drop label column
    await knex.schema.alterTable(CatalogTableName, (table) => {
        table.dropColumn('label');
    });
}
