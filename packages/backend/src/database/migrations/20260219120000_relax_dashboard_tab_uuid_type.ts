import { Knex } from 'knex';

const DashboardTabsTableName = 'dashboard_tabs';
const DashboardTilesTableName = 'dashboard_tiles';

export async function up(knex: Knex): Promise<void> {
    // Drop the composite foreign key on dashboard_tiles(tab_uuid, dashboard_version_id)
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.dropForeign(['tab_uuid', 'dashboard_version_id']);
    });

    // Drop the composite primary key on dashboard_tabs(uuid, dashboard_version_id)
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.dropPrimary();
    });

    // Change dashboard_tabs.uuid from uuid to text
    await knex.raw(
        `ALTER TABLE ${DashboardTabsTableName} ALTER COLUMN uuid TYPE text`,
    );

    // Change dashboard_tiles.tab_uuid from uuid to text
    await knex.raw(
        `ALTER TABLE ${DashboardTilesTableName} ALTER COLUMN tab_uuid TYPE text`,
    );

    // Re-add the composite primary key on dashboard_tabs
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.primary(['uuid', 'dashboard_version_id']);
    });

    // Re-add the composite foreign key on dashboard_tiles
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table
            .foreign(['tab_uuid', 'dashboard_version_id'])
            .references(['uuid', 'dashboard_version_id'])
            .inTable(DashboardTabsTableName)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop the composite foreign key on dashboard_tiles
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.dropForeign(['tab_uuid', 'dashboard_version_id']);
    });

    // Drop the composite primary key on dashboard_tabs
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.dropPrimary();
    });

    // Change dashboard_tiles.tab_uuid back to uuid
    // NOTE: This will fail if any non-UUID values exist in the column
    await knex.raw(
        `ALTER TABLE ${DashboardTilesTableName} ALTER COLUMN tab_uuid TYPE uuid USING tab_uuid::uuid`,
    );

    // Change dashboard_tabs.uuid back to uuid
    // NOTE: This will fail if any non-UUID values exist in the column
    await knex.raw(
        `ALTER TABLE ${DashboardTabsTableName} ALTER COLUMN uuid TYPE uuid USING uuid::uuid`,
    );

    // Re-add the composite primary key
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.primary(['uuid', 'dashboard_version_id']);
    });

    // Re-add the composite foreign key
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table
            .foreign(['tab_uuid', 'dashboard_version_id'])
            .references(['uuid', 'dashboard_version_id'])
            .inTable(DashboardTabsTableName)
            .onDelete('CASCADE');
    });
}
