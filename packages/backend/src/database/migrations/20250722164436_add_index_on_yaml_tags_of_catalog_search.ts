import { Knex } from 'knex';

const TABLE_NAME = 'catalog_search';
const COLUMN_NAME = 'yaml_tags';
const INDEX_NAME = 'catalog_search_yaml_tags_gin_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.index([COLUMN_NAME], INDEX_NAME, 'gin');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropIndex([COLUMN_NAME], INDEX_NAME);
    });
}
