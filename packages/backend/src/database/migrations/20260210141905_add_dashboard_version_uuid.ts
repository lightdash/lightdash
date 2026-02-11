import { Knex } from 'knex';

const DASHBOARD_VERSIONS_TABLE = 'dashboard_versions';

export async function up(knex: Knex): Promise<void> {
    // Add UUID column with default
    await knex.schema.alterTable(DASHBOARD_VERSIONS_TABLE, (table) => {
        table
            .uuid('dashboard_version_uuid')
            .defaultTo(knex.raw('uuid_generate_v4()'))
            .notNullable();
    });

    // Add unique index
    await knex.schema.alterTable(DASHBOARD_VERSIONS_TABLE, (table) => {
        table.unique(['dashboard_version_uuid']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARD_VERSIONS_TABLE, (table) => {
        table.dropColumn('dashboard_version_uuid');
    });
}
