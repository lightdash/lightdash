import { Knex } from 'knex';

const AppsTableName = 'apps';
const UpstreamAppUuidColumn = 'upstream_app_uuid';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTableName, (table) => {
        // Link from a preview app to the production app it was promoted into.
        // Stored on the preview side so one production app can be the upstream
        // of many preview apps (a project can have many preview projects).
        table
            .uuid(UpstreamAppUuidColumn)
            .nullable()
            .references('app_id')
            .inTable(AppsTableName)
            .onDelete('SET NULL')
            .index();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppsTableName, (table) => {
        table.dropColumn(UpstreamAppUuidColumn);
    });
}
