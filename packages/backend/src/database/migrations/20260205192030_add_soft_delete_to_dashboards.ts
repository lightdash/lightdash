import { Knex } from 'knex';

const DashboardsTableName = 'dashboards';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardsTableName, (table) => {
        table.timestamp('deleted_at', { useTz: false }).nullable();
        table.uuid('deleted_by_user_uuid').nullable(); // No FK constraint - user may be deleted
    });

    // Partial index for fast queries on non-deleted items
    await knex.raw(`
        CREATE INDEX idx_dashboards_not_deleted
        ON ${DashboardsTableName} (dashboard_uuid)
        WHERE deleted_at IS NULL
    `);

    // Partial index for fast queries on deleted items (Recently Deleted page)
    await knex.raw(`
        CREATE INDEX idx_dashboards_deleted
        ON ${DashboardsTableName} (dashboard_uuid)
        WHERE deleted_at IS NOT NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP INDEX IF EXISTS idx_dashboards_deleted');
    await knex.raw('DROP INDEX IF EXISTS idx_dashboards_not_deleted');
    await knex.schema.alterTable(DashboardsTableName, (table) => {
        table.dropColumn('deleted_at');
        table.dropColumn('deleted_by_user_uuid');
    });
}
