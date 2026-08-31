import { Knex } from 'knex';

const AppsTableName = 'apps';
const AppVersionsTableName = 'app_versions';
const LOCK_TIMEOUT = '5s';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppsTableName, (table) => {
        table.text('registry_slug').nullable().index();
        table.text('registry_url').nullable();
        table
            .uuid('origin_app_uuid')
            .nullable()
            .references('app_id')
            .inTable(AppsTableName)
            .onDelete('SET NULL')
            .index();
        table.integer('origin_app_version').nullable();
    });
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.text('registry_version').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.dropColumn('registry_version');
    });
    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn('registry_slug');
        table.dropColumn('registry_url');
        table.dropColumn('origin_app_uuid');
        table.dropColumn('origin_app_version');
    });
}
