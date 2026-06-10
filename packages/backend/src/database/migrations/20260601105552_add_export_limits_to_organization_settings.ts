import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const QUERY_LIMIT_COLUMN = 'query_limit';
const CSV_CELLS_LIMIT_COLUMN = 'csv_cells_limit';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        // Per-org export limits. Nullable with no stored default, so NULL/absent
        // inherits the instance LIGHTDASH_QUERY_MAX_LIMIT / LIGHTDASH_CSV_CELLS_LIMIT.
        table.integer(QUERY_LIMIT_COLUMN).nullable();
        table.integer(CSV_CELLS_LIMIT_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.dropColumn(QUERY_LIMIT_COLUMN);
        table.dropColumn(CSV_CELLS_LIMIT_COLUMN);
    });
}
