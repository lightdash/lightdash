import { Knex } from 'knex';

const DashboardViewsTableName = 'dashboard_views';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardViewsTableName, (table) => {
        table.jsonb('parameters').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DashboardViewsTableName, (table) => {
        table.dropColumn('parameters');
    });
}
