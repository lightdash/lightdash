import { type Knex } from 'knex';

const tableName = 'organization_settings';
const columnName = 'analytics_adoption_team_config';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.jsonb(columnName).nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn(columnName);
    });
}
