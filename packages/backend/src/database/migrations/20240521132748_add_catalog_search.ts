import { Knex } from 'knex';

export const CATALOG_SEARCH_TABLE_NAME = 'catalog_search';
const customSearchConfigName = `lightdash_english_config`;

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(CATALOG_SEARCH_TABLE_NAME))) {
        await knex.schema.createTable(
            CATALOG_SEARCH_TABLE_NAME,
            (tableBuilder) => {
                tableBuilder
                    .uuid('cached_explore_uuid')
                    .notNullable()
                    .references('cached_explore_uuid')
                    .inTable('cached_explore')
                    .onDelete('CASCADE');
                tableBuilder
                    .uuid('project_uuid')
                    .notNullable()
                    .references('project_uuid')
                    .inTable('projects')
                    .onDelete('CASCADE')
                    .index();
                tableBuilder.text('name').notNullable();
                tableBuilder.text('description').nullable();
                tableBuilder.string('type').notNullable();
            },
        );

        // add search_vector column to catalog table
        await knex.raw(`
            ALTER TABLE ${CATALOG_SEARCH_TABLE_NAME} ADD COLUMN search_vector tsvector
                GENERATED ALWAYS AS (
                setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
                setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
            ) STORED;
        `);

        // create index on catalog search_vector column
        await knex.schema.alterTable(CATALOG_SEARCH_TABLE_NAME, (table) => {
            table.index('search_vector', 'catalog_search_vector_idx', 'GIN');
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(CATALOG_SEARCH_TABLE_NAME);
}
