import { Knex } from 'knex';

const DashboardTabsTableName = 'dashboard_tabs';
const DashboardTilesTableName = 'dashboard_tiles';
const TabUuidColumnName = 'tab_uuid';
const UuidColumnName = 'uuid';

export async function up(knex: Knex): Promise<void> {
    // Drop the foreign key constraint first
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.dropForeign([TabUuidColumnName, 'dashboard_version_id']);
    });

    // Drop the primary key on dashboard_tabs (uuid + dashboard_version_id)
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.dropPrimary();
    });

    // Change dashboard_tabs.uuid from UUID to VARCHAR(255)
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.string(UuidColumnName, 255).notNullable().alter();
    });

    // Change dashboard_tiles.tab_uuid from UUID to VARCHAR(255)
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.string(TabUuidColumnName, 255).nullable().alter();
    });

    // Recreate the primary key on dashboard_tabs
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.primary([UuidColumnName, 'dashboard_version_id']);
    });

    // Recreate the foreign key constraint
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table
            .foreign([TabUuidColumnName, 'dashboard_version_id'])
            .references([UuidColumnName, 'dashboard_version_id'])
            .inTable(DashboardTabsTableName)
            .onDelete('CASCADE');
    });
}

export async function down(knex: Knex): Promise<void> {
    // Drop the foreign key constraint first
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.dropForeign([TabUuidColumnName, 'dashboard_version_id']);
    });

    // Drop the primary key on dashboard_tabs
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.dropPrimary();
    });

    // Change dashboard_tabs.uuid back to UUID
    // Note: This will fail if there are non-UUID values in the column
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.uuid(UuidColumnName).notNullable().alter();
    });

    // Change dashboard_tiles.tab_uuid back to UUID
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table.uuid(TabUuidColumnName).nullable().alter();
    });

    // Recreate the primary key on dashboard_tabs
    await knex.schema.alterTable(DashboardTabsTableName, (table) => {
        table.primary([UuidColumnName, 'dashboard_version_id']);
    });

    // Recreate the foreign key constraint
    await knex.schema.alterTable(DashboardTilesTableName, (table) => {
        table
            .foreign([TabUuidColumnName, 'dashboard_version_id'])
            .references([UuidColumnName, 'dashboard_version_id'])
            .inTable(DashboardTabsTableName)
            .onDelete('CASCADE');
    });
}
