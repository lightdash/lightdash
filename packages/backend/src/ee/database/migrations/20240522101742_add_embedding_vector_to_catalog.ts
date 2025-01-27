import { Knex } from 'knex';

const CatalogTableName = 'catalog_search';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

    await knex.raw(
        `ALTER TABLE ${CatalogTableName} ADD COLUMN IF NOT EXISTS embedding_vector vector`,
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ${CatalogTableName} DROP COLUMN IF EXISTS embedding_vector`,
    );

    await knex.raw('DROP EXTENSION IF EXISTS vector');
}
