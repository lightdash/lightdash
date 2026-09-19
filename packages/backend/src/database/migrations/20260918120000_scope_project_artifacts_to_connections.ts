import { type Knex } from 'knex';

// A later contract PR removes the legacy tables after no supported binary reads them.

export const classification = {
    kind: 'safe',
    reason: 'Adds connection-scoped artifact storage and nullable staging metadata without changing legacy contracts.',
} as const;

const CatalogCacheTable = 'project_connection_catalog_cache';
const ManifestsTable = 'project_connection_manifests';
const CachedExploreStagingTable = 'cached_explore_staging';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        `ALTER TABLE ${CachedExploreStagingTable} ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL`,
    );
    if (!(await knex.schema.hasTable(CatalogCacheTable))) {
        await knex.schema.createTable(CatalogCacheTable, (table) => {
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .uuid('connection_uuid')
                .notNullable()
                .references('warehouse_credentials_uuid')
                .inTable('warehouse_credentials')
                .onDelete('CASCADE')
                .index();
            table.jsonb('warehouse').notNullable();
            table.primary(['project_uuid', 'connection_uuid']);
        });
    }
    if (!(await knex.schema.hasTable(ManifestsTable))) {
        await knex.schema.createTable(ManifestsTable, (table) => {
            table
                .uuid('project_uuid')
                .notNullable()
                .references('project_uuid')
                .inTable('projects')
                .onDelete('CASCADE');
            table
                .uuid('connection_uuid')
                .notNullable()
                .references('warehouse_credentials_uuid')
                .inTable('warehouse_credentials')
                .onDelete('CASCADE')
                .index();
            table.binary('manifest').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['project_uuid', 'connection_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists(ManifestsTable);
    await knex.schema.dropTableIfExists(CatalogCacheTable);
    await knex.raw(
        `ALTER TABLE ${CachedExploreStagingTable} DROP COLUMN IF EXISTS connection_uuid`,
    );
}
