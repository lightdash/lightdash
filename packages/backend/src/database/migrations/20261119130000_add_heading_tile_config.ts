import { Knex } from 'knex';

const DASHBOARD_TILE_HEADINGS_TABLE = 'dashboard_tile_headings';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        // Versioned formatting settings; null means every default
        table.jsonb('heading_config').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(DASHBOARD_TILE_HEADINGS_TABLE, (table) => {
        table.dropColumn('heading_config');
    });
}
