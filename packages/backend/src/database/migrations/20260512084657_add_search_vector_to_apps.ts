import { type Knex } from 'knex';
import { AppsTableName } from '../entities/apps';

const customSearchConfigName = 'lightdash_english_config';
const indexName = 'apps_search_vector_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${AppsTableName} ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('${customSearchConfigName}', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('${customSearchConfigName}', coalesce(description, '')), 'B')
        ) STORED;
    `);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.index('search_vector', indexName, 'GIN');
    });
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AppsTableName, 'search_vector')) {
        await knex.schema.alterTable(AppsTableName, (table) => {
            table.dropColumn('search_vector');
        });
    }
}
