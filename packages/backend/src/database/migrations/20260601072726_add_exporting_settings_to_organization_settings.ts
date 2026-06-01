import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const BASE_COLUMN = 'scheduled_delivery_expiration_seconds';
const EMAIL_COLUMN = 'scheduled_delivery_expiration_seconds_email';
const SLACK_COLUMN = 'scheduled_delivery_expiration_seconds_slack';
const MSTEAMS_COLUMN = 'scheduled_delivery_expiration_seconds_msteams';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        // Per-org base override (seconds) for how long scheduled-delivery
        // download links stay valid. Nullable with no stored default, so
        // NULL/absent inherits PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS.
        table.integer(BASE_COLUMN).nullable();
        // Optional per-channel overrides; NULL/absent inherits the base above.
        table.integer(EMAIL_COLUMN).nullable();
        table.integer(SLACK_COLUMN).nullable();
        table.integer(MSTEAMS_COLUMN).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.dropColumn(BASE_COLUMN);
        table.dropColumn(EMAIL_COLUMN);
        table.dropColumn(SLACK_COLUMN);
        table.dropColumn(MSTEAMS_COLUMN);
    });
}
