import { Knex } from 'knex';

const TABLE_NAME = 'organization_settings';
const COLUMN_NAME = 'organization_chart_types_enabled';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.boolean(COLUMN_NAME).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(TABLE_NAME, (table) => {
        table.dropColumn(COLUMN_NAME);
    });
}
