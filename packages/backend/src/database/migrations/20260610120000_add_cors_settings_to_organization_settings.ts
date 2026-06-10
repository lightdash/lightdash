import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';
const CORS_ALLOWED_DOMAINS_COLUMN = 'cors_allowed_domains';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.specificType(CORS_ALLOWED_DOMAINS_COLUMN, 'text[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        table.dropColumn(CORS_ALLOWED_DOMAINS_COLUMN);
    });
}
