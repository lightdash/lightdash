import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const COLUMN = 'data_app_automatic_thumbnails_enabled';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
            table.boolean(COLUMN).nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
            table.dropColumn(COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
