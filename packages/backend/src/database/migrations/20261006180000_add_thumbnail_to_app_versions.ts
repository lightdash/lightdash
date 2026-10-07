import { type Knex } from 'knex';

const AppVersionsTableName = 'app_versions';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        // Null while the version has no thumbnail.
        table.timestamp('thumbnail_captured_at', { useTz: true }).nullable();
        table.boolean('thumbnail_is_manual').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.dropColumn('thumbnail_captured_at');
        table.dropColumn('thumbnail_is_manual');
    });
}
