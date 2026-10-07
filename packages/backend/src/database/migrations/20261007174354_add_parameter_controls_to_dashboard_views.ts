import { type Knex } from 'knex';

const DashboardViewsTableName = 'dashboard_views';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DashboardViewsTableName, (table) => {
        // Null while the dashboard version has no parameter controls.
        table.jsonb('parameter_controls').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(DashboardViewsTableName, (table) => {
        table.dropColumn('parameter_controls');
    });
}
