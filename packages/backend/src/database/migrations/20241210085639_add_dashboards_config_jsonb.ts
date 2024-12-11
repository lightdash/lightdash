import { Knex } from 'knex';

const DASHBOARDS_VERSION_TABLE = 'dashboard_versions';
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARDS_VERSION_TABLE, (table) => {
        table.jsonb('config').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(DASHBOARDS_VERSION_TABLE, (table) => {
        table.dropColumn('config');
    });
}
