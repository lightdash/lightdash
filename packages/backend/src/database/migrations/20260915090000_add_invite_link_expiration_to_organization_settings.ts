import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const INVITE_LINK_EXPIRATION_DAYS_COLUMN = 'invite_link_expiration_days';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
            table.integer(INVITE_LINK_EXPIRATION_DAYS_COLUMN).nullable();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET lock_timeout = '5s'");
    try {
        await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
            table.dropColumn(INVITE_LINK_EXPIRATION_DAYS_COLUMN);
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
