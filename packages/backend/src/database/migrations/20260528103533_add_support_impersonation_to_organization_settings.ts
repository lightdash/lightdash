import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const SUPPORT_IMPERSONATION_COLUMN = 'support_impersonation_enabled';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        // Per-org consent for the Lightdash support team to impersonate users
        // while helping with a support request. Opt-in only: nullable with no
        // env default, so NULL/absent is treated as false (not opted in).
        table.boolean(SUPPORT_IMPERSONATION_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.dropColumn(SUPPORT_IMPERSONATION_COLUMN);
    });
}
